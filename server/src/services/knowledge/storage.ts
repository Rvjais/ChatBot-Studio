import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';

/**
 * Local-disk storage for uploaded knowledge files. Files are stored under
 * UPLOAD_DIR/<ownerId>/<chatbotId>/<random>.<ext> with server-generated names — the client's
 * file name never influences the path. The upload directory is never served statically.
 *
 * The interface is intentionally small so an object-storage backend (S3, GCS, Azure Blob)
 * can replace it without touching the rest of the pipeline.
 */
export interface FileStorage {
  save(ownerId: string, chatbotId: string, ext: string, data: Buffer): Promise<string>;
  read(storagePath: string): Promise<Buffer>;
  remove(storagePath: string): Promise<void>;
  copy(storagePath: string, ownerId: string, chatbotId: string): Promise<string>;
}

function resolveSafe(relative: string): string {
  const root = env.UPLOAD_DIR_ABS;
  const full = path.resolve(root, relative);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('Invalid storage path');
  return full;
}

class LocalFileStorage implements FileStorage {
  async save(ownerId: string, chatbotId: string, ext: string, data: Buffer): Promise<string> {
    const safeExt = ext.replace(/[^a-z0-9]/gi, '').slice(0, 8);
    const relative = path.join(ownerId, chatbotId, `${crypto.randomBytes(16).toString('hex')}.${safeExt}`);
    const full = resolveSafe(relative);
    await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    await fs.writeFile(full, data, { mode: 0o600 });
    return relative;
  }

  async read(storagePath: string): Promise<Buffer> {
    return fs.readFile(resolveSafe(storagePath));
  }

  async remove(storagePath: string): Promise<void> {
    await fs.rm(resolveSafe(storagePath), { force: true });
  }

  async copy(storagePath: string, ownerId: string, chatbotId: string): Promise<string> {
    const data = await this.read(storagePath);
    return this.save(ownerId, chatbotId, path.extname(storagePath).slice(1), data);
  }
}

export const storage: FileStorage = new LocalFileStorage();
