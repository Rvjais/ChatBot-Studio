import { DEFAULT_CONTEXT_WINDOW, findCatalogModel } from '../../config/model-catalog.js';
import { PROVIDERS, type ProviderId } from '../../config/providers.js';
import type { ChatbotDoc } from '../../models/Chatbot.js';
import { decryptSecret } from '../../utils/crypto.js';
import type {
  GenerationParams,
  ModelInfo,
  ProviderCredentials,
  ProviderOptions,
  TokenUsage,
} from './ai-provider.interface.js';
import { getProvider } from './ai-provider.factory.js';
import { AIProviderError } from './errors.js';

/** Encryption contexts (AAD) — a ciphertext only decrypts for the record + purpose it was created for. */
export const secretContext = {
  aiKey: (chatbotId: string) => `chatbot:${chatbotId}:ai-key`,
  aiHeaders: (chatbotId: string) => `chatbot:${chatbotId}:ai-headers`,
  embeddingKey: (chatbotId: string) => `chatbot:${chatbotId}:embedding-key`,
};

/** Projection that includes the encrypted secrets (they are excluded by default). */
export const CHATBOT_SECRET_FIELDS = '+ai.encryptedApiKey +ai.encryptedExtraHeaders +embedding.encryptedApiKey';

export interface ChatConfigInput {
  provider: ProviderId;
  model: string;
  credentials: ProviderCredentials;
  params: GenerationParams;
  options: ProviderOptions;
}

/** Decrypts the chat credentials of a chatbot loaded with CHATBOT_SECRET_FIELDS. */
export function resolveChatCredentials(chatbot: ChatbotDoc): ProviderCredentials {
  const id = chatbot._id.toString();
  const ai = chatbot.ai!;
  const creds: ProviderCredentials = {
    baseUrl: ai.baseUrl || undefined,
    authHeader: ai.authHeader || undefined,
    authPrefix: ai.authPrefix ?? undefined,
  };
  if (ai.encryptedApiKey) creds.apiKey = decryptSecret(ai.encryptedApiKey, secretContext.aiKey(id));
  if (ai.encryptedExtraHeaders) {
    creds.extraHeaders = JSON.parse(decryptSecret(ai.encryptedExtraHeaders, secretContext.aiHeaders(id)));
  }
  return creds;
}

/** Only passes parameters the provider actually supports, clamped to its accepted ranges. */
export function resolveGenerationParams(provider: ProviderId, chatbot: ChatbotDoc): GenerationParams {
  const def = PROVIDERS[provider].supports;
  const g = chatbot.ai?.generation ?? {};
  const clamp = (v: number | null | undefined, r: { min: number; max: number } | null) =>
    v === undefined || v === null || !r ? undefined : Math.min(r.max, Math.max(r.min, v));
  return {
    maxOutputTokens: Math.min(g.maxOutputTokens ?? 1024, PROVIDERS[provider].maxOutputTokensLimit),
    temperature: clamp(g.temperature, def.temperature),
    topP: clamp(g.topP, def.topP),
    frequencyPenalty: clamp(g.frequencyPenalty, def.frequencyPenalty),
    presencePenalty: clamp(g.presencePenalty, def.presencePenalty),
    effort: def.effort && g.effort ? (g.effort as GenerationParams['effort']) : undefined,
  };
}

export function resolveProviderOptions(provider: ProviderId, model: string, chatbot: ChatbotDoc): ProviderOptions {
  const catalog = findCatalogModel(provider, model);
  return {
    supportsSampling: catalog?.supportsSampling ?? !/^(o\d|gpt-5)/i.test(model),
    refusalFallback: chatbot.ai?.refusalFallback !== false,
  };
}

export function resolveChatConfig(chatbot: ChatbotDoc): ChatConfigInput {
  const provider = chatbot.ai!.provider as ProviderId;
  const model = chatbot.ai!.model;
  const def = PROVIDERS[provider];
  if (!model) throw new AIProviderError({ provider, code: 'config', detail: 'No model selected' });
  const credentials = resolveChatCredentials(chatbot);
  if (def.apiKeyRequired && !credentials.apiKey) {
    throw new AIProviderError({ provider, code: 'config', detail: 'No API key configured' });
  }
  if (def.requiresBaseUrl && !credentials.baseUrl) {
    throw new AIProviderError({ provider, code: 'config', detail: 'Base URL is required' });
  }
  return {
    provider,
    model,
    credentials,
    params: resolveGenerationParams(provider, chatbot),
    options: resolveProviderOptions(provider, model, chatbot),
  };
}

