// Types mirror docs/API.md and the server serializers. Keep them in sync with the backend.

export type ProviderId = 'openai' | 'deepseek' | 'anthropic' | 'gemini' | 'openrouter' | 'custom';
export type EmbeddingProviderId = 'openai' | 'gemini' | 'openrouter' | 'custom';
export type EmbeddingProviderSetting = EmbeddingProviderId | 'none';
export type ChatbotStatus = 'active' | 'inactive';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const PERSONALITY_TONES = ['professional', 'friendly', 'casual', 'technical', 'concise', 'detailed'] as const;
export type PersonalityTone = (typeof PERSONALITY_TONES)[number];

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: ApiErrorDetail[] };
}

// ── Auth ────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// ── AI catalog ──────────────────────────────────────────────────────────────
export interface ParamRange {
  min: number;
  max: number;
  step: number;
  default?: number;
}

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  description: string;
  defaultBaseUrl: string;
  allowCustomBaseUrl: boolean;
  requiresBaseUrl: boolean;
  apiKeyRequired: boolean;
  apiKeyUrl?: string;
  docsUrl?: string;
  supports: {
    streaming: boolean;
    listModels: boolean;
    embeddings: boolean;
    temperature: ParamRange | null;
    topP: ParamRange | null;
    frequencyPenalty: ParamRange | null;
    presencePenalty: ParamRange | null;
    effort: string[] | null;
    customHeaders: boolean;
  };
  maxOutputTokensLimit: number;
}

export interface ProvidersResponse {
  providers: ProviderDefinition[];
  embeddingProviders: { id: EmbeddingProviderId; name: string }[];
}

/** GET /api/platform/limits — the server's configured limits. */
export interface PlatformLimits {
  maxUploadMb: number;
  maxFilesPerUpload: number;
  maxKnowledgeFilesPerChatbot: number;
  maxProductImportMb: number;
  maxProductsPerChatbot: number;
  maxChatbotsPerUser: number;
  widget: { maxMessageChars: number; maxProducts: number; maxProductsBytes: number };
}

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  source?: string;
}

export interface CatalogModel {
  id: string;
  label: string;
  provider: ProviderId;
  type: 'chat' | 'embedding';
  contextWindow?: number;
  maxOutputTokens?: number;
  dimensions?: number;
  pricing?: ModelPricing;
  supportsSampling?: boolean;
  recommended?: boolean;
  notes?: string;
}

export interface LiveModel {
  id: string;
  label?: string;
  type?: 'chat' | 'embedding';
  contextWindow?: number;
  maxOutputTokens?: number;
  pricing?: { inputPerMillion: number; outputPerMillion: number };
}

// ── Chatbot ─────────────────────────────────────────────────────────────────
export interface GenerationSettings {
  temperature: number | null;
  maxOutputTokens: number;
  topP: number | null;
  frequencyPenalty: number | null;
  presencePenalty: number | null;
  effort: Effort | null;
}

export interface LastTest {
  status: 'success' | 'failed';
  message: string;
  testedAt: string;
  latencyMs: number;
}

export interface AiConfig {
  provider: ProviderId;
  model: string;
  hasApiKey: boolean;
  apiKeyLast4: string | null;
  baseUrl: string;
  authHeader: string;
  authPrefix: string;
  extraHeaderNames: string[];
  generation: GenerationSettings;
  pricing: { inputPerMillion: number | null; outputPerMillion: number | null };
  contextWindow: number | null;
  refusalFallback: boolean;
  lastTest: LastTest | null;
}

export interface EmbeddingConfig {
  provider: EmbeddingProviderSetting;
  model: string;
  useChatCredentials: boolean;
  hasApiKey: boolean;
  apiKeyLast4: string | null;
  baseUrl: string;
  dimensions: number | null;
}

export interface KnowledgeSettings {
  topK: number;
  minScore: number;
  maxContextChars: number;
  strictMode: boolean;
}

export type PriceGuardMode = 'append-notice' | 'flag-only';

export interface ProductSettings {
  allowBrowserProducts: boolean;
  maxProductsInContext: number;
  priceGuard: PriceGuardMode;
}

export type WidgetPosition = 'bottom-right' | 'bottom-left';
export type WidgetTheme = 'light' | 'dark' | 'auto';
export type WidgetSize = 'small' | 'medium' | 'large';

export interface WidgetSettings {
  title: string;
  subtitle: string;
  primaryColor: string;
  secondaryColor: string;
  headerBackground: string;
  headerTextColor: string;
  position: WidgetPosition;
  avatarUrl: string;
  borderRadius: number;
  theme: WidgetTheme;
  size: WidgetSize;
  launcherText: string;
  showBranding: boolean;
  autoOpen: boolean;
  suggestedQuestions: string[];
}

export interface ChatbotStats {
  conversations: number;
  knowledgeFiles: number;
  products: number;
  lastActivityAt: number;
}

