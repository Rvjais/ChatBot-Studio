import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { KnowledgeChunk } from '../../models/KnowledgeChunk.js';

export interface VectorHit {
  chunkId: string;
  /** Cosine similarity in [-1, 1]. */
  score: number;
}

/**
 * Vector search scoped to ONE chatbot and ONE embedding model. Implementations must
 * always filter by chatbotId so knowledge can never leak across chatbots or tenants.
 */
export interface VectorStore {
  search(chatbotId: string, embeddingKey: string, query: number[], topK: number, kbVersion: number): Promise<VectorHit[]>;
  invalidate(chatbotId: string): void;
}

interface CachedIndex {
  version: number;
  key: string;
  ids: string[];
  dim: number;
  /** Row-major matrix of L2-normalized vectors. */
  matrix: Float32Array;
}

const MAX_CACHED_VECTORS = 250_000;

function normalize(vec: ArrayLike<number>, out: Float32Array, offset: number): void {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i]! * vec[i]!;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vec.length; i++) out[offset + i] = vec[i]! / norm;
}

/**
 * Default store: loads a chatbot's vectors once (cached per kbVersion, LRU-bounded) and
 * computes exact cosine similarity in-process. Works with any MongoDB deployment and is
 * fast for knowledge bases up to tens of thousands of chunks per chatbot. Use the Atlas
 * store for larger corpora.
 */
class InMemoryVectorStore implements VectorStore {
  private cache = new Map<string, CachedIndex>();
  private cachedVectors = 0;

  private evictFor(incoming: number) {
    for (const [id, idx] of this.cache) {
      if (this.cachedVectors + incoming <= MAX_CACHED_VECTORS) break;
      this.cache.delete(id);
      this.cachedVectors -= idx.ids.length;
    }
  }

  private async load(chatbotId: string, key: string, version: number): Promise<CachedIndex> {
    const cached = this.cache.get(chatbotId);
    if (cached && cached.version === version && cached.key === key) {
      this.cache.delete(chatbotId); // refresh LRU position
      this.cache.set(chatbotId, cached);
      return cached;
    }
    if (cached) {
      this.cache.delete(chatbotId);
      this.cachedVectors -= cached.ids.length;
    }

    // Explicit inclusive projection (note: select('+embedding _id') would return only _id).
    const docs = await KnowledgeChunk.find({ chatbotId: new Types.ObjectId(chatbotId), embeddingModel: key })
      .select({ _id: 1, embedding: 1 })
      .lean();
    const usable = docs.filter((d) => Array.isArray(d.embedding) && d.embedding.length > 0);
    const dim = usable[0]?.embedding?.length ?? 0;
    const rows = usable.filter((d) => d.embedding!.length === dim);
    const matrix = new Float32Array(rows.length * dim);
    rows.forEach((d, i) => normalize(d.embedding!, matrix, i * dim));
    const index: CachedIndex = { version, key, ids: rows.map((d) => d._id.toString()), dim, matrix };

    if (rows.length <= MAX_CACHED_VECTORS) {
      this.evictFor(rows.length);
      this.cache.set(chatbotId, index);
      this.cachedVectors += rows.length;
    }
    return index;
  }

  async search(chatbotId: string, key: string, query: number[], topK: number, kbVersion: number): Promise<VectorHit[]> {
    const index = await this.load(chatbotId, key, kbVersion);
    if (!index.ids.length || query.length !== index.dim) return [];
    const q = new Float32Array(index.dim);
    normalize(query, q, 0);
    const scores: VectorHit[] = new Array(index.ids.length);
    for (let r = 0; r < index.ids.length; r++) {
      let dot = 0;
      const base = r * index.dim;
      for (let c = 0; c < index.dim; c++) dot += index.matrix[base + c]! * q[c]!;
      scores[r] = { chunkId: index.ids[r]!, score: dot };
    }
    return scores.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  invalidate(chatbotId: string): void {
    const cached = this.cache.get(chatbotId);
    if (cached) {
      this.cache.delete(chatbotId);
      this.cachedVectors -= cached.ids.length;
    }
  }
}

/**
 * MongoDB Atlas Vector Search. Requires a vector index on `knowledgechunks.embedding` with
 * filter fields `chatbotId` and `embeddingModel` (see docs/DEPLOYMENT.md).
 */
class AtlasVectorStore implements VectorStore {
  async search(chatbotId: string, key: string, query: number[], topK: number): Promise<VectorHit[]> {
    const results = await KnowledgeChunk.aggregate<{ _id: Types.ObjectId; score: number }>([
      {
        $vectorSearch: {
          index: env.ATLAS_VECTOR_INDEX,
          path: 'embedding',
          queryVector: query,
          numCandidates: Math.max(100, topK * 20),
          limit: topK,
          filter: { chatbotId: new Types.ObjectId(chatbotId), embeddingModel: key },
        },
      },
      { $project: { _id: 1, score: { $meta: 'vectorSearchScore' } } },
    ]);
    // Atlas cosine scores are normalized to [0,1]; convert back to raw cosine for consistent thresholds.
    return results.map((r) => ({ chunkId: r._id.toString(), score: 2 * r.score - 1 }));
  }

  invalidate(): void {
    /* index is maintained by Atlas */
  }
}

export const vectorStore: VectorStore = env.VECTOR_STORE === 'atlas' ? new AtlasVectorStore() : new InMemoryVectorStore();
logger.debug({ store: env.VECTOR_STORE }, 'Vector store initialised');
