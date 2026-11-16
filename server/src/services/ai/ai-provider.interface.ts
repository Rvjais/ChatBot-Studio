import type { ProviderId } from '../../config/providers.js';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerationParams {
  maxOutputTokens: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  /** Anthropic output_config.effort. Ignored by providers that do not support it. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

/** Decrypted credentials, constructed per request and never persisted or logged. */
export interface ProviderCredentials {
  apiKey?: string;
  baseUrl?: string;
  /** Custom providers: header carrying the key (default "Authorization"). */
  authHeader?: string;
  /** Custom providers: prefix placed before the key (default "Bearer "). */
  authPrefix?: string;
  extraHeaders?: Record<string, string>;
}

export interface ProviderOptions {
  /** Anthropic: enable server-side refusal fallback on models that support it. */
  refusalFallback?: boolean;
  /** False for reasoning models that reject sampling parameters. */
  supportsSampling?: boolean;
}

export interface GenerateRequest {
  model: string;
  /** System instructions; adapters map this to each API's native system field. */
  system: string;
  /** Optional split: stable part of the system prompt (cacheable) + per-request context. */
  systemParts?: { stable: string; dynamic: string };
  messages: ChatTurn[];
  params: GenerationParams;
  credentials: ProviderCredentials;
  options?: ProviderOptions;
  signal?: AbortSignal;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** Anthropic prompt-cache details, when reported. */
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export interface GenerateResult {
  text: string;
  model: string;
  usage?: TokenUsage;
  /** Cost reported by the provider itself (e.g. OpenRouter), in USD. */
  providerCostUsd?: number;
  finishReason?: string;
  /** True when the provider declined to answer (safety refusal / blocked prompt). */
  refused?: boolean;
}

/**
 * `reset` tells consumers to discard text streamed so far (e.g. Anthropic handed a refused
 * response over to a fallback model mid-stream; the fallback model's answer follows).
 */
export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'reset' }
  | { type: 'done'; result: GenerateResult };

export interface ModelInfo {
  id: string;
  label?: string;
  type?: 'chat' | 'embedding';
  contextWindow?: number;
  maxOutputTokens?: number;
  /** USD per 1M tokens when the provider publishes it in its model list (OpenRouter). */
  pricing?: { inputPerMillion: number; outputPerMillion: number };
}

export interface EmbedRequest {
  model: string;
  inputs: string[];
  credentials: ProviderCredentials;
  purpose: 'document' | 'query';
  dimensions?: number;
  signal?: AbortSignal;
}

export interface EmbedResult {
  vectors: number[][];
  usage?: { inputTokens?: number };
}

/**
 * Contract every AI provider adapter implements. The chat engine depends only on this
 * interface, so adding a provider means adding an adapter and registering it in the factory.
 */
export interface AIProvider {
  readonly id: ProviderId;
  generate(req: GenerateRequest): Promise<GenerateResult>;
  stream(req: GenerateRequest): AsyncGenerator<StreamEvent>;
  listModels(credentials: ProviderCredentials, signal?: AbortSignal): Promise<ModelInfo[]>;
  embed?(req: EmbedRequest): Promise<EmbedResult>;
}
