import { pino } from 'pino';
import { env } from './env.js';

/**
 * Application logger. Secrets are redacted defensively in case they ever end up in a log object.
 */
export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      '*.apiKey',
      '*.password',
      '*.passwordHash',
      '*.encryptedApiKey',
      '*.token',
      'apiKey',
      'password',
    ],
    censor: '[redacted]',
  },
  transport:
    env.isDev && process.stdout.isTTY
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
});
