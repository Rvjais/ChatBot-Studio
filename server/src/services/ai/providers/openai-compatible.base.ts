import type { ProviderId } from '../../../config/providers.js';
import type {
  AIProvider,
  EmbedRequest,
  EmbedResult,
  GenerateRequest,
  GenerateResult,
  ModelInfo,
  ProviderCredentials,
  StreamEvent,
  TokenUsage,
} from '../ai-provider.interface.js';
import { AIProviderError } from '../errors.js';
import { joinUrl, parseSSE, providerFetch } from '../http.js';

interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  /** OpenRouter: credits charged (USD) when usage accounting is requested. */
  cost?: number;
}

const SAMPLING_ERROR = /temperature|top_p|frequency_penalty|presence_penalty|unsupported (parameter|value)|does not support/i;

/**
 * Adapter for the OpenAI Chat Completions wire format. OpenAI, DeepSeek, OpenRouter and
 * custom endpoints extend it and override only what differs (auth headers, token field
 * names, usage reporting, extra body fields).
 */
export abstract class OpenAICompatibleProvider implements AIProvider {
  abstract readonly id: ProviderId;
  protected abstract readonly defaultBaseUrl: string;

  protected baseUrl(creds: ProviderCredentials): string {
    const base = creds.baseUrl?.trim() || this.defaultBaseUrl;
    if (!base) throw new AIProviderError({ provider: this.id, code: 'config', detail: 'Base URL is required' });
    return base;
  }

