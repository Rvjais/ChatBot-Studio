import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

/**
 * Encrypts a secret with AES-256-GCM (authenticated encryption).
 * `context` is bound as Additional Authenticated Data so a ciphertext copied from one
 * record (e.g. another chatbot) fails to decrypt anywhere else.
 * Output format: v1.<iv>.<authTag>.<ciphertext> (base64url parts).
 */
export function encryptSecret(plaintext: string, context: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, env.ENCRYPTION_KEY_BYTES, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSecret(payload: string, context: string): string {
  const [version, ivB64, tagB64, ctB64] = payload.split('.');
  if (version !== VERSION || !ivB64 || !tagB64 || ctB64 === undefined) {
    throw new Error('Unsupported encrypted payload format');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, env.ENCRYPTION_KEY_BYTES, Buffer.from(ivB64, 'base64url'));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8');
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Cryptographically random base62 string (rejection sampling avoids modulo bias). */
export function randomBase62(length: number): string {
  let out = '';
  while (out.length < length) {
    const bytes = crypto.randomBytes(length * 2);
    for (const b of bytes) {
      if (b < 248) out += BASE62[b % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

export const generatePublicId = () => `cb_${randomBase62(20)}`;
export const generateConversationId = () => `conv_${randomBase62(24)}`;

export function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Last 4 characters for display ("••••abcd"); never more. */
export function keyHint(secret: string): string {
  return secret.length >= 8 ? secret.slice(-4) : '';
}
