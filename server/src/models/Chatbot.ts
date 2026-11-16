import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { PROVIDER_IDS, EMBEDDING_PROVIDER_IDS } from '../config/providers.js';

export const PERSONALITY_TONES = ['professional', 'friendly', 'casual', 'technical', 'concise', 'detailed'] as const;
export type PersonalityTone = (typeof PERSONALITY_TONES)[number];

const generationSchema = new Schema(
  {
    temperature: { type: Number, min: 0, max: 2 },
    maxOutputTokens: { type: Number, min: 16, max: 128_000, default: 1024 },
    topP: { type: Number, min: 0, max: 1 },
    frequencyPenalty: { type: Number, min: -2, max: 2 },
    presencePenalty: { type: Number, min: -2, max: 2 },
    effort: { type: String, enum: ['low', 'medium', 'high', 'xhigh', 'max'] },
  },
  { _id: false },
);

const aiSchema = new Schema(
  {
    provider: { type: String, enum: PROVIDER_IDS, default: 'openai' },
    model: { type: String, trim: true, maxlength: 200, default: 'gpt-4o-mini' },
    /** AES-256-GCM ciphertext. Never selected by default, never serialized to clients. */
    encryptedApiKey: { type: String, select: false },
    apiKeyLast4: { type: String, maxlength: 4 },
    baseUrl: { type: String, trim: true, maxlength: 500 },
    /** Custom provider auth: header name and value prefix used with the API key. */
    authHeader: { type: String, trim: true, maxlength: 100, default: 'Authorization' },
    authPrefix: { type: String, maxlength: 50, default: 'Bearer ' },
    /** Extra HTTP headers for custom providers, encrypted as one JSON blob (values may be secret). */
    encryptedExtraHeaders: { type: String, select: false },
    extraHeaderNames: { type: [String], default: [] },
    generation: { type: generationSchema, default: () => ({}) },
    /** Optional per-chatbot pricing override in USD per 1M tokens (used for cost estimates). */
    pricing: {
      inputPerMillion: { type: Number, min: 0 },
      outputPerMillion: { type: Number, min: 0 },
    },
    contextWindow: { type: Number, min: 1024, max: 10_000_000 },
    /** Anthropic: let the API re-run a refused request on a fallback model (server-side fallback beta). */
    refusalFallback: { type: Boolean, default: true },
    lastTest: {
      status: { type: String, enum: ['success', 'failed'] },
      message: { type: String, maxlength: 500 },
      testedAt: { type: Date },
      latencyMs: { type: Number },
    },
  },
  { _id: false },
);

const embeddingSchema = new Schema(
  {
    /** "none" disables embeddings; retrieval then uses keyword (full-text) search only. */
    provider: { type: String, enum: [...EMBEDDING_PROVIDER_IDS, 'none'], default: 'none' },
    model: { type: String, trim: true, maxlength: 200 },
    /** Reuse the chat provider credentials when the embedding provider matches it. */
    useChatCredentials: { type: Boolean, default: true },
    encryptedApiKey: { type: String, select: false },
    apiKeyLast4: { type: String, maxlength: 4 },
    baseUrl: { type: String, trim: true, maxlength: 500 },
    dimensions: { type: Number, min: 8, max: 8192 },
  },
  { _id: false },
);

const widgetSchema = new Schema(
  {
    title: { type: String, trim: true, maxlength: 80 },
    subtitle: { type: String, trim: true, maxlength: 120, default: 'We typically reply instantly' },
    primaryColor: { type: String, default: '#4f46e5' },
    secondaryColor: { type: String, default: '#eef2ff' },
    headerBackground: { type: String, default: '#4f46e5' },
    headerTextColor: { type: String, default: '#ffffff' },
    position: { type: String, enum: ['bottom-right', 'bottom-left'], default: 'bottom-right' },
    avatarUrl: { type: String, trim: true, maxlength: 1000 },
    borderRadius: { type: Number, min: 0, max: 32, default: 16 },
    theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'light' },
    size: { type: String, enum: ['small', 'medium', 'large'], default: 'medium' },
    launcherText: { type: String, trim: true, maxlength: 40 },
    showBranding: { type: Boolean, default: true },
    autoOpen: { type: Boolean, default: false },
    suggestedQuestions: { type: [String], default: [] },
  },
  { _id: false },
);

const chatbotSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    /** Owner-chosen identifier (slug), unique per owner. */
    identifier: { type: String, required: true, trim: true, lowercase: true, maxlength: 64 },
    /** Public, unguessable ID used by the embed widget. Not an authorization token. */
    publicId: { type: String, required: true, unique: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    language: { type: String, trim: true, maxlength: 40, default: 'auto' },
    welcomeMessage: { type: String, maxlength: 1000, default: 'Hi! 👋 How can I help you today?' },
    placeholder: { type: String, maxlength: 120, default: 'Type your message…' },
    fallbackMessage: {
      type: String,
      maxlength: 1000,
      default: "I'm sorry, I don't have enough information to answer that. Please contact our team for help.",
    },
    systemPrompt: { type: String, maxlength: 30_000, default: '' },
    personality: {
      tones: { type: [String], enum: PERSONALITY_TONES, default: ['friendly', 'professional'] },
      customInstructions: { type: String, maxlength: 5000, default: '' },
    },
    ai: { type: aiSchema, default: () => ({}) },
    embedding: { type: embeddingSchema, default: () => ({}) },
    knowledgeSettings: {
      topK: { type: Number, min: 1, max: 20, default: 5 },
      minScore: { type: Number, min: 0, max: 1, default: 0.3 },
      maxContextChars: { type: Number, min: 1000, max: 100_000, default: 12_000 },
      /** When true, the bot must not answer business questions from general knowledge. */
      strictMode: { type: Boolean, default: false },
    },
    productSettings: {
      allowBrowserProducts: { type: Boolean, default: true },
      maxProductsInContext: { type: Number, min: 1, max: 50, default: 12 },
      /** What to do when an answer mentions a price that is not in any supplied record. */
      priceGuard: { type: String, enum: ['append-notice', 'flag-only'], default: 'append-notice' },
    },
    widget: { type: widgetSchema, default: () => ({}) },
    domainRestrictionEnabled: { type: Boolean, default: false },
    allowedDomains: { type: [String], default: [] },
    /** Secret for the server-to-server product sync API (sha256 hash only). */
    syncKey: {
      hash: { type: String, select: false },
      prefix: { type: String },
      createdAt: { type: Date },
      lastUsedAt: { type: Date },
    },
    /** Bumped whenever knowledge chunks change; used to invalidate retrieval caches. */
    kbVersion: { type: Number, default: 0 },
    /** Bumped whenever products change. */
    productsVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

chatbotSchema.index({ ownerId: 1, identifier: 1 }, { unique: true });
chatbotSchema.index({ ownerId: 1, updatedAt: -1 });

export type ChatbotAttrs = InferSchemaType<typeof chatbotSchema>;
export type ChatbotDoc = HydratedDocument<ChatbotAttrs>;
export const Chatbot = model('Chatbot', chatbotSchema);
