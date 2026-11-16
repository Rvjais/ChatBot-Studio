import { PROVIDERS } from '../../../config/providers.js';
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

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
  modelVersion?: string;
  error?: { message?: string };
}

const REFUSAL_REASONS = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']);

/** Google Gemini via the Generative Language REST API (generateContent / streamGenerateContent). */
export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const;

  private base(creds: ProviderCredentials) {
    return creds.baseUrl?.trim() || PROVIDERS.gemini.defaultBaseUrl;
  }

  private headers(creds: ProviderCredentials) {
    if (!creds.apiKey) throw new AIProviderError({ provider: this.id, code: 'config', detail: 'API key is required' });
    return { 'Content-Type': 'application/json', 'x-goog-api-key': creds.apiKey };
  }

  private modelPath(model: string) {
    return `models/${encodeURIComponent(model.replace(/^models\//, ''))}`;
  }

  private body(req: GenerateRequest) {
    const generationConfig: Record<string, unknown> = { maxOutputTokens: req.params.maxOutputTokens };
    if (req.options?.supportsSampling !== false) {
      if (req.params.temperature !== undefined) generationConfig.temperature = req.params.temperature;
      if (req.params.topP !== undefined) generationConfig.topP = req.params.topP;
    }
    return {
      ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
      contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig,
    };
  }

  private textOf(res: GeminiResponse): string {
    return (res.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('');
  }

  private usageOf(res: GeminiResponse): TokenUsage | undefined {
    const u = res.usageMetadata;
    if (!u) return undefined;
    // Thinking tokens are billed as output tokens.
    const output = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
    return { inputTokens: u.promptTokenCount, outputTokens: output, totalTokens: u.totalTokenCount };
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const { response, timer } = await providerFetch({
      provider: this.id,
      url: joinUrl(this.base(req.credentials), `${this.modelPath(req.model)}:generateContent`),
      init: { method: 'POST', headers: this.headers(req.credentials), body: JSON.stringify(this.body(req)) },
      signal: req.signal,
      secrets: [req.credentials.apiKey],
    });
    try {
      const json = (await response.json()) as GeminiResponse;
      const finishReason = json.candidates?.[0]?.finishReason ?? json.promptFeedback?.blockReason;
      return {
        text: this.textOf(json),
        model: json.modelVersion ?? req.model,
        usage: this.usageOf(json),
        finishReason,
        refused: Boolean(json.promptFeedback?.blockReason) || REFUSAL_REASONS.has(finishReason ?? ''),
      };
    } finally {
      timer.clear();
    }
  }

  async *stream(req: GenerateRequest): AsyncGenerator<StreamEvent> {
    const { response, timer } = await providerFetch({
      provider: this.id,
      url: `${joinUrl(this.base(req.credentials), `${this.modelPath(req.model)}:streamGenerateContent`)}?alt=sse`,
      init: { method: 'POST', headers: this.headers(req.credentials), body: JSON.stringify(this.body(req)) },
      signal: req.signal,
      secrets: [req.credentials.apiKey],
    });
    let text = '';
    let usage: TokenUsage | undefined;
    let finishReason: string | undefined;
    let model = req.model;
    let blocked = false;
    try {
      if (!response.body) throw new AIProviderError({ provider: this.id, code: 'unknown', detail: 'empty stream' });
      for await (const msg of parseSSE(response.body, timer.touch)) {
        let chunk: GeminiResponse;
        try {
          chunk = JSON.parse(msg.data);
        } catch {
          continue;
        }
        if (chunk.error) throw new AIProviderError({ provider: this.id, code: 'server', detail: chunk.error.message?.slice(0, 300) });
        const delta = this.textOf(chunk);
        if (delta) {
          text += delta;
          yield { type: 'delta', text: delta };
        }
        usage = this.usageOf(chunk) ?? usage;
        finishReason = chunk.candidates?.[0]?.finishReason ?? finishReason;
        if (chunk.promptFeedback?.blockReason) {
          blocked = true;
          finishReason = chunk.promptFeedback.blockReason;
        }
        if (chunk.modelVersion) model = chunk.modelVersion;
      }
    } catch (err) {
      if (timer.timedOut()) throw new AIProviderError({ provider: this.id, code: 'timeout', detail: 'stream stalled' });
      throw err;
    } finally {
      timer.clear();
    }
    yield {
      type: 'done',
      result: { text, model, usage, finishReason, refused: blocked || REFUSAL_REASONS.has(finishReason ?? '') },
    };
  }

  async listModels(credentials: ProviderCredentials, signal?: AbortSignal): Promise<ModelInfo[]> {
    const { response, timer } = await providerFetch({
      provider: this.id,
      url: `${joinUrl(this.base(credentials), 'models')}?pageSize=1000`,
      init: { method: 'GET', headers: this.headers(credentials) },
      signal,
      maxRetries: 1,
      secrets: [credentials.apiKey],
    });
    try {
      const json = (await response.json()) as {
        models?: {
          name: string;
          displayName?: string;
          inputTokenLimit?: number;
          outputTokenLimit?: number;
          supportedGenerationMethods?: string[];
        }[];
      };
      return (json.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.some((x) => x === 'generateContent' || x === 'embedContent'))
        .map((m) => ({
          id: m.name.replace(/^models\//, ''),
          label: m.displayName ?? m.name,
          type: m.supportedGenerationMethods?.includes('generateContent') ? ('chat' as const) : ('embedding' as const),
          contextWindow: m.inputTokenLimit,
          maxOutputTokens: m.outputTokenLimit,
        }));
    } finally {
      timer.clear();
    }
  }

  async embed(req: EmbedRequest): Promise<EmbedResult> {
    const modelPath = this.modelPath(req.model);
    const taskType = req.purpose === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';
    const { response, timer } = await providerFetch({
      provider: this.id,
      url: joinUrl(this.base(req.credentials), `${modelPath}:batchEmbedContents`),
      init: {
        method: 'POST',
        headers: this.headers(req.credentials),
        body: JSON.stringify({
          requests: req.inputs.map((text) => ({
            model: decodeURIComponent(modelPath),
            content: { parts: [{ text }] },
            taskType,
            ...(req.dimensions ? { outputDimensionality: req.dimensions } : {}),
          })),
        }),
      },
      signal: req.signal,
      secrets: [req.credentials.apiKey],
    });
    try {
      const json = (await response.json()) as { embeddings?: { values: number[] }[] };
      const vectors = (json.embeddings ?? []).map((e) => e.values);
      if (vectors.length !== req.inputs.length) {
        throw new AIProviderError({ provider: this.id, code: 'unknown', detail: 'embedding count mismatch' });
      }
      return { vectors };
    } finally {
      timer.clear();
    }
  }
}