export interface Chatbot {
  id: string;
  publicId: string;
  name: string;
  description: string;
  identifier: string;
  status: ChatbotStatus;
  language: string;
  welcomeMessage: string;
  placeholder: string;
  fallbackMessage: string;
  systemPrompt: string;
  personality: { tones: PersonalityTone[]; customInstructions: string };
  ai: AiConfig;
  embedding: EmbeddingConfig;
  knowledgeSettings: KnowledgeSettings;
  productSettings: ProductSettings;
  widget: Partial<WidgetSettings>;
  domainRestrictionEnabled: boolean;
  allowedDomains: string[];
  syncKey: { prefix: string; createdAt: string; lastUsedAt: string | null } | null;
  createdAt: string;
  updatedAt: string;
  stats?: ChatbotStats;
}

/** Fields accepted by PUT /api/chatbots/:id (nested objects are merged server-side). */
export interface ChatbotUpdate {
  name?: string;
  description?: string;
  identifier?: string;
  status?: ChatbotStatus;
  language?: string;
  welcomeMessage?: string;
  placeholder?: string;
  fallbackMessage?: string;
  systemPrompt?: string;
  personality?: Partial<{ tones: PersonalityTone[]; customInstructions: string }>;
  knowledgeSettings?: Partial<KnowledgeSettings>;
  productSettings?: Partial<ProductSettings>;
  widget?: Partial<WidgetSettings>;
  domainRestrictionEnabled?: boolean;
  allowedDomains?: string[];
}

export interface AiConfigUpdate {
  provider?: ProviderId;
  model?: string;
  apiKey?: string | null;
  baseUrl?: string | null;
  authHeader?: string;
  authPrefix?: string;
  extraHeaders?: Record<string, string> | null;
  generation?: Partial<{
    temperature: number | null;
    maxOutputTokens: number;
    topP: number | null;
    frequencyPenalty: number | null;
    presencePenalty: number | null;
    effort: Effort | null;
  }>;
  pricing?: { inputPerMillion?: number | null; outputPerMillion?: number | null };
  contextWindow?: number | null;
  refusalFallback?: boolean;
  embedding?: {
    provider?: EmbeddingProviderSetting;
    model?: string | null;
    useChatCredentials?: boolean;
    apiKey?: string | null;
    baseUrl?: string | null;
    dimensions?: number | null;
  };
}

export interface CreateChatbotInput extends ChatbotUpdate {
  name: string;
  ai?: AiConfigUpdate;
}

export interface ChatbotListQuery {
  q?: string;
  status?: ChatbotStatus;
  provider?: ProviderId;
  sort?: 'updated' | 'created' | 'name';
  page?: number;
  limit?: number;
}

export interface TestProviderResult {
  ok: boolean;
  latencyMs: number;
  message: string;
  model?: string;
  sample?: string;
  usage?: TokenUsage;
  dimensions?: number;
}

export interface EmbedInfo {
  publicId: string;
  widgetUrl: string;
  apiBase: string;
  testPageUrl: string;
  snippets: { basic: string; withProducts: string; customStyling: string; javascriptApi: string; react: string; nextjs: string };
}

export interface WidgetPublicConfig {
  config: {
    publicId: string;
    name: string;
    features: { streaming: boolean; pageProducts: boolean };
    limits: { maxMessageChars: number; maxProducts: number; maxProductsBytes: number };
  };
}