  protected headers(creds: ProviderCredentials): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (creds.apiKey) headers.Authorization = `Bearer ${creds.apiKey}`;
    return headers;
  }

  /** Newer OpenAI models require max_completion_tokens; most compatible APIs use max_tokens. */
  protected maxTokensField(): 'max_tokens' | 'max_completion_tokens' {
    return 'max_tokens';
  }

  /** Extra provider-specific body fields. */
  protected extraBody(_stream: boolean): Record<string, unknown> {
    return {};
  }

  protected buildBody(req: GenerateRequest, stream: boolean, includeSampling: boolean): Record<string, unknown> {
    const p = req.params;
    const body: Record<string, unknown> = {
      model: req.model,
      messages: [...(req.system ? [{ role: 'system', content: req.system }] : []), ...req.messages],
      [this.maxTokensField()]: p.maxOutputTokens,
      stream,
      ...this.extraBody(stream),
    };
    if (includeSampling) {
      if (p.temperature !== undefined) body.temperature = p.temperature;
      if (p.topP !== undefined) body.top_p = p.topP;
      if (p.frequencyPenalty !== undefined) body.frequency_penalty = p.frequencyPenalty;
      if (p.presencePenalty !== undefined) body.presence_penalty = p.presencePenalty;
    }
    return body;
  }

  private hasSampling(req: GenerateRequest): boolean {
    const p = req.params;
    return [p.temperature, p.topP, p.frequencyPenalty, p.presencePenalty].some((v) => v !== undefined);
  }

  /**
   * Sends the request; if the model rejects sampling parameters (common with reasoning
   * models), retries once without them instead of failing the conversation.
   */
  private async send(req: GenerateRequest, stream: boolean) {
    const includeSampling = req.options?.supportsSampling !== false;
    const attempt = (withSampling: boolean) =>
      providerFetch({
        provider: this.id,
        url: joinUrl(this.baseUrl(req.credentials), 'chat/completions'),
        init: {
          method: 'POST',
          headers: { ...this.headers(req.credentials), ...(stream ? { Accept: 'text/event-stream' } : {}) },
          body: JSON.stringify(this.buildBody(req, stream, withSampling)),
        },
        signal: req.signal,
        secrets: [req.credentials.apiKey],
      });
    try {
      return await attempt(includeSampling);
    } catch (err) {
      if (
        includeSampling &&
        this.hasSampling(req) &&
        err instanceof AIProviderError &&
        err.code === 'bad_request' &&
        SAMPLING_ERROR.test(err.detail ?? '')
      ) {
        return attempt(false);
      }
      throw err;
    }
  }

  protected parseUsage(usage: OpenAIUsage | undefined): { usage?: TokenUsage; cost?: number } {
    if (!usage) return {};
    return {
      usage: {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
      },
      cost: typeof usage.cost === 'number' ? usage.cost : undefined,
    };
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const { response, timer } = await this.send(req, false);
    try {
      const json = (await response.json()) as {
        model?: string;
        choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
        usage?: OpenAIUsage;
      };
      const choice = json.choices?.[0];
      const { usage, cost } = this.parseUsage(json.usage);
      const refusal = choice?.message?.refusal;
      return {
        text: choice?.message?.content ?? '',
        model: json.model ?? req.model,
        usage,
        providerCostUsd: cost,
        finishReason: choice?.finish_reason,
        refused: Boolean(refusal) || choice?.finish_reason === 'content_filter',
      };
    } finally {
      timer.clear();
    }
  }

  async *stream(req: GenerateRequest): AsyncGenerator<StreamEvent> {
    const { response, timer } = await this.send(req, true);
    let text = '';
    let model = req.model;
    let finishReason: string | undefined;
    let usageInfo: { usage?: TokenUsage; cost?: number } = {};
    let refused = false;
    try {
      if (!response.body) throw new AIProviderError({ provider: this.id, code: 'unknown', detail: 'empty stream' });
      for await (const msg of parseSSE(response.body, timer.touch)) {
        if (msg.data === '[DONE]') break;
        let chunk: {
          model?: string;
          choices?: { delta?: { content?: string | null; refusal?: string | null }; finish_reason?: string | null }[];
          usage?: OpenAIUsage | null;
          error?: { message?: string };
        };
        try {
          chunk = JSON.parse(msg.data);
        } catch {
          continue;
        }
        if (chunk.error) {
          throw new AIProviderError({ provider: this.id, code: 'server', detail: chunk.error.message?.slice(0, 300) });
        }
        if (chunk.model) model = chunk.model;
        const choice = chunk.choices?.[0];
        const delta = choice?.delta?.content;
        if (delta) {
          text += delta;
          yield { type: 'delta', text: delta };
        }
        if (choice?.delta?.refusal) refused = true;
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (chunk.usage) usageInfo = this.parseUsage(chunk.usage);
      }
    } catch (err) {
      if (timer.timedOut()) throw new AIProviderError({ provider: this.id, code: 'timeout', detail: 'stream stalled' });
      throw err;
    } finally {
      timer.clear();
    }
    yield {
      type: 'done',
      result: {
        text,
        model,
        usage: usageInfo.usage,
        providerCostUsd: usageInfo.cost,
        finishReason,
        refused: refused || finishReason === 'content_filter',
      },
    };
  }

  async listModels(credentials: ProviderCredentials, signal?: AbortSignal): Promise<ModelInfo[]> {
    const { response, timer } = await providerFetch({
      provider: this.id,
      url: joinUrl(this.baseUrl(credentials), 'models'),
      init: { method: 'GET', headers: this.headers(credentials) },
      signal,
      maxRetries: 1,
      secrets: [credentials.apiKey],
    });
    try {
      const json = (await response.json()) as { data?: Record<string, unknown>[] };
      return (json.data ?? []).map((m) => this.mapModel(m)).sort((a, b) => a.id.localeCompare(b.id));
    } finally {
      timer.clear();
    }
  }

  protected mapModel(m: Record<string, unknown>): ModelInfo {
    const id = String(m.id);
    return { id, label: id, type: /embed/i.test(id) ? 'embedding' : 'chat' };
  }

  async embed(req: EmbedRequest): Promise<EmbedResult> {
    const body: Record<string, unknown> = { model: req.model, input: req.inputs };
    if (req.dimensions) body.dimensions = req.dimensions;
    const { response, timer } = await providerFetch({
      provider: this.id,
      url: joinUrl(this.baseUrl(req.credentials), 'embeddings'),
      init: { method: 'POST', headers: this.headers(req.credentials), body: JSON.stringify(body) },
      signal: req.signal,
      secrets: [req.credentials.apiKey],
    });
    try {
      const json = (await response.json()) as {
        data?: { embedding: number[]; index: number }[];
        usage?: { prompt_tokens?: number };
      };
      const data = [...(json.data ?? [])].sort((a, b) => a.index - b.index);
      if (data.length !== req.inputs.length) {
        throw new AIProviderError({ provider: this.id, code: 'unknown', detail: 'embedding count mismatch' });
      }
      return { vectors: data.map((d) => d.embedding), usage: { inputTokens: json.usage?.prompt_tokens } };
    } finally {
      timer.clear();
    }
  }
}
