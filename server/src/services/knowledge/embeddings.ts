import { listCatalogModels } from '../../config/model-catalog.js';
import type { EmbeddingProviderId } from '../../config/providers.js';
import type { ChatbotDoc } from '../../models/Chatbot.js';
import { decryptSecret } from '../../utils/crypto.js';
import type { ProviderCredentials } from '../ai/ai-provider.interface.js';
import { getProvider } from '../ai/ai-provider.factory.js';
import { resolveChatCredentials, secretContext } from '../ai/ai.service.js';
import { AIProviderError } from '../ai/errors.js';

export interface EmbeddingConfig {
  provider: EmbeddingProviderId;
  model: string;
  dimensions?: number;
  credentials: ProviderCredentials;
  /** Identifier stored on each chunk; query vectors are only compared with matching chunks. */
  key: string;
}

const BATCH_SIZE = 64;
const MAX_INPUT_CHARS = 8000;

/**
 * Resolves the embedding configuration for a chatbot loaded with secret fields.
 * Returns null when embeddings are disabled (retrieval then uses keyword search only).
 */
export function resolveEmbeddingConfig(chatbot: ChatbotDoc): EmbeddingConfig | null {
  const emb = chatbot.embedding;
  if (!emb || !emb.provider || emb.provider === 'none') return null;
  const provider = emb.provider as EmbeddingProviderId;
  const model = emb.model || listCatalogModels(provider, 'embedding').find((m) => m.recommended)?.id;
  if (!model) throw new AIProviderError({ provider, code: 'config', detail: 'No embedding model selected' });

  let credentials: ProviderCredentials;
  if (emb.useChatCredentials !== false && chatbot.ai?.provider === provider) {
    credentials = resolveChatCredentials(chatbot);
  } else {
    credentials = { baseUrl: emb.baseUrl || undefined };
    if (emb.encryptedApiKey) {
      credentials.apiKey = decryptSecret(emb.encryptedApiKey, secretContext.embeddingKey(chatbot._id.toString()));
    }
  }
  if (provider !== 'custom' && !credentials.apiKey) {
    throw new AIProviderError({ provider, code: 'config', detail: 'No API key configured for embeddings' });
  }
  if (provider === 'custom' && !credentials.baseUrl) {
    throw new AIProviderError({ provider, code: 'config', detail: 'Base URL is required for custom embeddings' });
  }
  const dimensions = emb.dimensions ?? undefined;
  return { provider, model, dimensions, credentials, key: `${provider}:${model}:${dimensions ?? 'default'}` };
}

/** Embeds texts in batches. Throws AIProviderError on failure. */
export async function embedTexts(
  cfg: EmbeddingConfig,
  texts: string[],
  purpose: 'document' | 'query',
  signal?: AbortSignal,
): Promise<number[][]> {
  const provider = getProvider(cfg.provider);
  if (!provider.embed) throw new AIProviderError({ provider: cfg.provider, code: 'config', detail: 'Provider has no embeddings API' });
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map((t) => t.slice(0, MAX_INPUT_CHARS));
    const result = await provider.embed({
      model: cfg.model,
      inputs: batch,
      credentials: cfg.credentials,
      purpose,
      dimensions: cfg.dimensions,
      signal,
    });
    vectors.push(...result.vectors);
  }
  return vectors;
}
