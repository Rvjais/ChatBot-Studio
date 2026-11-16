import type { Request, Response } from 'express';
import { listCatalogModels } from '../config/model-catalog.js';
import { EMBEDDING_PROVIDER_IDS, PROVIDERS, PROVIDER_IDS, type ProviderId } from '../config/providers.js';
import { Chatbot, type ChatbotDoc } from '../models/Chatbot.js';
import type { ProviderCredentials } from '../services/ai/ai-provider.interface.js';
import {
  CHATBOT_SECRET_FIELDS,
  listProviderModels,
  resolveChatConfig,
  resolveChatCredentials,
  testChatConnection,
} from '../services/ai/ai.service.js';
import { AIProviderError } from '../services/ai/errors.js';
import { applyAiConfig, type AiConfigUpdate } from '../services/chatbot.service.js';
import { embedTexts, resolveEmbeddingConfig } from '../services/knowledge/embeddings.js';
import { validateBrowserProducts } from '../services/products/browser-products.js';
import { badRequest } from '../utils/errors.js';
import { assertSafeBaseUrl } from '../utils/ssrf.js';
import { respondWithChat } from './chat-response.js';

export function getProviders(_req: Request, res: Response) {
  res.json({
    providers: PROVIDER_IDS.map((id) => PROVIDERS[id]),
    embeddingProviders: EMBEDDING_PROVIDER_IDS.map((id) => ({ id, name: PROVIDERS[id].name })),
  });
}

export function getModels(req: Request, res: Response) {
  const provider = typeof req.query.provider === 'string' && (PROVIDER_IDS as readonly string[]).includes(req.query.provider)
    ? (req.query.provider as ProviderId)
    : undefined;
  const type = req.query.type === 'embedding' || req.query.type === 'chat' ? req.query.type : undefined;
  res.json({ models: listCatalogModels(provider, type) });
}

async function loadWithSecrets(req: Request): Promise<ChatbotDoc> {
  return (await Chatbot.findOne({ _id: req.chatbot!._id, ownerId: req.user!.id }).select(CHATBOT_SECRET_FIELDS)) as ChatbotDoc;
}

/** Verifies credentials with a tiny real request. Accepts an unsaved `override` to test before saving. */
export async function testProvider(req: Request, res: Response) {
  const chatbot = await loadWithSecrets(req);
  const { target, override } = req.body as { target: 'chat' | 'embedding'; override?: AiConfigUpdate };
  if (override) applyAiConfig(chatbot, override); // in memory only — never saved here

  if (target === 'embedding') {
    const started = Date.now();
    try {
      const cfg = resolveEmbeddingConfig(chatbot);
      if (!cfg) throw badRequest('Embeddings are disabled for this chatbot');
      await assertSafeBaseUrl(cfg.credentials.baseUrl);
      const [vector] = await embedTexts(cfg, ['connection test'], 'query', AbortSignal.timeout(30_000));
      res.json({ ok: true, latencyMs: Date.now() - started, message: `Embeddings working (${cfg.model}, ${vector!.length} dimensions).`, dimensions: vector!.length });
    } catch (err) {
      if (!(err instanceof AIProviderError)) throw err;
      res.json({ ok: false, latencyMs: Date.now() - started, message: err.message });
    }
    return;
  }

  let cfg;
  try {
    cfg = resolveChatConfig(chatbot);
  } catch (err) {
    if (err instanceof AIProviderError) {
      res.json({ ok: false, latencyMs: 0, message: err.message });
      return;
    }
    throw err;
  }
  await assertSafeBaseUrl(cfg.credentials.baseUrl);
  const result = await testChatConnection(cfg);
  if (!override) {
    await Chatbot.updateOne(
      { _id: chatbot._id },
      { $set: { 'ai.lastTest': { status: result.ok ? 'success' : 'failed', message: result.message.slice(0, 500), testedAt: new Date(), latencyMs: result.latencyMs } } },
    );
  }
  res.json(result);
}

/** Lists models live from the provider API, enriched with catalog metadata. */
export async function listLiveModels(req: Request, res: Response) {
  const chatbot = await loadWithSecrets(req);
  const body = req.body as { provider?: ProviderId; apiKey?: string; baseUrl?: string };
  const provider = body.provider ?? (chatbot.ai!.provider as ProviderId);
  if (!PROVIDERS[provider].supports.listModels) throw badRequest('This provider does not support listing models');

  let credentials: ProviderCredentials;
  if (body.apiKey) {
    credentials = { apiKey: body.apiKey, baseUrl: body.baseUrl || undefined };
  } else if (provider === chatbot.ai!.provider) {
    credentials = { ...resolveChatCredentials(chatbot), ...(body.baseUrl ? { baseUrl: body.baseUrl } : {}) };
  } else {
    throw badRequest('Enter an API key to load models for this provider');
  }
  if (PROVIDERS[provider].apiKeyRequired && !credentials.apiKey) throw badRequest('An API key is required to load models');
  await assertSafeBaseUrl(credentials.baseUrl);

  const catalog = new Map(listCatalogModels(provider).map((m) => [m.id, m]));
  const live = await listProviderModels(provider, credentials);
  res.json({
    models: live.map((m) => {
      const c = catalog.get(m.id);
      return {
        ...m,
        contextWindow: m.contextWindow ?? c?.contextWindow,
        pricing: m.pricing ?? (c?.pricing ? { inputPerMillion: c.pricing.inputPerMillion, outputPerMillion: c.pricing.outputPerMillion } : undefined),
      };
    }),
  });
}

/** Owner test chat: same engine as the widget, but bypasses status/domain checks and returns debug info. */
export async function previewChat(req: Request, res: Response) {
  const chatbot = await loadWithSecrets(req);
  const { message, conversationId, products, stream } = req.body as {
    message: string;
    conversationId?: string | null;
    products?: unknown[];
    stream?: boolean;
  };
  const pageProducts = products?.length ? validateBrowserProducts(products).products : [];
  await respondWithChat(
    res,
    {
      chatbot,
      message,
      conversationId: conversationId ?? undefined,
      visitorId: `owner_${req.user!.id.toString()}`,
      pageProducts,
      channel: 'preview',
    },
    { stream: Boolean(stream), exposeErrors: true },
  );
}
