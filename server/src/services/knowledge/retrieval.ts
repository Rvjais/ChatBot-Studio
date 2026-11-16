import { Types } from 'mongoose';
import { logger } from '../../config/logger.js';
import type { ChatbotDoc } from '../../models/Chatbot.js';
import { KnowledgeChunk } from '../../models/KnowledgeChunk.js';
import { keywords } from '../../utils/text.js';
import { AIProviderError } from '../ai/errors.js';
import { embedTexts, resolveEmbeddingConfig } from './embeddings.js';
import { vectorStore } from './vector-store.js';

export interface RetrievedChunk {
  chunkId: string;
  fileId: string;
  fileName?: string;
  content: string;
  page?: number;
  sheet?: string;
  rows?: string;
  /** Cosine similarity when found by vector search. */
  similarity?: number;
  via: ('vector' | 'keyword')[];
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  mode: 'hybrid' | 'keyword' | 'none';
  warning?: string;
}

const RRF_K = 60;

/**
 * Hybrid retrieval scoped to a single chatbot:
 *   1. semantic search over embeddings (when configured), and
 *   2. MongoDB full-text search (always available),
 * merged with Reciprocal Rank Fusion. Every query filters by chatbotId.
 */
export async function retrieveKnowledge(chatbot: ChatbotDoc, query: string, signal?: AbortSignal): Promise<RetrievalResult> {
  const chatbotId = chatbot._id as Types.ObjectId;
  const settings = chatbot.knowledgeSettings ?? { topK: 5, minScore: 0.3, maxContextChars: 12_000 };
  const topK = settings.topK ?? 5;

  if (!(await KnowledgeChunk.exists({ chatbotId }))) return { chunks: [], mode: 'none' };

  const fused = new Map<string, { score: number; similarity?: number; via: Set<'vector' | 'keyword'> }>();
  const add = (id: string, rank: number, via: 'vector' | 'keyword', similarity?: number) => {
    const entry = fused.get(id) ?? { score: 0, via: new Set() };
    entry.score += 1 / (RRF_K + rank);
    entry.via.add(via);
    if (similarity !== undefined) entry.similarity = similarity;
    fused.set(id, entry);
  };

  let warning: string | undefined;
  let usedVector = false;

  const vectorTask = (async () => {
    try {
      const cfg = resolveEmbeddingConfig(chatbot);
      if (!cfg) return;
      if (!(await KnowledgeChunk.exists({ chatbotId, embeddingModel: cfg.key }))) return;
      const [vector] = await embedTexts(cfg, [query], 'query', signal);
      const hits = await vectorStore.search(chatbotId.toString(), cfg.key, vector!, topK * 2, chatbot.kbVersion ?? 0);
      const minScore = settings.minScore ?? 0.3;
      hits
        .filter((h) => h.score >= minScore)
        .forEach((h, rank) => add(h.chunkId, rank, 'vector', h.score));
      usedVector = true;
    } catch (err) {
      warning = err instanceof AIProviderError ? err.message : 'Semantic search unavailable';
      logger.warn({ err, chatbotId: chatbotId.toString() }, 'Vector retrieval failed; falling back to keyword search');
    }
  })();

  const keywordTask = (async () => {
    const terms = keywords(query, 16);
    if (!terms.length) return;
    const docs = await KnowledgeChunk.find(
      { chatbotId, $text: { $search: terms.join(' ') } },
      { score: { $meta: 'textScore' } },
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(topK * 2)
      .select('_id')
      .lean();
    docs.forEach((d, rank) => add(d._id.toString(), rank, 'keyword'));
  })();

  await Promise.all([vectorTask, keywordTask]);

  const ranked = [...fused.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, topK);
  if (!ranked.length) return { chunks: [], mode: usedVector ? 'hybrid' : 'keyword', warning };

  const docs = await KnowledgeChunk.find({
    chatbotId, // re-assert tenant scope when loading content
    _id: { $in: ranked.map(([id]) => new Types.ObjectId(id)) },
  }).lean();
  const byId = new Map(docs.map((d) => [d._id.toString(), d]));

  const maxChars = settings.maxContextChars ?? 12_000;
  let used = 0;
  const chunks: RetrievedChunk[] = [];
  for (const [id, meta] of ranked) {
    const doc = byId.get(id);
    if (!doc) continue;
    if (used + doc.content.length > maxChars && chunks.length) break;
    used += doc.content.length;
    chunks.push({
      chunkId: id,
      fileId: doc.fileId.toString(),
      fileName: doc.metadata?.fileName ?? undefined,
      content: doc.content,
      page: doc.metadata?.page ?? undefined,
      sheet: doc.metadata?.sheet ?? undefined,
      rows: doc.metadata?.rows ?? undefined,
      similarity: meta.similarity,
      via: [...meta.via],
    });
  }
  return { chunks, mode: usedVector ? 'hybrid' : 'keyword', warning };
}
