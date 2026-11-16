import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import type { KnowledgeFileType } from '../../models/KnowledgeFile.js';
import { readCsv, readXlsx, renderRow, type Row } from '../../utils/spreadsheet.js';
import { normalizeText } from '../../utils/text.js';

export interface ExtractedSegment {
  text: string;
  meta: { page?: number; sheet?: string; rows?: string };
}

/** Upper bound on extracted characters per file (protects memory and embedding spend). */
const MAX_EXTRACTED_CHARS = 5_000_000;
const ROWS_PER_SEGMENT = 25;

function rowsToSegments(rows: Row[], sheet?: string): ExtractedSegment[] {
  const segments: ExtractedSegment[] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_SEGMENT) {
    const slice = rows.slice(i, i + ROWS_PER_SEGMENT);
    const text = slice.map(renderRow).filter(Boolean).join('\n');
    if (text) segments.push({ text, meta: { sheet, rows: `${i + 1}-${i + slice.length}` } });
  }
  return segments;
}

/** Flattens arbitrary JSON into "path: value" lines. */
function flattenJson(value: unknown, prefix = '', out: string[] = []): string[] {
  if (out.length > 200_000) return out;
  if (value === null || typeof value !== 'object') {
    out.push(prefix ? `${prefix}: ${String(value)}` : String(value));
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => flattenJson(v, `${prefix}[${i}]`, out));
  } else {
    for (const [k, v] of Object.entries(value)) flattenJson(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

async function extractPdf(buffer: Buffer): Promise<ExtractedSegment[]> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const pages = result.pages?.length ? result.pages : [{ num: 1, text: result.text }];
    return pages.map((p) => ({ text: p.text, meta: { page: p.num } }));
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

function extractJson(buffer: Buffer): ExtractedSegment[] {
  const data: unknown = JSON.parse(buffer.toString('utf8').replace(/^﻿/, ''));
  if (Array.isArray(data) && data.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
    // Array of records → one line per record, grouped like spreadsheet rows.
    const segments: ExtractedSegment[] = [];
    for (let i = 0; i < data.length; i += ROWS_PER_SEGMENT) {
      const slice = data.slice(i, i + ROWS_PER_SEGMENT) as Record<string, unknown>[];
      const text = slice.map((rec) => flattenJson(rec).join(' | ')).join('\n');
      segments.push({ text, meta: { rows: `${i + 1}-${i + slice.length}` } });
    }
    return segments;
  }
  return [{ text: flattenJson(data).join('\n'), meta: {} }];
}

/** Extracts text segments (with page/sheet/row provenance) from an uploaded file. */
export async function extractSegments(buffer: Buffer, type: KnowledgeFileType): Promise<ExtractedSegment[]> {
  let segments: ExtractedSegment[];
  switch (type) {
    case 'pdf':
      segments = await extractPdf(buffer);
      break;
    case 'docx':
      segments = [{ text: (await mammoth.extractRawText({ buffer })).value, meta: {} }];
      break;
    case 'txt':
      segments = [{ text: buffer.toString('utf8'), meta: {} }];
      break;
    case 'csv':
      segments = rowsToSegments(readCsv(buffer.toString('utf8')).rows);
      break;
    case 'json':
      segments = extractJson(buffer);
      break;
    case 'xlsx':
      segments = (await readXlsx(buffer)).flatMap((s) => rowsToSegments(s.rows, s.sheet));
      break;
    default:
      throw new Error(`Unsupported type: ${type as string}`);
  }

  let budget = MAX_EXTRACTED_CHARS;
  const out: ExtractedSegment[] = [];
  for (const seg of segments) {
    const text = normalizeText(seg.text);
    if (!text) continue;
    out.push({ text: text.slice(0, budget), meta: seg.meta });
    budget -= text.length;
    if (budget <= 0) break;
  }
  return out;
}
