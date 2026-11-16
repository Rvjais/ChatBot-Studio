/**
 * Static description of each supported AI provider: wire format, defaults and which
 * generation parameters it accepts. The chat engine never branches on provider IDs —
 * it reads these capabilities and lets each adapter translate requests.
 */
export const PROVIDER_IDS = ['openai', 'deepseek', 'anthropic', 'gemini', 'openrouter', 'custom'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const EMBEDDING_PROVIDER_IDS = ['openai', 'gemini', 'openrouter', 'custom'] as const;
export type EmbeddingProviderId = (typeof EMBEDDING_PROVIDER_IDS)[number];

export interface ParamRange {
  min: number;
  max: number;
  step: number;
  default?: number;
}

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  description: string;
  defaultBaseUrl: string;
  /** Whether the user may override the base URL (proxies, gateways, self-hosted). */
  allowCustomBaseUrl: boolean;
  /** Base URL is mandatory (custom OpenAI-compatible endpoints). */
  requiresBaseUrl: boolean;
  apiKeyRequired: boolean;
  apiKeyUrl?: string;
  docsUrl?: string;
  supports: {
    streaming: boolean;
    listModels: boolean;
    embeddings: boolean;
    temperature: ParamRange | null;
    topP: ParamRange | null;
    frequencyPenalty: ParamRange | null;
    presencePenalty: ParamRange | null;
    /** Anthropic `output_config.effort`. */
    effort: string[] | null;
    customHeaders: boolean;
  };
  maxOutputTokensLimit: number;
}

const OPENAI_LIKE_SAMPLING = {
  temperature: { min: 0, max: 2, step: 0.1, default: 0.7 },
  topP: { min: 0, max: 1, step: 0.05, default: 1 },
  frequencyPenalty: { min: -2, max: 2, step: 0.1, default: 0 },
  presencePenalty: { min: -2, max: 2, step: 0.1, default: 0 },
};

export const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT models via the OpenAI Chat Completions API.',
    defaultBaseUrl: 'https://api.openai.com/v1',
    allowCustomBaseUrl: true,
    requiresBaseUrl: false,
    apiKeyRequired: true,
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs/api-reference/chat',
    supports: {
      streaming: true,
      listModels: true,
      embeddings: true,
      ...OPENAI_LIKE_SAMPLING,
      effort: null,
      customHeaders: false,
    },
    maxOutputTokensLimit: 128_000,
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek models via their OpenAI-compatible API.',
    defaultBaseUrl: 'https://api.deepseek.com',
    allowCustomBaseUrl: true,
    requiresBaseUrl: false,
    apiKeyRequired: true,
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/',
    supports: {
      streaming: true,
      listModels: true,
      embeddings: false,
      ...OPENAI_LIKE_SAMPLING,
      effort: null,
      customHeaders: false,
    },
    maxOutputTokensLimit: 64_000,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: 'Claude models via the Anthropic Messages API (official SDK).',
    defaultBaseUrl: 'https://api.anthropic.com',
    allowCustomBaseUrl: true,
    requiresBaseUrl: false,
    apiKeyRequired: true,
    apiKeyUrl: 'https://platform.claude.com/settings/keys',
    docsUrl: 'https://platform.claude.com/docs',
    supports: {
      streaming: true,
      listModels: true,
      embeddings: false,
      // The current Messages API version rejects temperature/top_p/top_k; depth is controlled by effort.
      temperature: null,
      topP: null,
      frequencyPenalty: null,
      presencePenalty: null,
      effort: ['low', 'medium', 'high', 'xhigh', 'max'],
      customHeaders: false,
    },
    maxOutputTokensLimit: 128_000,
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini models via the Google Generative Language API.',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    allowCustomBaseUrl: true,
    requiresBaseUrl: false,
    apiKeyRequired: true,
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    docsUrl: 'https://ai.google.dev/api',
    supports: {
      streaming: true,
      listModels: true,
      embeddings: true,
      temperature: { min: 0, max: 2, step: 0.1, default: 0.7 },
      topP: { min: 0, max: 1, step: 0.05, default: 0.95 },
      frequencyPenalty: null,
      presencePenalty: null,
      effort: null,
      customHeaders: false,
    },
    maxOutputTokensLimit: 65_536,
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Hundreds of models from many vendors through one OpenAI-compatible API.',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    allowCustomBaseUrl: false,
    requiresBaseUrl: false,
    apiKeyRequired: true,
    apiKeyUrl: 'https://openrouter.ai/keys',
    docsUrl: 'https://openrouter.ai/docs',
    supports: {
      streaming: true,
      listModels: true,
      embeddings: true,
      ...OPENAI_LIKE_SAMPLING,
      effort: null,
      customHeaders: false,
    },
    maxOutputTokensLimit: 128_000,
  },
  custom: {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    description: 'Any endpoint implementing the OpenAI Chat Completions format (Ollama, vLLM, LM Studio, Azure-style gateways, …).',
    defaultBaseUrl: '',
    allowCustomBaseUrl: true,
    requiresBaseUrl: true,
    apiKeyRequired: false,
    supports: {
      streaming: true,
      listModels: true,
      embeddings: true,
      ...OPENAI_LIKE_SAMPLING,
      effort: null,
      customHeaders: true,
    },
    maxOutputTokensLimit: 128_000,
  },
};

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}
