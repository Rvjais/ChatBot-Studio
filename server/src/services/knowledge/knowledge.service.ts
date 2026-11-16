import path from 'node:path';
import type { Types } from 'mongoose';
import { cancelJobsForFile, enqueueJob, JOB_TYPES } from '../../jobs/queue.js';
import { Chatbot, type ChatbotDoc } from '../../models/Chatbot.js';
import { KnowledgeChunk } from '../../models/KnowledgeChunk.js';
import { KnowledgeFile, type KnowledgeFileDoc } from '../../models/KnowledgeFile.js';
import { sha256 } from '../../utils/crypto.js';
import { badRequest, notFound, unprocessable } from '../../utils/errors.js';
import { detectFileType, sanitizeFileName } from './file-validation.js';
import { storage } from './storage.js';
import { vectorStore } from './vector-store.js';

export const MAX_FILES_PER_CHATBOT = 500;

export function serializeKnowledgeFile(f: KnowledgeFileDoc | Record<string, any>) {
  return {
    id: String(f._id),
    chatbotId: String(f.chatbotId),
    fileName: f.fileName,
    fileType: f.fileType,
    size: f.size,
    source: f.source ?? 'upload',
    processingStatus: f.processingStatus,
    error: f.error ?? null,
    warning: f.warning ?? null,
    chunkCount: f.chunkCount ?? 0,
    embeddedChunkCount: f.embeddedChunkCount ?? 0,
    characterCount: f.characterCount ?? 0,
    processedAt: f.processedAt ?? null,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

async function enqueueProcessing(fileId: string) {
  await enqueueJob(JOB_TYPES.processKnowledgeFile, { fileId });
}

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

/**
 * Validates every file first (all-or-nothing), stores them, records them as "pending" and
 * queues background processing. Extraction/embedding never happens in the request.
 */
export async function uploadKnowledgeFiles(chatbot: ChatbotDoc, files: UploadedFile[]) {
  if (!files.length) throw badRequest('No files were uploaded (field name: "files")');
  const existing = await KnowledgeFile.countDocuments({ chatbotId: chatbot._id });
  if (existing + files.length > MAX_FILES_PER_CHATBOT) {
    throw unprocessable(`A chatbot can have at most ${MAX_FILES_PER_CHATBOT} knowledge files`);
  }

  const validated = files.map((f) => {
    const fileName = sanitizeFileName(f.originalname);
    return { file: f, fileName, fileType: detectFileType(fileName, f.buffer) };
  });

  const ownerId = chatbot.ownerId as Types.ObjectId;
  const created: KnowledgeFileDoc[] = [];
  for (const { file, fileName, fileType } of validated) {
    const storagePath = await storage.save(ownerId.toString(), chatbot._id.toString(), path.extname(fileName).slice(1) || fileType, file.buffer);
    const doc = await KnowledgeFile.create({
      ownerId,
      chatbotId: chatbot._id,
      fileName,
      fileType,
      mimeType: file.mimetype?.slice(0, 200),
      size: file.size,
      checksum: sha256(file.buffer),
      storagePath,
      processingStatus: 'pending',
      source: 'upload',
    });
    created.push(doc);
    await enqueueProcessing(doc._id.toString());
  }
  return created;
}

/** Adds a plain-text knowledge entry (FAQ, policy snippet…) as a .txt knowledge file. */
export async function addTextKnowledge(chatbot: ChatbotDoc, title: string, content: string) {
  const ownerId = chatbot.ownerId as Types.ObjectId;
  const buffer = Buffer.from(content, 'utf8');
  const fileName = `${sanitizeFileName(title).replace(/\.txt$/i, '')}.txt`;
  const storagePath = await storage.save(ownerId.toString(), chatbot._id.toString(), 'txt', buffer);
  const doc = await KnowledgeFile.create({
    ownerId,
    chatbotId: chatbot._id,
    fileName,
    fileType: 'txt',
    mimeType: 'text/plain',
    size: buffer.length,
    checksum: sha256(buffer),
    storagePath,
    processingStatus: 'pending',
    source: 'text',
  });
  await enqueueProcessing(doc._id.toString());
  return doc;
}

export async function deleteKnowledgeFile(chatbot: ChatbotDoc, fileId: string) {
  const file = await KnowledgeFile.findOne({ _id: fileId, chatbotId: chatbot._id }).select('+storagePath');
  if (!file) throw notFound('Knowledge file');
  await cancelJobsForFile(file._id.toString());
  await KnowledgeChunk.deleteMany({ fileId: file._id, chatbotId: chatbot._id });
  await KnowledgeFile.deleteOne({ _id: file._id });
  await storage.remove(file.storagePath).catch(() => undefined);
  await Chatbot.updateOne({ _id: chatbot._id }, { $inc: { kbVersion: 1 } });
  vectorStore.invalidate(chatbot._id.toString());
}

export async function reprocessKnowledgeFile(chatbot: ChatbotDoc, fileId: string) {
  const file = await KnowledgeFile.findOneAndUpdate(
    { _id: fileId, chatbotId: chatbot._id, processingStatus: { $ne: 'processing' } },
    { $set: { processingStatus: 'pending' }, $unset: { error: 1, warning: 1 } },
    { new: true },
  );
  if (!file) {
    if (await KnowledgeFile.exists({ _id: fileId, chatbotId: chatbot._id })) throw badRequest('This file is currently being processed');
    throw notFound('Knowledge file');
  }
  await enqueueProcessing(file._id.toString());
  return file;
}

/** Re-runs processing for every file (e.g. after changing the embedding model). */
export async function reprocessAllKnowledge(chatbot: ChatbotDoc): Promise<number> {
  const files = await KnowledgeFile.find({ chatbotId: chatbot._id, processingStatus: { $ne: 'processing' } }).select('_id').lean();
  await KnowledgeFile.updateMany({ _id: { $in: files.map((f) => f._id) } }, { $set: { processingStatus: 'pending' }, $unset: { error: 1, warning: 1 } });
  for (const f of files) await enqueueProcessing(f._id.toString());
  return files.length;
}

export async function listFileChunks(chatbot: ChatbotDoc, fileId: string, page: number, limit: number) {
  if (!(await KnowledgeFile.exists({ _id: fileId, chatbotId: chatbot._id }))) throw notFound('Knowledge file');
  const filter = { fileId, chatbotId: chatbot._id };
  const [items, total] = await Promise.all([
    KnowledgeChunk.find(filter).sort({ index: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    KnowledgeChunk.countDocuments(filter),
  ]);
  return {
    items: items.map((c) => ({
      id: c._id.toString(),
      index: c.index,
      content: c.content,
      tokenEstimate: c.tokenEstimate,
      embedded: Boolean(c.embeddingModel),
      metadata: { page: c.metadata?.page ?? null, sheet: c.metadata?.sheet ?? null, rows: c.metadata?.rows ?? null },
    })),
    total,
  };
}
