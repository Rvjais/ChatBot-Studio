import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../../config/env.js';
import type {
  AIProvider,
  GenerateRequest,
  GenerateResult,
  ModelInfo,
  ProviderCredentials,
  StreamEvent,
  TokenUsage,
} from '../ai-provider.interface.js';
import { AIProviderError, redactSecrets, type AIErrorCode } from '../errors.js';

/**
 * Models that accept the server-side refusal fallback (`fallbacks: "default"`, beta
 * `server-side-fallback-2026-07-01`). On a policy decline the API re-runs the request on a
 * fallback model inside the same call instead of returning an empty refusal.
 */
const FALLBACK_CAPABLE = /^claude-(?:fable-5-2|fable-5-1|mythos-5-2|mythos-5-1|opus-5-5|opus-5|sonnet-5-5)$/;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

interface MinimalBlock {
  type: string;
  text?: string;
}
interface MinimalMessage {
  model: string;
  stop_reason: string | null;
  content: MinimalBlock[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
}
interface MinimalStreamEvent {
  type: string;
  content_block?: { type: string };
  delta?: { type: string; text?: string };
}
interface MinimalStream extends AsyncIterable<MinimalStreamEvent> {
  finalMessage(): Promise<MinimalMessage>;
}

/**
 * Anthropic Claude via the official SDK. The SDK (>= 1.0) targets API version 2026-10-21,
 * which rejects temperature/top_p/top_k, so sampling parameters are never sent; response
 * depth is controlled with `output_config.effort`. Thinking is left at the model default
 * (adaptive on current models) and thinking blocks are never shown to visitors.
 */
export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic' as const;

  private client(creds: ProviderCredentials): Anthropic {
    if (!creds.apiKey) throw new AIProviderError({ provider: this.id, code: 'config', detail: 'API key is required' });
    return new Anthropic({
      apiKey: creds.apiKey,
      baseURL: creds.baseUrl?.trim() || undefined,
      timeout: env.AI_REQUEST_TIMEOUT_MS,
      maxRetries: env.AI_MAX_RETRIES,
    });
  }

  private buildParams(req: GenerateRequest) {
    const system: Anthropic.TextBlockParam[] = [];
    if (req.systemParts) {
      // Stable instructions first (cacheable prefix), per-request retrieved context after.
      if (req.systemParts.stable) {
        system.push({ type: 'text', text: req.systemParts.stable, cache_control: { type: 'ephemeral' } });
      }
      if (req.systemParts.dynamic) system.push({ type: 'text', text: req.systemParts.dynamic });
    } else if (req.system) {
      system.push({ type: 'text', text: req.system });
    }
    return {
      model: req.model,
      max_tokens: req.params.maxOutputTokens,
      ...(system.length ? { system } : {}),
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(req.params.effort ? { output_config: { effort: req.params.effort } } : {}),
    };
  }

  private useFallback(req: GenerateRequest): boolean {
    return req.options?.refusalFallback !== false && FALLBACK_CAPABLE.test(req.model);
  }

  private mapError(err: unknown, apiKey?: string): unknown {
    if (err instanceof AIProviderError) return err;
    if (err instanceof Anthropic.APIError) {
      let code: AIErrorCode = 'unknown';
      if (err instanceof Anthropic.APIConnectionTimeoutError) code = 'timeout';
      else if (err instanceof Anthropic.APIConnectionError) code = 'network';
      else if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) code = 'auth';
      else if (err instanceof Anthropic.NotFoundError) code = 'not_found';
      else if (err instanceof Anthropic.RateLimitError) code = 'rate_limit';
      else if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.UnprocessableEntityError) code = 'bad_request';
      else if (err instanceof Anthropic.InternalServerError) code = 'server';
      return new AIProviderError({
        provider: this.id,
        code,
        status: err.status,
        detail: redactSecrets(err.message, [apiKey]),
      });
    }
    return err;
  }

  private toResult(msg: MinimalMessage): GenerateResult {
    // With a server-side fallback, only content after the last fallback block is the final answer.
    const lastFallback = msg.content.map((b) => b.type).lastIndexOf('fallback');
    const text = msg.content
      .slice(lastFallback + 1)
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
    const u = msg.usage;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    const cacheWrite = u.cache_creation_input_tokens ?? 0;
    const usage: TokenUsage = {
      inputTokens: u.input_tokens + cacheRead + cacheWrite,
      outputTokens: u.output_tokens,
      totalTokens: u.input_tokens + cacheRead + cacheWrite + u.output_tokens,
      cacheReadInputTokens: cacheRead || undefined,
      cacheCreationInputTokens: cacheWrite || undefined,
    };
    return {
      text,
      model: msg.model,
      usage,
      finishReason: msg.stop_reason ?? undefined,
      refused: msg.stop_reason === 'refusal',
    };
  }

  private openStream(client: Anthropic, req: GenerateRequest): MinimalStream {
    const params = this.buildParams(req);
    const options = { signal: req.signal ?? undefined };
    if (this.useFallback(req)) {
      return client.beta.messages.stream(
        { ...params, betas: [FALLBACK_BETA], fallbacks: 'default' },
        options,
      ) as unknown as MinimalStream;
    }
    return client.messages.stream(params, options) as unknown as MinimalStream;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const client = this.client(req.credentials);
    try {
      const params = this.buildParams(req);
      const options = { signal: req.signal ?? undefined };
      const msg = this.useFallback(req)
        ? await client.beta.messages.create({ ...params, betas: [FALLBACK_BETA], fallbacks: 'default' }, options)
        : await client.messages.create(params, options);
      return this.toResult(msg as unknown as MinimalMessage);
    } catch (err) {
      throw this.mapError(err, req.credentials.apiKey);
    }
  }

  async *stream(req: GenerateRequest): AsyncGenerator<StreamEvent> {
    const client = this.client(req.credentials);
    let final: MinimalMessage;
    try {
      const stream = this.openStream(client, req);
      for await (const event of stream) {
        if (event.type === 'content_block_start' && event.content_block?.type === 'fallback') {
          yield { type: 'reset' };
        } else if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
          yield { type: 'delta', text: event.delta.text };
        }
      }
      final = await stream.finalMessage();
    } catch (err) {
      throw this.mapError(err, req.credentials.apiKey);
    }
    yield { type: 'done', result: this.toResult(final) };
  }

  async listModels(credentials: ProviderCredentials): Promise<ModelInfo[]> {
    const client = this.client(credentials);
    const models: ModelInfo[] = [];
    try {
      for await (const m of client.models.list()) {
        const extra = m as unknown as { max_input_tokens?: number; max_tokens?: number };
        models.push({
          id: m.id,
          label: m.display_name,
          type: 'chat',
          contextWindow: extra.max_input_tokens,
          maxOutputTokens: extra.max_tokens,
        });
      }
    } catch (err) {
      throw this.mapError(err, credentials.apiKey);
    }
    return models;
  }
}
