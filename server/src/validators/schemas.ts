import { z } from 'zod';
import { env } from '../config/env.js';
import { EMBEDDING_PROVIDER_IDS, PROVIDER_IDS } from '../config/providers.js';
import { PERSONALITY_TONES } from '../models/Chatbot.js';
import { normalizeDomainEntry } from '../utils/domains.js';

// ── Shared primitives ───────────────────────────────────────────────────────
const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Must be a hex color such as #4f46e5');
const httpUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Must be an http(s) URL');
const optionalUrl = z.union([httpUrl, z.literal('')]);
const nullableNumber = (min: number, max: number) => z.number().min(min).max(max).nullable();
export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

// ── Auth ────────────────────────────────────────────────────────────────────
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Password must contain letters and numbers');

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password,
});
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(128),
});
export const updateProfileSchema = z.object({ name: z.string().trim().min(1).max(100) });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password });

// ── Chatbot ─────────────────────────────────────────────────────────────────
export const widgetSettingsSchema = z
  .object({
    title: z.string().trim().max(80),
    subtitle: z.string().trim().max(120),
    primaryColor: hexColor,
    secondaryColor: hexColor,
    headerBackground: hexColor,
    headerTextColor: hexColor,
    position: z.enum(['bottom-right', 'bottom-left']),
    avatarUrl: optionalUrl,
    borderRadius: z.number().int().min(0).max(32),
    theme: z.enum(['light', 'dark', 'auto']),
    size: z.enum(['small', 'medium', 'large']),
    launcherText: z.string().trim().max(40),
    showBranding: z.boolean(),
    autoOpen: z.boolean(),
    suggestedQuestions: z.array(z.string().trim().min(1).max(120)).max(6),
  })
  .partial();

const domainList = z
  .array(z.string().trim().max(253))
  .max(50)
  .transform((list, ctx) => {
    const out: string[] = [];
    for (const raw of list) {
      if (!raw) continue;
      const d = normalizeDomainEntry(raw);
      if (!d) {
        ctx.addIssue({ code: 'custom', message: `"${raw}" is not a valid domain` });
        return z.NEVER;
      }
      if (!out.includes(d)) out.push(d);
    }
    return out;
  });

export const chatbotFieldsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000),
  identifier: z
    .string()
    .trim()
    .toLowerCase()
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens'),
  status: z.enum(['active', 'inactive']),
  language: z.string().trim().min(1).max(40),
  welcomeMessage: z.string().max(1000),
  placeholder: z.string().max(120),
  fallbackMessage: z.string().trim().min(1).max(1000),
  systemPrompt: z.string().max(30_000),
  personality: z
    .object({
      tones: z.array(z.enum(PERSONALITY_TONES)).max(PERSONALITY_TONES.length),
      customInstructions: z.string().max(5000),
    })
    .partial(),
  knowledgeSettings: z
    .object({
      topK: z.number().int().min(1).max(20),
      minScore: z.number().min(0).max(1),
      maxContextChars: z.number().int().min(1000).max(100_000),
      strictMode: z.boolean(),
    })
    .partial(),
  productSettings: z
    .object({
      allowBrowserProducts: z.boolean(),
      maxProductsInContext: z.number().int().min(1).max(50),
      priceGuard: z.enum(['append-notice', 'flag-only']),
    })
    .partial(),
  widget: widgetSettingsSchema,
  domainRestrictionEnabled: z.boolean(),
  allowedDomains: domainList,
});

export const updateChatbotSchema = chatbotFieldsSchema.partial();

const headerName = z.string().regex(/^[A-Za-z0-9-]{1,100}$/, 'Invalid header name');

export const aiConfigSchema = z
  .object({
    provider: z.enum(PROVIDER_IDS),
    model: z.string().trim().min(1).max(200),
    apiKey: z.string().trim().max(1000).nullable(),
    baseUrl: z.union([httpUrl, z.literal('')]).nullable(),
    authHeader: headerName,
    authPrefix: z.string().max(50),
    extraHeaders: z
      .record(headerName, z.string().max(2000))
      .refine((h) => Object.keys(h).length <= 20, 'At most 20 extra headers')
      .nullable(),
    generation: z
      .object({
        temperature: nullableNumber(0, 2),
        maxOutputTokens: z.number().int().min(16).max(128_000),
        topP: nullableNumber(0, 1),
        frequencyPenalty: nullableNumber(-2, 2),
        presencePenalty: nullableNumber(-2, 2),
        effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).nullable(),
      })
      .partial(),
    pricing: z.object({ inputPerMillion: nullableNumber(0, 10_000), outputPerMillion: nullableNumber(0, 10_000) }).partial(),
    contextWindow: z.number().int().min(1024).max(10_000_000).nullable(),
    refusalFallback: z.boolean(),
    embedding: z
      .object({
        provider: z.enum([...EMBEDDING_PROVIDER_IDS, 'none']),
        model: z.string().trim().max(200).nullable(),
        useChatCredentials: z.boolean(),
        apiKey: z.string().trim().max(1000).nullable(),
        baseUrl: z.union([httpUrl, z.literal('')]).nullable(),
        dimensions: z.number().int().min(8).max(8192).nullable(),
      })
      .partial(),
  })
  .partial();

