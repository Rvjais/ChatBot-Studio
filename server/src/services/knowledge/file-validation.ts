import path from 'node:path';
import { KNOWLEDGE_FILE_TYPES, type KnowledgeFileType } from '../../models/KnowledgeFile.js';
import { badRequest } from '../../utils/errors.js';

const EXTENSION_MAP: Record<string, KnowledgeFileType> = {
  '.pdf': 'pdf',
  '.txt': 'txt',
  '.md': 'txt',
  '.docx': 'docx',
  '.csv': 'csv',
  '.json': 'json',
  '.xlsx': 'xlsx',
};

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const PDF_MAGIC = Buffer.from('%PDF-');

/** True when the buffer decodes as UTF-8 text without binary NUL bytes. */
function looksLikeText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 64 * 1024);
  if (sample.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample.length < buffer.length ? sample.subarray(0, sample.length - 4) : sample);
    return true;
  } catch {
    return false;
  }
}

/**
 * Display name for a client-supplied file name or title: strips directories, control characters
 * and characters invalid in file names. (Files are stored under random server-generated names,
 * so this name never touches the filesystem; it is escaped wherever it is rendered.)
 */
export function sanitizeFileName(name: string): string {
  const base = path.basename(name.replace(/\\/g, '/'));
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 200);
  return cleaned || 'file';
}

/**
 * Validates an upload by extension AND content signature (magic bytes), so a renamed
 * executable or a binary disguised as .txt is rejected.
 */
export function detectFileType(originalName: string, buffer: Buffer, allowed: readonly KnowledgeFileType[] = KNOWLEDGE_FILE_TYPES): KnowledgeFileType {
  const ext = path.extname(originalName).toLowerCase();
  const type = EXTENSION_MAP[ext];
  if (!type || !allowed.includes(type)) {
    throw badRequest(`Unsupported file type "${ext || 'unknown'}". Allowed: ${allowed.join(', ')}`);
  }
  if (buffer.length === 0) throw badRequest(`"${originalName}" is empty`);

  const ok =
    type === 'pdf'
      ? buffer.subarray(0, 1024).includes(PDF_MAGIC)
      : type === 'docx' || type === 'xlsx'
        ? buffer.subarray(0, 4).equals(ZIP_MAGIC)
        : looksLikeText(buffer);
  if (!ok) throw badRequest(`"${originalName}" does not look like a valid ${type.toUpperCase()} file`);

  if (type === 'json') {
    try {
      JSON.parse(buffer.toString('utf8').replace(/^﻿/, ''));
    } catch {
      throw badRequest(`"${originalName}" is not valid JSON`);
    }
  }
  return type;
}
