import type { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { ProviderId } from '../../config/providers.js';
import type { ChatbotDoc } from '../../models/Chatbot.js';
import { Conversation, type ConversationDoc } from '../../models/Conversation.js';
import { KnowledgeChunk } from '../../models/KnowledgeChunk.js';
import { Message } from '../../models/Message.js';
import { generateConversationId } from '../../utils/crypto.js';
import { AppError } from '../../utils/errors.js';
import { assertSafeBaseUrl } from '../../utils/ssrf.js';
import { estimateTokens, truncate } from '../../utils/text.js';
import type { ChatTurn, GenerateResult } from '../ai/ai-provider.interface.js';
import { getProvider } from '../ai/ai-provider.factory.js';
import { computeCost, contextWindowFor, resolveChatConfig } from '../ai/ai.service.js';
import { AIProviderError } from '../ai/errors.js';
import { retrieveKnowledge, type RetrievedChunk } from '../knowledge/retrieval.js';
import type { ProductInput } from '../products/normalizer.js';
import { filterPageProducts, retrieveProducts, type ContextProduct } from '../products/retrieval.js';
import { fitHistory } from './context-window.js';
import { checkPrices, numbersIn, PRICE_NOTICE } from './price-guard.js';
import { buildPrompt, type PromptContext } from './prompt-builder.js';

export const VISITOR_ERROR_MESSAGE = "Sorry — I'm having trouble answering right now. Please try again in a moment.";

export interface ChatRequest {
  chatbot: ChatbotDoc; // loaded with CHATBOT_SECRET_FIELDS
  message: string;
  visitorId: string;
  conversationId?: string;
  pageProducts?: ProductInput[];
  channel: 'widget' | 'preview';
  origin?: string;
  pageUrl?: string;
  signal?: AbortSignal;
}

export interface ChatStreamHandlers {
  onStart?(info: { conversationId: string }): void;
  onDelta?(text: string): void;
  onReset?(): void;
}

export interface ChatResponse {
  conversationId: string;
  messageId: string;
  content: string;
  error?: { code: string; message: string };
  refused?: boolean;
  /** Debug details returned to the owner in dashboard previews only. */
  debug?: {
    provider: string;
    model: string;
    knowledge: { fileName?: string; page?: number; similarity?: number; via: string[] }[];
    retrievalMode: string;
    retrievalWarning?: string;
    verifiedProducts: string[];
    pageProducts: string[];
    priceCheck?: { passed: boolean; unverifiedAmounts: string[] };
    usage?: GenerateResult['usage'];
    costUsd?: number;
    latencyMs: number;
  };
}

async function loadConversation(req: ChatRequest): Promise<ConversationDoc> {
  const chatbotId = req.chatbot._id as Types.ObjectId;
  if (req.conversationId) {
    const existing = await Conversation.findOne({ conversationId: req.conversationId, chatbotId, visitorId: req.visitorId });
    if (existing) {
      if (existing.messageCount >= env.WIDGET_MAX_MESSAGES_PER_CONVERSATION) {
        throw new AppError(429, 'CONVERSATION_LIMIT', 'This conversation has reached its message limit. Please start a new conversation.');
      }
      return existing;
    }
  }
  return Conversation.create({
    ownerId: req.chatbot.ownerId,
    chatbotId,
    conversationId: generateConversationId(),
    visitorId: req.visitorId,
    channel: req.channel,
    origin: req.origin?.slice(0, 300),
    pageUrl: req.pageUrl?.slice(0, 1000),
  });
}

/** Retrieval query: short follow-ups ("and the price?") are expanded with the previous user turn. */
function retrievalQuery(message: string, history: ChatTurn[]): string {
  if (message.length >= 60) return message;
  const prevUser = [...history].reverse().find((t) => t.role === 'user');
  return prevUser ? `${prevUser.content.slice(0, 300)}\n${message}` : message;
}

/**
 * The conversation engine. Every message follows the same pipeline:
 * conversation → history → knowledge + product retrieval → prompt → provider → guard → persist.
 * (Chatbot lookup, status and origin checks happen in the widget service before this.)
 */
export async function runChat(req: ChatRequest, handlers?: ChatStreamHandlers): Promise<ChatResponse> {
  const { chatbot } = req;
  const started = Date.now();
  const conversation = await loadConversation(req);
  const chatbotId = chatbot._id as Types.ObjectId;

  // History (excluding failed turns), oldest → newest.
  const previous = await Message.find({
    conversationId: conversation._id,
    role: { $in: ['user', 'assistant'] },
    'metadata.error.code': { $exists: false },
  })
    .sort({ timestamp: -1 })
    .limit(40)
    .lean();
  previous.reverse();
  const history: ChatTurn[] = previous.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  const lastAssistant = [...previous].reverse().find((m) => m.role === 'assistant');

  await Message.create({
    ownerId: chatbot.ownerId,
    chatbotId,
    conversationId: conversation._id,
    role: 'user',
    channel: req.channel,
    content: req.message,
  });
  handlers?.onStart?.({ conversationId: conversation.conversationId });

  const provider = chatbot.ai!.provider as ProviderId;
  let model = chatbot.ai!.model;
  let content = '';
  let result: GenerateResult | undefined;
  let error: { code: string; message: string } | undefined;
  let knowledge: RetrievedChunk[] = [];
  let retrievalMode = 'none';
  let retrievalWarning: string | undefined;
  let verified: ContextProduct[] = [];
  let page: ContextProduct[] = [];
  let priceCheck: { passed: boolean; unverifiedAmounts: string[] } | undefined;
  let streamed = false;

  try {
    const cfg = resolveChatConfig(chatbot);
    await assertSafeBaseUrl(cfg.credentials.baseUrl).catch(() => {
      throw new AIProviderError({ provider, code: 'config', detail: 'Base URL is not allowed' });
    });
    model = cfg.model;
    const query = retrievalQuery(req.message, history);

    const [kb, products, hasKnowledgeBase] = await Promise.all([
      retrieveKnowledge(chatbot, query, req.signal),
      retrieveProducts(chatbot, query, lastAssistant?.metadata?.productIds ?? []),
      KnowledgeChunk.exists({ chatbotId }).then(Boolean),
    ]);
    knowledge = kb.chunks;
    retrievalMode = kb.mode;
    retrievalWarning = kb.warning;
    verified = products.products;

    // Page-provided products: same query understanding, verified records always win.
    const conflicts: PromptContext['conflicts'] = [];
    if (req.pageProducts?.length && chatbot.productSettings?.allowBrowserProducts !== false) {
      const verifiedById = new Map(verified.map((p) => [p.productId.toLowerCase(), p]));
      const limit = chatbot.productSettings?.maxProductsInContext ?? 12;
      for (const p of filterPageProducts(req.pageProducts, products.query, limit)) {
        const v = verifiedById.get(p.productId.toLowerCase());
        if (v) {
          if (p.price !== undefined && v.price !== undefined && p.price !== v.price) {
            conflicts.push({ productId: v.productId, verifiedPrice: v.price, pagePrice: p.price });
          }
          continue;
        }
        page.push(p);
      }
    }

    const ctx: PromptContext = { knowledge, verifiedProducts: verified, pageProducts: page, catalog: products.summary, conflicts, hasKnowledgeBase };
    let prompt = buildPrompt(chatbot, ctx);
    const contextWindow = contextWindowFor(chatbot);
    // If reference data is too large for the model, drop the lowest-ranked excerpts first.
    while (estimateTokens(prompt.full) > contextWindow * 0.6 && ctx.knowledge.length) {
      ctx.knowledge = ctx.knowledge.slice(0, -1);
      knowledge = ctx.knowledge;
      prompt = buildPrompt(chatbot, ctx);
    }
    const messages = fitHistory(history, { role: 'user', content: req.message }, {
      contextWindow,
      systemTokens: estimateTokens(prompt.full),
      maxOutputTokens: cfg.params.maxOutputTokens,
    });

    const generateReq = {
      model: cfg.model,
      system: prompt.full,
      systemParts: { stable: prompt.stable, dynamic: prompt.dynamic },
      messages,
      params: cfg.params,
      credentials: cfg.credentials,
      options: cfg.options,
      signal: req.signal,
    };

    if (handlers?.onDelta) {
      streamed = true;
      for await (const event of getProvider(cfg.provider).stream(generateReq)) {
        if (event.type === 'delta') {
          content += event.text;
          handlers.onDelta(event.text);
        } else if (event.type === 'reset') {
          content = '';
          handlers.onReset?.();
        } else {
          result = event.result;
        }
      }
    } else {
      result = await getProvider(cfg.provider).generate(generateReq);
      content = result.text;
    }
    content = (result?.text || content).trim();
    if (result?.model) model = result.model;

    if (!content) {
      // Refusal or empty answer → fall back to the owner's configured message.
      content = chatbot.fallbackMessage || VISITOR_ERROR_MESSAGE;
      handlers?.onDelta?.(content);
    }

    // Verify every currency amount in the answer against the data the model was given.
    const known = new Set<number>();
    [...verified, ...page].forEach((p) => p.price !== undefined && known.add(p.price));
    knowledge.forEach((k) => numbersIn(k.content).forEach((n) => known.add(n)));
    numbersIn(`${chatbot.systemPrompt ?? ''} ${chatbot.personality?.customInstructions ?? ''} ${req.message} ${history.map((h) => h.content).join(' ')}`).forEach((n) => known.add(n));
    if (products.summary.priceRange) {
      known.add(products.summary.priceRange.min);
      known.add(products.summary.priceRange.max);
    }
    priceCheck = checkPrices(content, known);
    if (!priceCheck.passed && chatbot.productSettings?.priceGuard !== 'flag-only') {
      content += PRICE_NOTICE;
      handlers?.onDelta?.(PRICE_NOTICE);
    }
  } catch (err) {
    if (req.signal?.aborted && !(err instanceof AIProviderError)) {
      error = { code: 'aborted', message: 'The visitor disconnected before the answer completed.' };
    } else if (err instanceof AIProviderError) {
      error = { code: err.code, message: err.message };
      logger.warn({ chatbotId: chatbotId.toString(), provider, code: err.code, status: err.status }, 'AI provider error');
    } else {
      error = { code: 'internal', message: 'Unexpected error while generating the answer.' };
      logger.error({ err, chatbotId: chatbotId.toString() }, 'Chat pipeline failed');
    }
    content = content.trim() && error.code === 'aborted' ? content : VISITOR_ERROR_MESSAGE;
  }

  const latencyMs = Date.now() - started;
  const cost = result ? computeCost(provider, model, result.usage, chatbot.ai?.pricing, result.providerCostUsd) : {};
  const assistant = await Message.create({
    ownerId: chatbot.ownerId,
    chatbotId,
    conversationId: conversation._id,
    role: 'assistant',
    channel: req.channel,
    content: content.slice(0, 100_000),
    tokenUsage: result?.usage
      ? { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, totalTokens: result.usage.totalTokens }
      : undefined,
    metadata: {
      provider,
      model,
      latencyMs,
      finishReason: result?.finishReason,
      costUsd: cost.costUsd,
      costSource: cost.costSource,
      sources: knowledge.map((k) => ({ fileId: k.fileId, fileName: k.fileName, chunkId: k.chunkId, score: k.similarity, page: k.page })),
      productIds: verified.length ? verified.map((p) => p.productId) : undefined,
      browserProductIds: page.length ? page.map((p) => p.productId) : undefined,
      priceCheck,
      error,
      streamed,
    },
  });

  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $inc: { messageCount: 2 },
      $set: { lastMessageAt: new Date(), lastMessagePreview: truncate(req.message, 190) },
    },
  );

  const response: ChatResponse = {
    conversationId: conversation.conversationId,
    messageId: assistant._id.toString(),
    content,
    error: error && error.code !== 'aborted' ? error : undefined,
    refused: result?.refused,
  };
  if (req.channel === 'preview') {
    response.debug = {
      provider,
      model,
      knowledge: knowledge.map((k) => ({ fileName: k.fileName, page: k.page, similarity: k.similarity, via: k.via })),
      retrievalMode,
      retrievalWarning,
      verifiedProducts: verified.map((p) => p.productId),
      pageProducts: page.map((p) => p.productId),
      priceCheck,
      usage: result?.usage,
      costUsd: cost.costUsd,
      latencyMs,
    };
  }
  return response;
}
