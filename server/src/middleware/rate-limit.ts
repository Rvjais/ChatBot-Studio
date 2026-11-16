import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

const common = {
  standardHeaders: 'draft-8' as const,
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down and try again shortly.' } },
};

const ip = (req: Request) => ipKeyGenerator(req.ip ?? 'unknown');

/** All dashboard API routes, per IP. */
export const apiLimiter = rateLimit({ ...common, windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.RATE_LIMIT_API_MAX });

/** Login/registration brute-force protection, per IP. */
export const authLimiter = rateLimit({ ...common, windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.RATE_LIMIT_AUTH_MAX });

/** Widget chat, per IP + chatbot (limits scripted abuse of one bot's AI budget). */
export const widgetChatLimiter = rateLimit({
  ...common,
  windowMs: 60_000,
  limit: env.RATE_LIMIT_WIDGET_CHAT_PER_MIN,
  keyGenerator: (req) => `${ip(req)}:${String(req.body?.chatbotId ?? req.body?.publicId ?? '')}`,
});

export const widgetConfigLimiter = rateLimit({ ...common, windowMs: 60_000, limit: env.RATE_LIMIT_WIDGET_CONFIG_PER_MIN });

/** Provider test / model listing calls hit paid third-party APIs; keep them modest per user. */
export const providerTestLimiter = rateLimit({
  ...common,
  windowMs: 60_000,
  limit: env.RATE_LIMIT_PROVIDER_TEST_PER_MIN,
  keyGenerator: (req) => req.user?.id.toString() ?? ip(req),
});

/** Product sync API, per sync key owner chatbot. */
export const syncLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 60 });
