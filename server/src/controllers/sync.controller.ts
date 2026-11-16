import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { Chatbot, type ChatbotDoc } from '../models/Chatbot.js';
import { deleteProductByBusinessId, importProducts, listProducts } from '../services/products/product.service.js';
import { sha256, timingSafeEqualHex } from '../utils/crypto.js';
import { notFound, unauthorized } from '../utils/errors.js';

/**
 * Authenticates server-to-server product sync requests with a per-chatbot secret:
 *   Authorization: Bearer cbsk_<chatbotId>_<secret>
 * Only the SHA-256 of the key is stored; comparison is constant-time.
 */
export async function requireSyncKey(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const match = /^Bearer (cbsk_([a-f0-9]{24})_[A-Za-z0-9_-]{20,})$/.exec(header);
  if (!match) return next(unauthorized('Missing or malformed sync key'));
  const [, key, chatbotId] = match as unknown as [string, string, string];
  const chatbot = (await Chatbot.findById(chatbotId).select('+syncKey.hash')) as ChatbotDoc | null;
  const stored = chatbot?.syncKey?.hash;
  if (!chatbot || !stored || !timingSafeEqualHex(stored, sha256(key))) return next(unauthorized('Invalid sync key'));
  req.chatbot = chatbot;
  await Chatbot.updateOne({ _id: chatbot._id }, { $set: { 'syncKey.lastUsedAt': new Date() } });
  next();
}

export async function syncProducts(req: Request, res: Response) {
  const chatbot = req.chatbot!;
  const { mode, products } = req.body as { mode: 'upsert' | 'replace'; products: unknown[] };
  const report = await importProducts(chatbot.ownerId as Types.ObjectId, chatbot._id as Types.ObjectId, products, { mode, source: 'sync' });
  res.json({ report });
}

export async function listSyncedProducts(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const result = await listProducts(req.chatbot!._id as Types.ObjectId, { page, limit });
  res.json({ ...result, page, limit });
}

export async function deleteSyncedProduct(req: Request, res: Response) {
  const ok = await deleteProductByBusinessId(req.chatbot!._id as Types.ObjectId, String(req.params.productId));
  if (!ok) throw notFound('Product');
  res.status(204).end();
}
