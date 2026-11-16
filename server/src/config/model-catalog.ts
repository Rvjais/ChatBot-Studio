import fs from 'node:fs';
import { z } from 'zod';
import { env } from './env.js';
import { logger } from './logger.js';
import type { ProviderId } from './providers.js';

/**
 * Model catalog: suggestions shown in the dashboard plus metadata the engine uses for
 * context-window management and cost estimation. Any model ID can still be typed in
 * manually or loaded live from the provider, so the catalog never limits what can be used.
 *
 * Pricing policy: prices are only included where they come from a verified source.
 * Unknown prices are left undefined — the platform never fabricates cost figures.
 * Operators can add/override entries with MODEL_CATALOG_PATH (see docs/MODELS.md), and
 * chatbot owners can set per-chatbot pricing in AI Settings.
 */
export interface ModelPricing {
  /** USD per 1M input tokens. */
  inputPerMillion: number;
  /** USD per 1M output tokens. */
  outputPerMillion: number;
  source: string;
}

export interface CatalogModel {
  id: string;
  label: string;
  provider: ProviderId;
  type: 'chat' | 'embedding';
  contextWindow?: number;
  maxOutputTokens?: number;
  /** Embedding vector length (embedding models). */
  dimensions?: number;
  pricing?: ModelPricing;
  /** Some reasoning models reject sampling parameters such as temperature/top_p. */
  supportsSampling?: boolean;
  recommended?: boolean;
  notes?: string;
}

const ANTHROPIC_PRICING_SOURCE = 'Anthropic API pricing (first-party rates, cached 2026-11-03)';

