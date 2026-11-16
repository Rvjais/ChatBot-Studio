import crypto from 'node:crypto';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { PROVIDERS, type ProviderId } from '../config/providers.js';
import { Chatbot, type ChatbotDoc } from '../models/Chatbot.js';
import { Conversation } from '../models/Conversation.js';
import { Job } from '../models/Job.js';
import { KnowledgeChunk } from '../models/KnowledgeChunk.js';
import { KnowledgeFile } from '../models/KnowledgeFile.js';
import { Message } from '../models/Message.js';
import { Product } from '../models/Product.js';
import { decryptSecret, encryptSecret, generatePublicId, keyHint, randomBase62, sha256 } from '../utils/crypto.js';
import { conflict, unprocessable } from '../utils/errors.js';
import { slugify } from '../utils/text.js';
import { CHATBOT_SECRET_FIELDS, secretContext } from './ai/ai.service.js';
import { storage } from './knowledge/storage.js';
import { vectorStore } from './knowledge/vector-store.js';

/**
 * Owner-facing representation. Secrets are reduced to presence flags and a 4-char hint;
 * ciphertexts and storage paths are never included.
 */
export function serializeChatbot(c: ChatbotDoc, stats?: Record<string, number>) {
  const ai = c.ai!;
  const emb = c.embedding!;
  return {
    id: c._id.toString(),
    publicId: c.publicId,
    name: c.name,
    description: c.description,
    identifier: c.identifier,
    status: c.status,
    language: c.language,
    welcomeMessage: c.welcomeMessage,
    placeholder: c.placeholder,
    fallbackMessage: c.fallbackMessage,
    systemPrompt: c.systemPrompt,
    personality: { tones: c.personality?.tones ?? [], customInstructions: c.personality?.customInstructions ?? '' },
    ai: {
      provider: ai.provider,
      model: ai.model,
      hasApiKey: Boolean(ai.apiKeyLast4) || Boolean(ai.encryptedApiKey),
      apiKeyLast4: ai.apiKeyLast4 ?? null,
      baseUrl: ai.baseUrl ?? '',
      authHeader: ai.authHeader ?? 'Authorization',
      authPrefix: ai.authPrefix ?? 'Bearer ',
      extraHeaderNames: ai.extraHeaderNames ?? [],
      generation: {
        temperature: ai.generation?.temperature ?? null,
        maxOutputTokens: ai.generation?.maxOutputTokens ?? 1024,
        topP: ai.generation?.topP ?? null,
        frequencyPenalty: ai.generation?.frequencyPenalty ?? null,
        presencePenalty: ai.generation?.presencePenalty ?? null,
        effort: ai.generation?.effort ?? null,
      },
      pricing: {
        inputPerMillion: ai.pricing?.inputPerMillion ?? null,
        outputPerMillion: ai.pricing?.outputPerMillion ?? null,
      },
      contextWindow: ai.contextWindow ?? null,
      refusalFallback: ai.refusalFallback !== false,
      lastTest: ai.lastTest?.status
        ? { status: ai.lastTest.status, message: ai.lastTest.message, testedAt: ai.lastTest.testedAt, latencyMs: ai.lastTest.latencyMs }
        : null,
    },
    embedding: {
      provider: emb.provider ?? 'none',
      model: emb.model ?? '',
      useChatCredentials: emb.useChatCredentials !== false,
      hasApiKey: Boolean(emb.apiKeyLast4),
      apiKeyLast4: emb.apiKeyLast4 ?? null,
      baseUrl: emb.baseUrl ?? '',
      dimensions: emb.dimensions ?? null,
    },
    knowledgeSettings: c.knowledgeSettings,
    productSettings: c.productSettings,
    widget: c.widget,
    domainRestrictionEnabled: c.domainRestrictionEnabled,
    allowedDomains: c.allowedDomains,
    syncKey: c.syncKey?.prefix ? { prefix: c.syncKey.prefix, createdAt: c.syncKey.createdAt, lastUsedAt: c.syncKey.lastUsedAt ?? null } : null,
    createdAt: (c as unknown as { createdAt: Date }).createdAt,
    updatedAt: (c as unknown as { updatedAt: Date }).updatedAt,
    ...(stats ? { stats } : {}),
  };
}

