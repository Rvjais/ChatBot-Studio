import type { Request, Response } from 'express';
import { Chatbot } from '../models/Chatbot.js';
import { KnowledgeFile } from '../models/KnowledgeFile.js';
import { CHATBOT_SECRET_FIELDS } from '../services/ai/ai.service.js';
import type { ChatbotDoc } from '../models/Chatbot.js';
import {
  addTextKnowledge,
  deleteKnowledgeFile,
  listFileChunks,
  reprocessAllKnowledge,
  reprocessKnowledgeFile,
  serializeKnowledgeFile,
  uploadKnowledgeFiles,
  type UploadedFile,
} from '../services/knowledge/knowledge.service.js';
import { retrieveKnowledge } from '../services/knowledge/retrieval.js';

export async function upload(req: Request, res: Response) {
  const files = (req.files as UploadedFile[] | undefined) ?? [];
  const created = await uploadKnowledgeFiles(req.chatbot!, files);
  res.status(201).json({ files: created.map(serializeKnowledgeFile) });
}

export async function addText(req: Request, res: Response) {
  const file = await addTextKnowledge(req.chatbot!, req.body.title, req.body.content);
  res.status(201).json({ file: serializeKnowledgeFile(file) });
}

export async function listForChatbot(req: Request, res: Response) {
  const files = await KnowledgeFile.find({ chatbotId: req.chatbot!._id }).sort({ createdAt: -1 }).limit(1000).lean();
  const totals = files.reduce(
    (acc, f) => {
      acc.files++;
      acc.chunks += f.chunkCount ?? 0;
      acc[f.processingStatus as 'pending' | 'processing' | 'completed' | 'failed']++;
      return acc;
    },
    { files: 0, chunks: 0, pending: 0, processing: 0, completed: 0, failed: 0 },
  );
  res.json({ files: files.map(serializeKnowledgeFile), totals });
}

/** All knowledge files across the user's chatbots (sidebar "Knowledge Base" page). */
export async function listAll(req: Request, res: Response) {
  const q = req.validatedQuery as { chatbotId?: string; status?: string; page: number; limit: number };
  const filter: Record<string, unknown> = { ownerId: req.user!.id };
  if (q.chatbotId) filter.chatbotId = q.chatbotId;
  if (q.status) filter.processingStatus = q.status;
  const [items, total, chatbots] = await Promise.all([
    KnowledgeFile.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    KnowledgeFile.countDocuments(filter),
    Chatbot.find({ ownerId: req.user!.id }).select('name').lean(),
  ]);
  const names = new Map(chatbots.map((c) => [c._id.toString(), c.name]));
  res.json({
    items: items.map((f) => ({ ...serializeKnowledgeFile(f), chatbotName: names.get(f.chatbotId.toString()) ?? '' })),
    total,
    page: q.page,
    limit: q.limit,
  });
}

export async function remove(req: Request, res: Response) {
  await deleteKnowledgeFile(req.chatbot!, String(req.params.fileId));
  res.status(204).end();
}

export async function reprocess(req: Request, res: Response) {
  const file = await reprocessKnowledgeFile(req.chatbot!, String(req.params.fileId));
  res.json({ file: serializeKnowledgeFile(file) });
}

export async function reprocessAll(req: Request, res: Response) {
  const count = await reprocessAllKnowledge(req.chatbot!);
  res.json({ queued: count });
}

export async function chunks(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const result = await listFileChunks(req.chatbot!, String(req.params.fileId), page, limit);
  res.json({ ...result, page, limit });
}

/** Runs retrieval exactly as a chat would, so owners can verify what the bot will "see". */
export async function searchTest(req: Request, res: Response) {
  const chatbot = (await Chatbot.findById(req.chatbot!._id).select(CHATBOT_SECRET_FIELDS)) as ChatbotDoc;
  const result = await retrieveKnowledge(chatbot, req.body.query);
  res.json(result);
}