const BUILTIN: CatalogModel[] = [
  // ── Anthropic ─────────────────────────────────────────────────────────
  { provider: 'anthropic', type: 'chat', id: 'claude-opus-5-5', label: 'Claude Opus 5.5', contextWindow: 1_000_000, maxOutputTokens: 128_000, recommended: true, pricing: { inputPerMillion: 4, outputPerMillion: 20, source: ANTHROPIC_PRICING_SOURCE } },
  { provider: 'anthropic', type: 'chat', id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', contextWindow: 1_000_000, maxOutputTokens: 128_000, pricing: { inputPerMillion: 2, outputPerMillion: 10, source: ANTHROPIC_PRICING_SOURCE } },
  { provider: 'anthropic', type: 'chat', id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', contextWindow: 1_000_000, maxOutputTokens: 128_000, notes: 'Listed price applies to prompts up to 100K tokens.', pricing: { inputPerMillion: 0.1, outputPerMillion: 0.5, source: ANTHROPIC_PRICING_SOURCE } },
  { provider: 'anthropic', type: 'chat', id: 'claude-fable-5-2', label: 'Claude Fable 5.2', contextWindow: 1_000_000, maxOutputTokens: 128_000, pricing: { inputPerMillion: 8, outputPerMillion: 40, source: ANTHROPIC_PRICING_SOURCE } },
  { provider: 'anthropic', type: 'chat', id: 'claude-opus-5', label: 'Claude Opus 5', contextWindow: 1_000_000, maxOutputTokens: 128_000, pricing: { inputPerMillion: 5, outputPerMillion: 25, source: ANTHROPIC_PRICING_SOURCE } },
  { provider: 'anthropic', type: 'chat', id: 'claude-sonnet-5', label: 'Claude Sonnet 5', contextWindow: 1_000_000, maxOutputTokens: 128_000, pricing: { inputPerMillion: 2, outputPerMillion: 10, source: ANTHROPIC_PRICING_SOURCE } },
  { provider: 'anthropic', type: 'chat', id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', contextWindow: 200_000, maxOutputTokens: 64_000, pricing: { inputPerMillion: 1, outputPerMillion: 5, source: ANTHROPIC_PRICING_SOURCE } },

  // ── OpenAI (pricing intentionally omitted — set it per chatbot or in MODEL_CATALOG_PATH) ──
  { provider: 'openai', type: 'chat', id: 'gpt-4o-mini', label: 'GPT-4o mini', contextWindow: 128_000, maxOutputTokens: 16_384, recommended: true },
  { provider: 'openai', type: 'chat', id: 'gpt-4o', label: 'GPT-4o', contextWindow: 128_000, maxOutputTokens: 16_384 },
  { provider: 'openai', type: 'chat', id: 'gpt-4.1', label: 'GPT-4.1', contextWindow: 1_000_000, maxOutputTokens: 32_768 },
  { provider: 'openai', type: 'chat', id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', contextWindow: 1_000_000, maxOutputTokens: 32_768 },
  { provider: 'openai', type: 'chat', id: 'gpt-5', label: 'GPT-5', contextWindow: 400_000, maxOutputTokens: 128_000, supportsSampling: false },
  { provider: 'openai', type: 'chat', id: 'gpt-5-mini', label: 'GPT-5 mini', contextWindow: 400_000, maxOutputTokens: 128_000, supportsSampling: false },
  { provider: 'openai', type: 'embedding', id: 'text-embedding-3-small', label: 'text-embedding-3-small', dimensions: 1536, recommended: true },
  { provider: 'openai', type: 'embedding', id: 'text-embedding-3-large', label: 'text-embedding-3-large', dimensions: 3072 },

  // ── DeepSeek ──────────────────────────────────────────────────────────
  { provider: 'deepseek', type: 'chat', id: 'deepseek-chat', label: 'DeepSeek Chat', contextWindow: 64_000, maxOutputTokens: 8_192, recommended: true },
  { provider: 'deepseek', type: 'chat', id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', contextWindow: 64_000, maxOutputTokens: 32_000, supportsSampling: false },

  // ── Google Gemini ─────────────────────────────────────────────────────
  { provider: 'gemini', type: 'chat', id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', contextWindow: 1_048_576, maxOutputTokens: 65_536, recommended: true },
  { provider: 'gemini', type: 'chat', id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', contextWindow: 1_048_576, maxOutputTokens: 65_536 },
  { provider: 'gemini', type: 'chat', id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', contextWindow: 1_048_576, maxOutputTokens: 65_536 },
  { provider: 'gemini', type: 'embedding', id: 'gemini-embedding-001', label: 'gemini-embedding-001', dimensions: 3072, recommended: true },

  // ── OpenRouter (live pricing is reported by OpenRouter per request) ──
  { provider: 'openrouter', type: 'chat', id: 'openai/gpt-4o-mini', label: 'OpenAI GPT-4o mini (via OpenRouter)', contextWindow: 128_000, recommended: true },
  { provider: 'openrouter', type: 'chat', id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (via OpenRouter)', contextWindow: 200_000 },
  { provider: 'openrouter', type: 'chat', id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (via OpenRouter)', contextWindow: 1_048_576 },
  { provider: 'openrouter', type: 'chat', id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat (via OpenRouter)', contextWindow: 64_000 },
  { provider: 'openrouter', type: 'embedding', id: 'openai/text-embedding-3-small', label: 'text-embedding-3-small (via OpenRouter)', dimensions: 1536 },
];

const overrideSchema = z.array(
  z.object({
    id: z.string().min(1),
    label: z.string().min(1).optional(),
    provider: z.enum(['openai', 'deepseek', 'anthropic', 'gemini', 'openrouter', 'custom']),
    type: z.enum(['chat', 'embedding']).default('chat'),
    contextWindow: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    dimensions: z.number().int().positive().optional(),
    supportsSampling: z.boolean().optional(),
    recommended: z.boolean().optional(),
    notes: z.string().optional(),
    pricing: z
      .object({ inputPerMillion: z.number().min(0), outputPerMillion: z.number().min(0), source: z.string().default('operator catalog') })
      .optional(),
  }),
);

function loadCatalog(): CatalogModel[] {
  const models = new Map<string, CatalogModel>();
  for (const m of BUILTIN) models.set(`${m.provider}:${m.id}`, m);
  if (env.MODEL_CATALOG_PATH) {
    try {
      const extra = overrideSchema.parse(JSON.parse(fs.readFileSync(env.MODEL_CATALOG_PATH, 'utf8')));
      for (const m of extra) {
        const key = `${m.provider}:${m.id}`;
        models.set(key, { ...models.get(key), ...m, label: m.label ?? m.id } as CatalogModel);
      }
      logger.info({ count: extra.length, path: env.MODEL_CATALOG_PATH }, 'Loaded model catalog overrides');
    } catch (err) {
      logger.error({ err, path: env.MODEL_CATALOG_PATH }, 'Failed to load MODEL_CATALOG_PATH; using built-in catalog');
    }
  }
  return [...models.values()];
}

export const MODEL_CATALOG: CatalogModel[] = loadCatalog();

export function findCatalogModel(provider: ProviderId, modelId: string): CatalogModel | undefined {
  return MODEL_CATALOG.find((m) => m.provider === provider && m.id === modelId);
}

export function listCatalogModels(provider?: ProviderId, type?: 'chat' | 'embedding'): CatalogModel[] {
  return MODEL_CATALOG.filter((m) => (!provider || m.provider === provider) && (!type || m.type === type));
}

/** Conservative default when a model's context window is unknown. */
export const DEFAULT_CONTEXT_WINDOW = 32_000;
