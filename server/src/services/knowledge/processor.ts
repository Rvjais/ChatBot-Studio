import { Types } from 'mongoose';
import { logger } from '../../config/logger.js';
import { Chatbot, type ChatbotDoc } from '../../models/Chatbot.js';
import { KnowledgeChunk } from '../../models/KnowledgeChunk.js';
import { KnowledgeFile } from '../../models/KnowledgeFile.js';
import { estimateTokens } from '../../utils/text.js';
import { CHATBOT_SECRET_FIELDS } from '../ai/ai.service.js';
import { AIProviderError } from '../ai/errors.js';
import { chunkSegments } from './chunker.js';
import { embedTexts, resolveEmbeddingConfig } from './embeddings.js';
import { extractSegments } from './extractors.js';
import { storage } from './storage.js';
import { vectorStore } from './vector-store.js';

const MAX_CHUNKS_PER_FILE = 5000;
const INSERT_BATCH = 500;

/** Thrown for failures that are permanent for this file (bad content) — no retry. */
class PermanentProcessingError extends Error {}

/**
 * Background pipeline for one knowledge file:
 * read → extract → normalize → chunk → embed (optional) → store chunks → mark completed.
 * Runs in the job worker, never inside a chat request.
 */
export async function processKnowledgeFile(fileId: string): Promise<void> {
  const file = await KnowledgeFile.findById(fileId).select('+storagePath');
  if (!file) return; // deleted before processing started

  file.processingStatus = 'processing';
  file.error = undefined;
  file.warning = undefined;
  await file.save();

  const chatbotId = file.chatbotId as Types.ObjectId;
  try {
    const chatbot = (await Chatbot.findById(chatbotId).select(CHATBOT_SECRET_FIELDS)) as ChatbotDoc | null;
    if (!chatbot) throw new PermanentProcessingError('Chatbot no longer exists');

    const buffer = await storage.read(file.storagePath);
    let segments;
    try {
      segments = await extractSegments(buffer, file.fileType);
    } catch (err) {
      throw new PermanentProcessingError(`Could not read file contents: ${(err as Error).message}`.slice(0, 500));
    }
    const chunks = chunkSegments(segments).slice(0, MAX_CHUNKS_PER_FILE);
    if (!chunks.length) {
      throw new PermanentProcessingError(
        file.fileType === 'pdf'
          ? 'No extractable text found. Scanned/image-only PDFs need OCR before upload.'
          : 'No extractable text found in this file.',
      );
    }

    // Embeddings are best-effort: if they fail, chunks are still searchable by keyword.
    let vectors: number[][] | null = null;
    let embeddingKey: string | undefined;
    let warning: string | undefined;
    try {
      const cfg = resolveEmbeddingConfig(chatbot);
      if (cfg) {
        vectors = await embedTexts(cfg, chunks.map((c) => c.content), 'document');
        embeddingKey = cfg.key;
      }
    } catch (err) {
      warning = `Embeddings unavailable (${err instanceof AIProviderError ? err.message : 'unexpected error'}). Keyword search will be used for this file.`;
      logger.warn({ err, fileId }, 'Embedding generation failed');
    }

    await KnowledgeChunk.deleteMany({ fileId: file._id });
    const docs = chunks.map((c, i) => ({
      ownerId: file.ownerId,
      chatbotId,
      fileId: file._id,
      index: i,
      content: c.content,
      tokenEstimate: estimateTokens(c.content),
      ...(vectors ? { embedding: vectors[i], embeddingModel: embeddingKey } : {}),
      metadata: { fileName: file.fileName, page: c.meta.page, sheet: c.meta.sheet, rows: c.meta.rows },
    }));
    for (let i = 0; i < docs.length; i += INSERT_BATCH) {
      await KnowledgeChunk.insertMany(docs.slice(i, i + INSERT_BATCH), { ordered: false });
    }

    // The file may have been deleted while we were working: clean up and stop.
    if (!(await KnowledgeFile.exists({ _id: file._id }))) {
      await KnowledgeChunk.deleteMany({ fileId: file._id });
      return;
    }

    await KnowledgeFile.updateOne(
      { _id: file._id },
      {
        $set: {
          processingStatus: 'completed',
          chunkCount: docs.length,
          embeddedChunkCount: vectors ? docs.length : 0,
          characterCount: chunks.reduce((n, c) => n + c.content.length, 0),
          embeddingModel: embeddingKey,
          processedAt: new Date(),
          ...(warning ? { warning } : {}),
        },
        $unset: { error: 1, ...(warning ? {} : { warning: 1 }) },
      },
    );
  } catch (err) {
    const permanent = err instanceof PermanentProcessingError;
    await KnowledgeFile.updateOne(
      { _id: file._id },
      { $set: { processingStatus: 'failed', error: permanent ? err.message : 'Processing failed due to an internal error. Try reprocessing.' } },
    );
    if (!permanent) logger.error({ err, fileId }, 'Knowledge file processing failed');
  } finally {
    await Chatbot.updateOne({ _id: chatbotId }, { $inc: { kbVersion: 1 } });
    vectorStore.invalidate(chatbotId.toString());
  }
}
