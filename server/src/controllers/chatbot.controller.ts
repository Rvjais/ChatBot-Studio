import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Chatbot, type ChatbotDoc } from '../models/Chatbot.js';
import { Conversation } from '../models/Conversation.js';
import { KnowledgeFile } from '../models/KnowledgeFile.js';
import { Product } from '../models/Product.js';
import { CHATBOT_SECRET_FIELDS } from '../services/ai/ai.service.js';
import {
  applyAiConfig,
  assertChatbotQuota,
  assertIdentifierAvailable,
  deleteChatbotCascade,
  duplicateChatbot,
  rotateSyncKey,
  revokeSyncKey,
  serializeChatbot,
  uniqueIdentifier,
  type AiConfigUpdate,
} from '../services/chatbot.service.js';
import { embedSnippets } from '../services/widget/embed.js';
import { generatePublicId } from '../utils/crypto.js';
import { escapeRegex } from '../utils/text.js';
import { assertSafeBaseUrl } from '../utils/ssrf.js';

async function statsFor(ids: Types.ObjectId[]) {
  const [conv, files, products] = await Promise.all([
    Conversation.aggregate<{ _id: Types.ObjectId; n: number; last: Date }>([
      { $match: { chatbotId: { $in: ids }, channel: 'widget' } },
      { $group: { _id: '$chatbotId', n: { $sum: 1 }, last: { $max: '$lastMessageAt' } } },
    ]),
    KnowledgeFile.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { chatbotId: { $in: ids } } }, { $group: { _id: '$chatbotId', n: { $sum: 1 } } }]),
    Product.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { chatbotId: { $in: ids } } }, { $group: { _id: '$chatbotId', n: { $sum: 1 } } }]),
  ]);
  const map = (rows: { _id: Types.ObjectId; n: number }[]) => new Map(rows.map((r) => [r._id.toString(), r.n]));
  const c = map(conv);
  const f = map(files);
  const p = map(products);
  const last = new Map(conv.map((r) => [r._id.toString(), r.last]));
  return (id: string) => ({
    conversations: c.get(id) ?? 0,
    knowledgeFiles: f.get(id) ?? 0,
    products: p.get(id) ?? 0,
    lastActivityAt: last.get(id)?.getTime() ?? 0,
  });
}

export async function listChatbots(req: Request, res: Response) {
  const q = req.validatedQuery as { q?: string; status?: string; provider?: string; sort: string; page: number; limit: number };
  const filter: Record<string, unknown> = { ownerId: req.user!.id };
  if (q.status) filter.status = q.status;
  if (q.provider) filter['ai.provider'] = q.provider;
  if (q.q) {
    const re = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ name: re }, { description: re }, { identifier: re }, { publicId: q.q }];
  }
  const sort: Record<string, 1 | -1> = q.sort === 'name' ? { name: 1 } : q.sort === 'created' ? { createdAt: -1 } : { updatedAt: -1 };
  const [items, total] = await Promise.all([
    Chatbot.find(filter).sort(sort).skip((q.page - 1) * q.limit).limit(q.limit),
    Chatbot.countDocuments(filter),
  ]);
  const stats = await statsFor(items.map((c) => c._id));
  res.json({
    items: items.map((c) => serializeChatbot(c as ChatbotDoc, stats(c._id.toString()))),
    total,
    page: q.page,
    limit: q.limit,
  });
}

export async function createChatbot(req: Request, res: Response) {
  const ownerId = req.user!.id;
  await assertChatbotQuota(ownerId);
  const { ai, identifier, ...fields } = req.body as Record<string, any>;
  if (identifier) await assertIdentifierAvailable(ownerId, identifier);
  const chatbot = new Chatbot({
    ...fields,
    ownerId,
    identifier: identifier ?? (await uniqueIdentifier(ownerId, fields.name)),
    publicId: generatePublicId(),
    widget: { title: fields.name, ...(fields.widget ?? {}) },
  }) as ChatbotDoc;
  if (ai) {
    await assertSafeBaseUrl(ai.baseUrl);
    applyAiConfig(chatbot, ai as AiConfigUpdate);
  }
  await chatbot.save();
  res.status(201).json({ chatbot: serializeChatbot(chatbot) });
}

export async function getChatbot(req: Request, res: Response) {
  const stats = await statsFor([req.chatbot!._id]);
  res.json({ chatbot: serializeChatbot(req.chatbot!, stats(req.chatbot!._id.toString())) });
}

export async function updateChatbot(req: Request, res: Response) {
  const chatbot = req.chatbot!;
  const body = req.body as Record<string, any>;
  if (body.identifier && body.identifier !== chatbot.identifier) {
    await assertIdentifierAvailable(chatbot.ownerId as Types.ObjectId, body.identifier, chatbot._id);
  }
  // Nested objects are merged so partial updates never wipe sibling settings.
  for (const key of ['personality', 'knowledgeSettings', 'productSettings', 'widget'] as const) {
    if (body[key]) {
      const raw = chatbot.get(key) as { toObject?: () => Record<string, unknown> } | undefined;
      const current = (raw?.toObject?.() ?? raw ?? {}) as Record<string, unknown>;
      chatbot.set(key, { ...current, ...body[key] });
      delete body[key];
    }
  }
  chatbot.set(body);
  await chatbot.save();
  res.json({ chatbot: serializeChatbot(chatbot) });
}

export async function setStatus(req: Request, res: Response) {
  req.chatbot!.status = req.body.status;
  await req.chatbot!.save();
  res.json({ chatbot: serializeChatbot(req.chatbot!) });
}

export async function deleteChatbot(req: Request, res: Response) {
  await deleteChatbotCascade(req.chatbot!._id);
  res.status(204).end();
}

export async function duplicate(req: Request, res: Response) {
  const copy = await duplicateChatbot(req.chatbot!._id, req.user!.id, req.body);
  res.status(201).json({ chatbot: serializeChatbot(copy) });
}

export async function updateAiConfig(req: Request, res: Response) {
  const chatbot = (await Chatbot.findById(req.chatbot!._id).select(CHATBOT_SECRET_FIELDS)) as ChatbotDoc;
  const update = req.body as AiConfigUpdate;
  await assertSafeBaseUrl(update.baseUrl);
  await assertSafeBaseUrl(update.embedding?.baseUrl);
  applyAiConfig(chatbot, update);
  await chatbot.save();
  res.json({ chatbot: serializeChatbot(chatbot) });
}

export async function getEmbed(req: Request, res: Response) {
  res.json(embedSnippets(req.chatbot!));
}

export async function createSyncKey(req: Request, res: Response) {
  const key = await rotateSyncKey(req.chatbot!);
  res.status(201).json({ key, message: 'Store this key securely — it will not be shown again.' });
}

export async function deleteSyncKey(req: Request, res: Response) {
  await revokeSyncKey(req.chatbot!);
  res.status(204).end();
}