export function contextWindowFor(chatbot: ChatbotDoc): number {
  if (chatbot.ai?.contextWindow) return chatbot.ai.contextWindow;
  const catalog = findCatalogModel(chatbot.ai!.provider as ProviderId, chatbot.ai!.model);
  return catalog?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
}

export interface CostResult {
  costUsd?: number;
  costSource?: 'provider' | 'catalog' | 'chatbot';
}

/**
 * Cost estimate policy: provider-reported cost wins; otherwise the chatbot owner's pricing
 * override; otherwise verified catalog pricing; otherwise no cost is recorded.
 */
export function computeCost(
  provider: ProviderId,
  model: string,
  usage: TokenUsage | undefined,
  chatbotPricing: { inputPerMillion?: number | null; outputPerMillion?: number | null } | undefined | null,
  providerCostUsd?: number,
): CostResult {
  if (typeof providerCostUsd === 'number' && Number.isFinite(providerCostUsd)) {
    return { costUsd: providerCostUsd, costSource: 'provider' };
  }
  if (!usage || usage.inputTokens === undefined || usage.outputTokens === undefined) return {};

  const calc = (inPerM: number, outPerM: number) => {
    // Anthropic prompt caching: reads bill at 0.1x and 5-minute cache writes at 1.25x of input price.
    const cacheRead = usage.cacheReadInputTokens ?? 0;
    const cacheWrite = usage.cacheCreationInputTokens ?? 0;
    const plainInput = Math.max(0, (usage.inputTokens ?? 0) - cacheRead - cacheWrite);
    const input = plainInput * inPerM + cacheRead * inPerM * 0.1 + cacheWrite * inPerM * 1.25;
    return Number(((input + (usage.outputTokens ?? 0) * outPerM) / 1_000_000).toFixed(8));
  };

  if (
    chatbotPricing &&
    typeof chatbotPricing.inputPerMillion === 'number' &&
    typeof chatbotPricing.outputPerMillion === 'number'
  ) {
    return { costUsd: calc(chatbotPricing.inputPerMillion, chatbotPricing.outputPerMillion), costSource: 'chatbot' };
  }
  const catalog = findCatalogModel(provider, model);
  if (catalog?.pricing) {
    return { costUsd: calc(catalog.pricing.inputPerMillion, catalog.pricing.outputPerMillion), costSource: 'catalog' };
  }
  return {};
}

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
  model?: string;
  sample?: string;
  usage?: TokenUsage;
}

/** Sends a tiny real request to verify credentials, endpoint and model. */
export async function testChatConnection(cfg: ChatConfigInput): Promise<ConnectionTestResult> {
  const started = Date.now();
  try {
    const result = await getProvider(cfg.provider).generate({
      model: cfg.model,
      system: 'You are a connectivity check. Reply with the single word: OK',
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      params: { ...cfg.params, maxOutputTokens: Math.max(256, Math.min(cfg.params.maxOutputTokens, 512)) },
      credentials: cfg.credentials,
      options: cfg.options,
      signal: AbortSignal.timeout(45_000),
    });
    return {
      ok: true,
      latencyMs: Date.now() - started,
      message: `Connected to ${PROVIDERS[cfg.provider].name} (${result.model}).`,
      model: result.model,
      sample: result.text.slice(0, 200),
      usage: result.usage,
    };
  } catch (err) {
    const message = err instanceof AIProviderError ? err.message : 'Unexpected error while contacting the provider.';
    return { ok: false, latencyMs: Date.now() - started, message };
  }
}

export async function listProviderModels(provider: ProviderId, credentials: ProviderCredentials): Promise<ModelInfo[]> {
  return getProvider(provider).listModels(credentials, AbortSignal.timeout(20_000));
}
