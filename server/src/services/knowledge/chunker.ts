import type { ExtractedSegment } from './extractors.js';

export interface Chunk {
  content: string;
  meta: ExtractedSegment['meta'];
}

export interface ChunkOptions {
  /** Target chunk size in characters (~300 tokens at the default). */
  size?: number;
  /** Characters of overlap carried into the next chunk to preserve context across boundaries. */
  overlap?: number;
}

/** Splits text into sentence-ish units without breaking inside sentences when possible. */
function splitUnits(text: string, size: number): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const units: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= size) {
      units.push(para);
      continue;
    }
    const sentences = para.split(/(?<=[.!?。！？])\s+|\n/);
    for (const sentence of sentences) {
      if (sentence.length <= size) {
        units.push(sentence);
      } else {
        // Hard-wrap very long sentences (tables, minified text) on whitespace.
        for (let i = 0; i < sentence.length; i += size) units.push(sentence.slice(i, i + size));
      }
    }
  }
  return units.filter((u) => u.trim());
}

/**
 * Greedy, boundary-aware chunker. Each segment (page/sheet range) is chunked separately so
 * every chunk keeps accurate provenance metadata for source attribution.
 */
export function chunkSegments(segments: ExtractedSegment[], opts: ChunkOptions = {}): Chunk[] {
  const size = opts.size ?? 1200;
  const overlap = Math.min(opts.overlap ?? 200, Math.floor(size / 3));
  const chunks: Chunk[] = [];

  for (const seg of segments) {
    const units = splitUnits(seg.text, size);
    let current = '';
    for (const unit of units) {
      const sep = current ? (current.endsWith('\n') ? '' : '\n') : '';
      if (current && current.length + sep.length + unit.length > size) {
        chunks.push({ content: current.trim(), meta: seg.meta });
        const tail = current.slice(-overlap);
        const cut = tail.search(/\s/);
        current = (cut >= 0 ? tail.slice(cut + 1) : '') + '\n' + unit;
      } else {
        current += sep + unit;
      }
    }
    if (current.trim()) chunks.push({ content: current.trim(), meta: seg.meta });
  }
  return chunks;
}