export async function uniqueIdentifier(ownerId: Types.ObjectId, desired: string, excludeId?: Types.ObjectId): Promise<string> {
  const base = slugify(desired, 56) || 'chatbot';
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const clash = await Chatbot.exists({ ownerId, identifier: candidate, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
    if (!clash) return candidate;
  }
  return `${base}-${randomBase62(6).toLowerCase()}`;
}

export async function assertChatbotQuota(ownerId: Types.ObjectId) {
  const count = await Chatbot.countDocuments({ ownerId });
  if (count >= env.MAX_CHATBOTS_PER_USER) {
    throw unprocessable(`You have reached the limit of ${env.MAX_CHATBOTS_PER_USER} chatbots.`);
  }
}

export async function assertIdentifierAvailable(ownerId: Types.ObjectId, identifier: string, excludeId?: Types.ObjectId) {
  const clash = await Chatbot.exists({ ownerId, identifier, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
  if (clash) throw conflict(`You already have a chatbot with the identifier "${identifier}"`);
}

export interface AiConfigUpdate {
  provider?: ProviderId;
  model?: string;
  /** undefined = keep existing key, null/"" = remove key, string = replace key. */
  apiKey?: string | null;
  baseUrl?: string | null;
  authHeader?: string;
  authPrefix?: string;
  /** undefined = keep, null = clear, object = replace all extra headers. */
  extraHeaders?: Record<string, string> | null;
  generation?: Partial<Record<'temperature' | 'maxOutputTokens' | 'topP' | 'frequencyPenalty' | 'presencePenalty', number | null>> & {
    effort?: string | null;
  };
  pricing?: { inputPerMillion?: number | null; outputPerMillion?: number | null };
  contextWindow?: number | null;
  refusalFallback?: boolean;
  embedding?: {
    provider?: string;
    model?: string | null;
    useChatCredentials?: boolean;
    apiKey?: string | null;
    baseUrl?: string | null;
    dimensions?: number | null;
  };
}

/** Applies an AI configuration update, encrypting any new secrets with record-bound AAD. */
export function applyAiConfig(chatbot: ChatbotDoc, update: AiConfigUpdate) {
  const id = chatbot._id.toString();
  const ai = chatbot.ai!;
  const providerChanged = update.provider && update.provider !== ai.provider;
  if (update.provider) ai.provider = update.provider;
  if (update.model !== undefined) ai.model = update.model.trim();

  // Switching provider without supplying a new key drops the old key (it belongs to another vendor).
  if (providerChanged && update.apiKey === undefined) update.apiKey = null;
  if (update.apiKey !== undefined) {
    if (update.apiKey) {
      ai.encryptedApiKey = encryptSecret(update.apiKey.trim(), secretContext.aiKey(id));
      ai.apiKeyLast4 = keyHint(update.apiKey.trim());
    } else {
      ai.encryptedApiKey = undefined;
      ai.apiKeyLast4 = undefined;
    }
    ai.lastTest = undefined;
  }
  if (update.baseUrl !== undefined) ai.baseUrl = update.baseUrl?.trim() || undefined;
  if (!PROVIDERS[ai.provider as ProviderId].allowCustomBaseUrl) ai.baseUrl = undefined;
  if (update.authHeader !== undefined) ai.authHeader = update.authHeader || 'Authorization';
  if (update.authPrefix !== undefined) ai.authPrefix = update.authPrefix;
  if (update.extraHeaders !== undefined) {
    const headers = update.extraHeaders ?? {};
    const names = Object.keys(headers);
    ai.encryptedExtraHeaders = names.length ? encryptSecret(JSON.stringify(headers), secretContext.aiHeaders(id)) : undefined;
    ai.extraHeaderNames = names;
  }
  if (update.generation) {
    const g = ai.generation ?? ({} as NonNullable<typeof ai.generation>);
    for (const key of ['temperature', 'maxOutputTokens', 'topP', 'frequencyPenalty', 'presencePenalty'] as const) {
      if (update.generation[key] !== undefined) (g as Record<string, unknown>)[key] = update.generation[key] ?? undefined;
    }
    if (update.generation.effort !== undefined) (g as Record<string, unknown>).effort = update.generation.effort ?? undefined;
    ai.generation = g;
  }
  if (update.pricing) {
    ai.pricing = {
      inputPerMillion: update.pricing.inputPerMillion ?? undefined,
      outputPerMillion: update.pricing.outputPerMillion ?? undefined,
    };
  }
  if (update.contextWindow !== undefined) ai.contextWindow = update.contextWindow ?? undefined;
  if (update.refusalFallback !== undefined) ai.refusalFallback = update.refusalFallback;
  if (providerChanged || update.model !== undefined || update.baseUrl !== undefined) ai.lastTest = undefined;

  if (update.embedding) {
    const emb = chatbot.embedding!;
    const e = update.embedding;
    const embProviderChanged = e.provider !== undefined && e.provider !== emb.provider;
    if (e.provider !== undefined) emb.provider = e.provider as NonNullable<typeof emb.provider>;
    if (e.model !== undefined) emb.model = e.model?.trim() || undefined;
    if (e.useChatCredentials !== undefined) emb.useChatCredentials = e.useChatCredentials;
    if (embProviderChanged && e.apiKey === undefined) e.apiKey = null;
    if (e.apiKey !== undefined) {
      if (e.apiKey) {
        emb.encryptedApiKey = encryptSecret(e.apiKey.trim(), secretContext.embeddingKey(id));
        emb.apiKeyLast4 = keyHint(e.apiKey.trim());
      } else {
        emb.encryptedApiKey = undefined;
        emb.apiKeyLast4 = undefined;
      }
    }
    if (e.baseUrl !== undefined) emb.baseUrl = e.baseUrl?.trim() || undefined;
    if (e.dimensions !== undefined) emb.dimensions = e.dimensions ?? undefined;
  }
}

/** Creates a copy of a chatbot (settings, products and/or knowledge), re-encrypting secrets for the new record. */
export async function duplicateChatbot(
  sourceId: Types.ObjectId,
  ownerId: Types.ObjectId,
  opts: { name?: string; includeProducts: boolean; includeKnowledge: boolean },
): Promise<ChatbotDoc> {
  await assertChatbotQuota(ownerId);
  const source = (await Chatbot.findOne({ _id: sourceId, ownerId }).select(CHATBOT_SECRET_FIELDS)) as ChatbotDoc;
  const plain = source.toObject() as Record<string, any>;
  const newId = new Types.ObjectId();
  const name = (opts.name || `${source.name} (copy)`).slice(0, 100);

  delete plain._id;
  delete plain.createdAt;
  delete plain.updatedAt;
  delete plain.__v;
  delete plain.syncKey;
  const reencrypt = (cipher: string | undefined, from: string, to: string) => (cipher ? encryptSecret(decryptSecret(cipher, from), to) : undefined);
  const srcId = source._id.toString();
  const dstId = newId.toString();
  plain.ai.encryptedApiKey = reencrypt(source.ai?.encryptedApiKey ?? undefined, secretContext.aiKey(srcId), secretContext.aiKey(dstId));
  plain.ai.encryptedExtraHeaders = reencrypt(source.ai?.encryptedExtraHeaders ?? undefined, secretContext.aiHeaders(srcId), secretContext.aiHeaders(dstId));
  plain.embedding.encryptedApiKey = reencrypt(source.embedding?.encryptedApiKey ?? undefined, secretContext.embeddingKey(srcId), secretContext.embeddingKey(dstId));

  const copy = (await Chatbot.create({
    ...plain,
    _id: newId,
    name,
    identifier: await uniqueIdentifier(ownerId, name),
    publicId: generatePublicId(),
    status: 'inactive',
    kbVersion: 0,
    productsVersion: 0,
  })) as ChatbotDoc;

  if (opts.includeProducts) {
    const cursor = Product.find({ chatbotId: sourceId }).lean().cursor();
    let batch: Record<string, unknown>[] = [];
    for await (const p of cursor) {
      const { _id, ...rest } = p as Record<string, unknown>;
      batch.push({ ...rest, chatbotId: newId });
      if (batch.length >= 1000) {
        await Product.insertMany(batch, { ordered: false });
        batch = [];
      }
    }
    if (batch.length) await Product.insertMany(batch, { ordered: false });
  }

  if (opts.includeKnowledge) {
    const files = await KnowledgeFile.find({ chatbotId: sourceId, processingStatus: 'completed' }).select('+storagePath').lean();
    for (const f of files) {
      const { _id, ...rest } = f as Record<string, any>;
      const newFileId = new Types.ObjectId();
      const storagePath = await storage.copy(f.storagePath, ownerId.toString(), dstId);
      await KnowledgeFile.create({ ...rest, _id: newFileId, chatbotId: newId, storagePath });
      const chunks = await KnowledgeChunk.find({ fileId: f._id }).select('+embedding').lean();
      for (let i = 0; i < chunks.length; i += 500) {
        await KnowledgeChunk.insertMany(
          chunks.slice(i, i + 500).map(({ _id: _cid, ...c }) => ({ ...c, chatbotId: newId, fileId: newFileId, metadata: c.metadata })),
          { ordered: false },
        );
      }
    }
  }
  return copy;
}

/** Deletes a chatbot and everything that belongs to it (files on disk included). */
export async function deleteChatbotCascade(chatbotId: Types.ObjectId): Promise<void> {
  const files = await KnowledgeFile.find({ chatbotId }).select('+storagePath').lean();
  await Promise.all(files.map((f) => storage.remove(f.storagePath).catch(() => undefined)));
  const conversations = await Conversation.find({ chatbotId }).select('_id').lean();
  await Promise.all([
    KnowledgeChunk.deleteMany({ chatbotId }),
    KnowledgeFile.deleteMany({ chatbotId }),
    Product.deleteMany({ chatbotId }),
    Message.deleteMany({ chatbotId }),
    Conversation.deleteMany({ chatbotId }),
    Job.deleteMany({ 'payload.fileId': { $in: files.map((f) => f._id.toString()) } }),
  ]);
  void conversations;
  await Chatbot.deleteOne({ _id: chatbotId });
  vectorStore.invalidate(chatbotId.toString());
}

/** Issues a new product-sync secret. The full key is returned once and only its hash is stored. */
export async function rotateSyncKey(chatbot: ChatbotDoc): Promise<string> {
  const secret = crypto.randomBytes(32).toString('base64url');
  const key = `cbsk_${chatbot._id.toString()}_${secret}`;
  await Chatbot.updateOne(
    { _id: chatbot._id },
    { $set: { 'syncKey.hash': sha256(key), 'syncKey.prefix': `cbsk_…${secret.slice(-6)}`, 'syncKey.createdAt': new Date() }, $unset: { 'syncKey.lastUsedAt': 1 } },
  );
  return key;
}

export async function revokeSyncKey(chatbot: ChatbotDoc): Promise<void> {
  await Chatbot.updateOne({ _id: chatbot._id }, { $unset: { syncKey: 1 } });
}
