import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { SERVER_ROOT } from './paths.js';

// server/.env first (works from any working directory), then ./.env; real env vars always win.
dotenv.config({ path: path.join(SERVER_ROOT, '.env'), quiet: true });
dotenv.config({ quiet: true });

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const int = (def: number, min = 0) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : Number.parseInt(v, 10)))
    .pipe(z.number().int().min(min));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: int(4000, 1),
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().optional().default(''),
  TRUST_PROXY: int(0),
  LOG_LEVEL: z.string().default('info'),

  MONGODB_URI: z.string().optional().default(''),

  JWT_SECRET: z.string().optional().default(''),
  JWT_EXPIRES_IN: z.string().default('7d'),
  ENCRYPTION_KEY: z.string().optional().default(''),

  MAX_CHATBOTS_PER_USER: int(50, 1),
  MAX_UPLOAD_MB: int(20, 1),
  MAX_FILES_PER_UPLOAD: int(10, 1),
  MAX_PRODUCTS_PER_CHATBOT: int(50000, 1),
  MAX_PRODUCT_IMPORT_MB: int(15, 1),
  UPLOAD_DIR: z.string().default('./uploads'),

  WIDGET_MAX_MESSAGE_CHARS: int(2000, 1),
  WIDGET_MAX_PRODUCTS: int(100, 0),
  WIDGET_MAX_PRODUCTS_BYTES: int(65536, 1024),
  WIDGET_MAX_MESSAGES_PER_CONVERSATION: int(200, 2),
  ALLOW_PLATFORM_PREVIEW_ORIGIN: bool(true),

  RATE_LIMIT_WINDOW_MS: int(900_000, 1000),
  RATE_LIMIT_API_MAX: int(600, 1),
  RATE_LIMIT_AUTH_MAX: int(30, 1),
  RATE_LIMIT_WIDGET_CHAT_PER_MIN: int(20, 1),
  RATE_LIMIT_WIDGET_CONFIG_PER_MIN: int(120, 1),
  RATE_LIMIT_PROVIDER_TEST_PER_MIN: int(10, 1),

  /** Allow provider base URLs that resolve to private/loopback addresses (local LLMs). Defaults to true outside production. */
  ALLOW_PRIVATE_PROVIDER_URLS: z.string().optional().default(''),
  AI_REQUEST_TIMEOUT_MS: int(60_000, 1000),
  AI_MAX_RETRIES: int(2, 0),
  MODEL_CATALOG_PATH: z.string().optional().default(''),

  VECTOR_STORE: z.enum(['memory', 'atlas']).default('memory'),
  ATLAS_VECTOR_INDEX: z.string().default('knowledge_chunk_vector_index'),

  RUN_WORKER_IN_PROCESS: bool(true),
  JOB_POLL_INTERVAL_MS: int(1500, 100),
  JOB_CONCURRENCY: int(2, 1),

  SERVE_CLIENT: bool(false),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:\n', z.prettifyError(parsed.error));
  process.exit(1);
}

const raw = parsed.data;
const isProd = raw.NODE_ENV === 'production';
const isTest = raw.NODE_ENV === 'test';

/** Decodes a 32-byte key supplied as base64 or hex. */
function decodeKey(value: string): Buffer | null {
  const trimmed = value.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, 'hex');
  try {
    const buf = Buffer.from(trimmed, 'base64');
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Development convenience: when JWT_SECRET / ENCRYPTION_KEY are not set outside production,
 * generate them once and persist them under server/.data so restarts keep sessions and
 * encrypted API keys valid. Production refuses to start without explicit secrets.
 */
function resolveSecrets(): { jwtSecret: string; encryptionKey: Buffer } {
  let jwtSecret = raw.JWT_SECRET;
  let encryptionKeyRaw = raw.ENCRYPTION_KEY;

  if (isProd) {
    const problems: string[] = [];
    if (jwtSecret.length < 32) problems.push('JWT_SECRET must be set (at least 32 characters).');
    if (!decodeKey(encryptionKeyRaw)) problems.push('ENCRYPTION_KEY must be a 32-byte key in base64 or hex.');
    if (!raw.MONGODB_URI) problems.push('MONGODB_URI must be set.');
    if (problems.length) {
      // eslint-disable-next-line no-console
      console.error(`Refusing to start in production:\n - ${problems.join('\n - ')}`);
      process.exit(1);
    }
    return { jwtSecret, encryptionKey: decodeKey(encryptionKeyRaw)! };
  }

  if (isTest) {
    return {
      jwtSecret: jwtSecret || 'test-jwt-secret-test-jwt-secret-0123456789',
      encryptionKey: decodeKey(encryptionKeyRaw) ?? crypto.createHash('sha256').update('test-key').digest(),
    };
  }

  if (!jwtSecret || !decodeKey(encryptionKeyRaw)) {
    const dataDir = path.join(SERVER_ROOT, '.data');
    const secretFile = path.join(dataDir, 'dev-secrets.json');
    let stored: { jwtSecret?: string; encryptionKey?: string } = {};
    try {
      stored = JSON.parse(fs.readFileSync(secretFile, 'utf8'));
    } catch {
      /* first run */
    }
    if (!stored.jwtSecret || !stored.encryptionKey) {
      stored = {
        jwtSecret: crypto.randomBytes(48).toString('base64'),
        encryptionKey: crypto.randomBytes(32).toString('base64'),
      };
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(secretFile, JSON.stringify(stored, null, 2), { mode: 0o600 });
      // eslint-disable-next-line no-console
      console.warn(`[env] Generated development secrets in ${secretFile}. Set JWT_SECRET and ENCRYPTION_KEY for production.`);
    }
    jwtSecret = jwtSecret || stored.jwtSecret!;
    if (!decodeKey(encryptionKeyRaw)) encryptionKeyRaw = stored.encryptionKey!;
  }
  return { jwtSecret, encryptionKey: decodeKey(encryptionKeyRaw)! };
}

const secrets = resolveSecrets();

export const env = {
  ...raw,
  isProd,
  isTest,
  isDev: raw.NODE_ENV === 'development',
  JWT_SECRET: secrets.jwtSecret,
  allowPrivateProviderUrls: raw.ALLOW_PRIVATE_PROVIDER_URLS
    ? ['1', 'true', 'yes', 'on'].includes(raw.ALLOW_PRIVATE_PROVIDER_URLS.toLowerCase())
    : !isProd,
  ENCRYPTION_KEY_BYTES: secrets.encryptionKey,
  UPLOAD_DIR_ABS: path.resolve(SERVER_ROOT, raw.UPLOAD_DIR),
  PUBLIC_API_URL: raw.PUBLIC_API_URL.replace(/\/+$/, ''),
  CLIENT_URL: raw.CLIENT_URL.replace(/\/+$/, ''),
  corsOrigins: [raw.CLIENT_URL, ...raw.CORS_ORIGINS.split(',')]
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean),
} as const;

export type Env = typeof env;