// ── Knowledge ───────────────────────────────────────────────────────────────
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface KnowledgeFile {
  id: string;
  chatbotId: string;
  fileName: string;
  fileType: string;
  size: number;
  source: 'upload' | 'text';
  processingStatus: ProcessingStatus;
  error: string | null;
  warning: string | null;
  chunkCount: number;
  embeddedChunkCount: number;
  characterCount: number;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeFileWithChatbot extends KnowledgeFile {
  chatbotName: string;
}

export interface KnowledgeTotals {
  files: number;
  chunks: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface KnowledgeChunk {
  id: string;
  index: number;
  content: string;
  tokenEstimate: number;
  embedded: boolean;
  metadata: { page: number | null; sheet: string | null; rows: string | null };
}

export interface RetrievedChunk {
  chunkId: string;
  fileId: string;
  fileName?: string;
  content: string;
  page?: number;
  sheet?: string;
  rows?: string;
  similarity?: number;
  via: ('vector' | 'keyword')[];
}

export interface KnowledgeSearchResult {
  chunks: RetrievedChunk[];
  mode: 'hybrid' | 'keyword' | 'none';
  warning?: string;
}

// ── Products ────────────────────────────────────────────────────────────────
export interface Product {
  id: string;
  productId: string;
  name: string;
  description: string;
  price: number | null;
  currency: string | null;
  availability: string | null;
  category: string | null;
  productUrl: string | null;
  imageUrl: string | null;
  additionalFields: Record<string, string | number | boolean>;
  source: 'upload' | 'manual' | 'sync';
  createdAt: string;
  updatedAt: string;
}

export interface ImportReport {
  total: number;
  inserted: number;
  updated: number;
  failed: number;
  removed: number;
  errors: { row: number; message: string }[];
  warnings: string[];
}

/** Product as handed to the model (search-test results). */
export interface ContextProduct {
  productId: string;
  name: string;
  description?: string;
  price?: number;
  currency?: string;
  availability?: string;
  category?: string;
  productUrl?: string;
  imageUrl?: string;
  additionalFields?: Record<string, string | number | boolean>;
  source: 'verified' | 'page';
}

export interface ProductQuery {
  idCandidates: string[];
  priceMin?: number;
  priceMax?: number;
  sort?: 'price_asc' | 'price_desc';
  terms: string[];
  categories: string[];
  productIntent: boolean;
}

export interface CatalogSummary {
  totalProducts: number;
  categories: string[];
  priceRange?: { min: number; max: number; currency?: string };
}

export interface ProductSearchTestResult {
  verified: ContextProduct[];
  page: ContextProduct[];
  summary: CatalogSummary;
  interpretedQuery: ProductQuery;
}

// ── Conversations ───────────────────────────────────────────────────────────
export type Channel = 'widget' | 'preview';

export interface ConversationSummary {
  id: string;
  conversationId: string;
  chatbotId: string;
  chatbotName: string;
  visitorId: string;
  channel: Channel;
  messageCount: number;
  preview: string;
  origin: string | null;
  pageUrl: string | null;
  createdAt: string;
  lastMessageAt: string;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export interface MessageSource {
  fileId: string;
  fileName?: string;
  chunkId: string;
  score?: number | null;
  page?: number | null;
}

export interface MessageMetadata {
  provider?: string;
  model?: string;
  latencyMs?: number;
  finishReason?: string;
  costUsd?: number | null;
  costSource?: string;
  sources?: MessageSource[];
  productIds?: string[];
  browserProductIds?: string[];
  priceCheck?: { passed: boolean; unverifiedAmounts: string[] };
  error?: { code: string; message: string };
  streamed?: boolean;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  tokenUsage: TokenUsage | null;
  metadata: MessageMetadata | null;
}

export interface ConversationDetail {
  conversation: Omit<ConversationSummary, 'preview'>;
  messages: ConversationMessage[];
}

export interface ConversationListQuery {
  chatbotId?: string;
  q?: string;
  channel?: Channel;
  page?: number;
  limit?: number;
}

// ── Analytics ───────────────────────────────────────────────────────────────
export interface DailyCount {
  date: string;
  count: number;
}

export interface ProviderUsage {
  provider: string;
  model: string;
  messages: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  messagesWithUsage: number;
  costUsd: number | null;
  messagesWithCost: number;
  avgLatencyMs: number | null;
}

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  messagesWithCost: number;
  messagesWithoutCost: number;
}

export interface OverviewAnalytics {
  totals: { chatbots: number; activeChatbots: number; conversations: number; messages: number; configuredChatbots: number };
  providerStatus: {
    chatbotId: string;
    name: string;
    status: ChatbotStatus;
    provider: ProviderId;
    model: string;
    configured: boolean;
    lastTest: 'success' | 'failed' | null;
  }[];
  recentActivity: {
    id: string;
    conversationId: string;
    chatbotId: string;
    chatbotName: string;
    channel: Channel;
    preview: string;
    messageCount: number;
    lastMessageAt: string;
  }[];
  dailyConversations: DailyCount[];
  usageLast30Days: UsageSummary & { byModel: ProviderUsage[] };
}

export interface ChatbotAnalytics {
  days: number;
  totals: {
    conversations: number;
    messages: number;
    avgMessagesPerConversation: number;
    allTimeConversations: number;
    allTimeMessages: number;
  };
  dailyConversations: DailyCount[];
  dailyMessages: DailyCount[];
  topQuestions: { question: string; count: number; lastAsked: string }[];
  providerUsage: ProviderUsage[];
  usage: UsageSummary;
}

// ── Preview chat ────────────────────────────────────────────────────────────
export interface ChatDebug {
  provider: string;
  model: string;
  knowledge: { fileName?: string; page?: number; similarity?: number; via: string[] }[];
  retrievalMode: string;
  retrievalWarning?: string;
  verifiedProducts: string[];
  pageProducts: string[];
  priceCheck?: { passed: boolean; unverifiedAmounts: string[] };
  usage?: TokenUsage;
  costUsd?: number;
  latencyMs: number;
}

export interface ChatDonePayload {
  conversationId: string;
  messageId: string;
  content: string;
  error?: { code: string; message?: string };
  debug?: ChatDebug;
}