export const createChatbotSchema = chatbotFieldsSchema.partial().extend({
  name: z.string().trim().min(1).max(100),
  ai: aiConfigSchema.optional(),
});

export const duplicateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  includeProducts: z.boolean().default(true),
  includeKnowledge: z.boolean().default(true),
});

export const statusSchema = z.object({ status: z.enum(['active', 'inactive']) });

export const listChatbotsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  provider: z.enum(PROVIDER_IDS).optional(),
  sort: z.enum(['updated', 'created', 'name']).default('updated'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const testProviderSchema = z.object({
  target: z.enum(['chat', 'embedding']).default('chat'),
  /** Optional unsaved configuration to test before saving. */
  override: aiConfigSchema.optional(),
});

export const listModelsSchema = z.object({
  provider: z.enum(PROVIDER_IDS).optional(),
  apiKey: z.string().trim().max(1000).optional(),
  baseUrl: z.union([httpUrl, z.literal('')]).optional(),
});

export const previewChatSchema = z.object({
  message: z.string().trim().min(1).max(env.WIDGET_MAX_MESSAGE_CHARS),
  conversationId: z.string().regex(/^conv_[A-Za-z0-9]{24}$/).nullable().optional(),
  products: z.array(z.unknown()).optional(),
  stream: z.boolean().optional(),
});

// ── Knowledge ───────────────────────────────────────────────────────────────
export const textKnowledgeSchema = z.object({
  title: z.string().trim().min(1).max(150),
  content: z.string().trim().min(1).max(200_000),
});
export const knowledgeSearchSchema = z.object({ query: z.string().trim().min(1).max(1000) });
export const listKnowledgeQuery = z.object({
  chatbotId: objectId.optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ── Products ────────────────────────────────────────────────────────────────
export const productBodySchema = z
  .record(z.string().max(64), z.unknown())
  .refine((o) => Object.keys(o).length <= 60, 'Too many fields')
  .refine((o) => JSON.stringify(o).length <= 50_000, 'Product is too large');

export const listProductsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const importModeSchema = z.object({ mode: z.enum(['upsert', 'replace']).default('upsert') });
export const productSearchTestSchema = z.object({
  query: z.string().trim().min(1).max(1000),
  pageProducts: z.array(z.unknown()).optional(),
});
export const deleteAllProductsSchema = z.object({ confirm: z.literal(true) });

export const syncProductsSchema = z.object({
  mode: z.enum(['upsert', 'replace']).default('upsert'),
  products: z.array(z.unknown()).min(1).max(5000),
});

// ── Widget (public) ─────────────────────────────────────────────────────────
export const widgetChatSchema = z
  .object({
    chatbotId: z.string().max(64).optional(),
    publicId: z.string().max(64).optional(),
    message: z.string().trim().min(1, 'Message is empty').max(env.WIDGET_MAX_MESSAGE_CHARS, 'Message is too long'),
    conversationId: z.string().regex(/^conv_[A-Za-z0-9]{24}$/).nullable().optional(),
    visitorId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, 'Invalid visitor id'),
    products: z.array(z.unknown()).optional(),
    pageUrl: z.string().max(1000).optional(),
    stream: z.boolean().optional(),
  })
  .refine((b) => b.chatbotId || b.publicId, { message: 'chatbotId is required', path: ['chatbotId'] });

export const widgetConversationQuery = z.object({
  chatbotId: z.string().max(64),
  visitorId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
});

// ── Conversations / analytics ───────────────────────────────────────────────
export const listConversationsQuery = z.object({
  chatbotId: objectId.optional(),
  q: z.string().trim().max(200).optional(),
  channel: z.enum(['widget', 'preview']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const analyticsQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });
