# API Reference

Base URL: `PUBLIC_API_URL` (default `http://localhost:4000`). All bodies are JSON unless noted.

**Errors** always have this shape (HTTP status 4xx/5xx):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Some fields are invalid", "details": [{ "path": "name", "message": "..." }] } }
```

**Authentication** for dashboard routes: `Authorization: Bearer <JWT>` (from register/login).
A chatbot that exists but belongs to another user returns `404` — never `403` — so IDs cannot be probed.

---

## Auth

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/auth/register` | `{ name, email, password }` (password ≥ 8 chars, letters + numbers) | `201 { token, user }` |
| POST | `/api/auth/login` | `{ email, password }` | `{ token, user }` |
| GET | `/api/auth/me` | – | `{ user }` |
| PUT | `/api/auth/me` | `{ name }` | `{ user }` |
| PUT | `/api/auth/password` | `{ currentPassword, newPassword }` | `{ token, message }` (all other sessions revoked; use the new token) |
| POST | `/api/auth/logout` | – | `{ message }` (revokes every token of the user) |

`user = { id, name, email, createdAt }`

---

## Platform limits

`GET /api/platform/limits` (auth) → the server's configured limits, so clients validate against real values:

```ts
{ limits: { maxUploadMb, maxFilesPerUpload, maxKnowledgeFilesPerChatbot, maxProductImportMb, maxProductsPerChatbot,
            maxChatbotsPerUser, widget: { maxMessageChars, maxProducts, maxProductsBytes } } }
```

---

## AI catalog

| Method | Path | Response |
|---|---|---|
| GET | `/api/ai/providers` | `{ providers: ProviderDefinition[], embeddingProviders: [{ id, name }] }` |
| GET | `/api/ai/models?provider=openai&type=chat\|embedding` | `{ models: CatalogModel[] }` |

`ProviderDefinition`:
```ts
{
  id: 'openai'|'deepseek'|'anthropic'|'gemini'|'openrouter'|'custom';
  name: string; description: string; defaultBaseUrl: string;
  allowCustomBaseUrl: boolean; requiresBaseUrl: boolean; apiKeyRequired: boolean;
  apiKeyUrl?: string; docsUrl?: string;
  supports: {
    streaming: boolean; listModels: boolean; embeddings: boolean;
    temperature: { min, max, step, default? } | null;   // null = provider does not accept it
    topP: { ... } | null; frequencyPenalty: { ... } | null; presencePenalty: { ... } | null;
    effort: string[] | null;                             // Anthropic only
    customHeaders: boolean;                              // custom provider only
  };
  maxOutputTokensLimit: number;
}
```
`CatalogModel = { id, label, provider, type: 'chat'|'embedding', contextWindow?, maxOutputTokens?, dimensions?, pricing?: { inputPerMillion, outputPerMillion, source }, supportsSampling?, recommended?, notes? }`

---

## Chatbots

| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/api/chatbots` | `?q=&status=active\|inactive&provider=&sort=updated\|created\|name&page=&limit=` | `{ items: Chatbot[], total, page, limit }` (items include `stats`) |
| POST | `/api/chatbots` | `{ name, ...any chatbot field, ai?: AiConfigUpdate }` | `201 { chatbot }` |
| GET | `/api/chatbots/:id` | – | `{ chatbot }` (with `stats`) |
| PUT | `/api/chatbots/:id` | partial chatbot fields (nested objects are merged) | `{ chatbot }` |
| DELETE | `/api/chatbots/:id` | – | `204` (deletes files, chunks, products, conversations) |
| POST | `/api/chatbots/:id/duplicate` | `{ name?, includeProducts=true, includeKnowledge=true }` | `201 { chatbot }` (copy starts **inactive**) |
| PATCH | `/api/chatbots/:id/status` | `{ status: 'active'\|'inactive' }` | `{ chatbot }` |
| PUT | `/api/chatbots/:id/ai-config` | `AiConfigUpdate` | `{ chatbot }` |
| POST | `/api/chatbots/:id/test-provider` | `{ target: 'chat'\|'embedding', override?: AiConfigUpdate }` | `{ ok, latencyMs, message, model?, sample?, usage?, dimensions? }` |
| POST | `/api/chatbots/:id/models` | `{ provider?, apiKey?, baseUrl? }` | `{ models: [{ id, label, type, contextWindow?, maxOutputTokens?, pricing? }] }` (live from provider) |
| POST | `/api/chatbots/:id/preview-chat` | `{ message, conversationId?, products?, stream? }` | see *Chat responses* (includes `debug`) |
| GET | `/api/chatbots/:id/embed` | – | `{ publicId, widgetUrl, apiBase, testPageUrl, snippets: { basic, withProducts, customStyling, javascriptApi, react } }` |
| POST | `/api/chatbots/:id/sync-key` | – | `201 { key, message }` (key shown once) |
| DELETE | `/api/chatbots/:id/sync-key` | – | `204` |
| GET | `/api/chatbots/:id/analytics?days=30` | – | same as `/api/analytics/chatbots/:id` |

### Chatbot object
```ts
{
  id, publicId, name, description, identifier, status: 'active'|'inactive', language,   // language: 'auto' or e.g. 'English'
  welcomeMessage, placeholder, fallbackMessage, systemPrompt,
  personality: { tones: ('professional'|'friendly'|'casual'|'technical'|'concise'|'detailed')[], customInstructions },
  ai: {
    provider, model, hasApiKey: boolean, apiKeyLast4: string|null, baseUrl, authHeader, authPrefix, extraHeaderNames: string[],
    generation: { temperature|null, maxOutputTokens, topP|null, frequencyPenalty|null, presencePenalty|null, effort|null },
    pricing: { inputPerMillion|null, outputPerMillion|null }, contextWindow|null, refusalFallback: boolean,
    lastTest: { status: 'success'|'failed', message, testedAt, latencyMs } | null
  },
  embedding: { provider: 'none'|'openai'|'gemini'|'openrouter'|'custom', model, useChatCredentials, hasApiKey, apiKeyLast4, baseUrl, dimensions|null },
  knowledgeSettings: { topK, minScore, maxContextChars, strictMode },
  productSettings: { allowBrowserProducts, maxProductsInContext, priceGuard: 'append-notice'|'flag-only' },
  widget: { title, subtitle, primaryColor, secondaryColor, headerBackground, headerTextColor, position: 'bottom-right'|'bottom-left',
            avatarUrl, borderRadius (0-32), theme: 'light'|'dark'|'auto', size: 'small'|'medium'|'large',
            launcherText, showBranding, autoOpen, suggestedQuestions: string[] (≤6) },
  domainRestrictionEnabled: boolean, allowedDomains: string[],
  syncKey: { prefix, createdAt, lastUsedAt } | null,
  createdAt, updatedAt,
  stats?: { conversations, knowledgeFiles, products, lastActivityAt }
}
```
API keys are **never** returned — only `hasApiKey` and `apiKeyLast4`.

### AiConfigUpdate (all fields optional)
```ts
{
  provider, model,
  apiKey?: string | null,          // omit = keep, null/'' = remove, string = replace (encrypted at rest)
  baseUrl?: string | null,
  authHeader?, authPrefix?,        // custom provider auth header, e.g. "Authorization" + "Bearer "
  extraHeaders?: Record<string,string> | null,   // custom provider; stored encrypted
  generation?: { temperature?, maxOutputTokens?, topP?, frequencyPenalty?, presencePenalty?, effort? },  // null clears
  pricing?: { inputPerMillion?, outputPerMillion? },   // USD per 1M tokens, used for cost estimates
  contextWindow?: number | null, refusalFallback?: boolean,
  embedding?: { provider?, model?, useChatCredentials?, apiKey?, baseUrl?, dimensions? }
}
```
Changing `provider` without sending `apiKey` removes the stored key (keys are vendor-specific).

---

## Knowledge base

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/chatbots/:id/knowledge/upload` | `multipart/form-data`, field **`files`** (1–10 files: pdf, txt, md, docx, csv, json, xlsx) | `201 { files: KnowledgeFile[] }` |
| POST | `/api/chatbots/:id/knowledge/text` | `{ title, content }` | `201 { file }` |
| GET | `/api/chatbots/:id/knowledge` | – | `{ files: KnowledgeFile[], totals: { files, chunks, pending, processing, completed, failed } }` |
| GET | `/api/chatbots/:id/knowledge/:fileId/chunks?page=&limit=` | – | `{ items: [{ id, index, content, tokenEstimate, embedded, metadata: { page, sheet, rows } }], total, page, limit }` |
| DELETE | `/api/chatbots/:id/knowledge/:fileId` | – | `204` |
| POST | `/api/chatbots/:id/knowledge/:fileId/reprocess` | – | `{ file }` |
| POST | `/api/chatbots/:id/knowledge/reprocess-all` | – | `{ queued }` |
| POST | `/api/chatbots/:id/knowledge/search` | `{ query }` | `{ chunks: [{ chunkId, fileId, fileName, content, page?, similarity?, via: ['vector'\|'keyword'] }], mode: 'hybrid'\|'keyword'\|'none', warning? }` |
| GET | `/api/knowledge?chatbotId=&status=&page=&limit=` | – | all files of the user: `{ items: (KnowledgeFile & { chatbotName })[], total, page, limit }` |

`KnowledgeFile = { id, chatbotId, fileName, fileType, size, source: 'upload'|'text', processingStatus: 'pending'|'processing'|'completed'|'failed', error, warning, chunkCount, embeddedChunkCount, characterCount, processedAt, createdAt, updatedAt }`

Processing is asynchronous: poll the list while any file is `pending`/`processing`.

---

## Products

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/chatbots/:id/products?q=&category=&page=&limit=` | – | `{ items: Product[], total, page, limit }` |
| POST | `/api/chatbots/:id/products` | product object (any common field names, see below) | `201 { product }` |
| POST | `/api/chatbots/:id/products/import` | `multipart/form-data`: field **`file`** (.json/.csv/.xlsx) + optional field `mode` = `upsert`\|`replace` | `{ report: { total, inserted, updated, failed, removed, errors: [{ row, message }], warnings: string[] } }` |
| GET | `/api/chatbots/:id/products/categories` | – | `{ categories: string[] }` |
| POST | `/api/chatbots/:id/products/search-test` | `{ query, pageProducts? }` | `{ verified: Product[], page: Product[], summary, interpretedQuery }` |
| PUT | `/api/chatbots/:id/products/:productDbId` | full product object | `{ product }` |
| DELETE | `/api/chatbots/:id/products/:productDbId` | – | `204` |
| DELETE | `/api/chatbots/:id/products` | `{ confirm: true }` | `{ deleted }` |

`Product = { id (database id), productId, name, description, price|null, currency|null, availability|null, category|null, productUrl|null, imageUrl|null, additionalFields: {}, source: 'upload'|'manual'|'sync', createdAt, updatedAt }`

Accepted input field names (case/spacing-insensitive): id/sku/productId/code, name/title, price/sale_price/amount/cost/mrp,
currency, description/details, availability/stock/in_stock/status/quantity, category/type/collection, url/link/product_url,
image/image_url. Unknown top-level fields go to `additionalFields`; a nested `additionalFields` (or `attributes`) object is
merged into it. Prices like `"₹2,499.00"` are parsed; non-http(s) URLs are dropped.

A product exactly as returned by the API can be sent back to `PUT` (edit fields in place): output-only fields
(`id`, `source`, `createdAt`, `updatedAt`) are ignored, and `PUT` replaces the product — fields you omit are cleared.

### Product sync API (server-to-server, for large catalogs)
Authenticate with the chatbot's sync key: `Authorization: Bearer cbsk_<...>`.

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/v1/sync/products` | `{ mode: 'upsert'\|'replace', products: [...] }` (≤ 5000 per call, ≤ 10 MB) | `{ report }` |
| GET | `/api/v1/sync/products?page=&limit=` | – | `{ items, total, page, limit }` |
| DELETE | `/api/v1/sync/products/:productId` | – (business product ID) | `204` |

---

## Conversations

| Method | Path | Response |
|---|---|---|
| GET | `/api/conversations?chatbotId=&q=&channel=widget\|preview&page=&limit=` | `{ items: [{ id, conversationId, chatbotId, chatbotName, visitorId, channel, messageCount, preview, origin, pageUrl, createdAt, lastMessageAt }], total, page, limit }` |
| GET | `/api/conversations/:id` | `{ conversation, messages: [{ id, role, content, timestamp, tokenUsage, metadata }] }` |
| DELETE | `/api/conversations/:id` | `204` |

`metadata` on assistant messages: `{ provider, model, latencyMs, finishReason, costUsd?, costSource?, sources: [{ fileId, fileName, chunkId, score, page }], productIds?, browserProductIds?, priceCheck?: { passed, unverifiedAmounts }, error?: { code, message }, streamed }`

---

## Analytics

`GET /api/analytics/overview`
```ts
{
  totals: { chatbots, activeChatbots, conversations, messages, configuredChatbots },
  providerStatus: [{ chatbotId, name, status, provider, model, configured, lastTest: 'success'|'failed'|null }],
  recentActivity: [{ id, conversationId, chatbotId, chatbotName, channel, preview, messageCount, lastMessageAt }],
  dailyConversations: [{ date: 'YYYY-MM-DD', count }],          // last 14 days
  usageLast30Days: { byModel: ProviderUsage[], inputTokens, outputTokens, costUsd|null, messagesWithCost, messagesWithoutCost }
}
```

`GET /api/analytics/chatbots/:id?days=30`
```ts
{
  days,
  totals: { conversations, messages, avgMessagesPerConversation, allTimeConversations, allTimeMessages },
  dailyConversations: [{ date, count }],
  dailyMessages: [{ date, count }],        // visitor (user) messages per day; totals.messages counts visitor + assistant
  topQuestions: [{ question, count, lastAsked }],
  providerUsage: ProviderUsage[],
  usage: { inputTokens, outputTokens, costUsd|null, messagesWithCost, messagesWithoutCost }
}
ProviderUsage = { provider, model, messages, errors, inputTokens, outputTokens, messagesWithUsage, costUsd|null, messagesWithCost, avgLatencyMs|null }
```
`costUsd` is `null` when no message had a known price — costs are never estimated without pricing data.
Conversation/message counts exclude dashboard test chats; token usage includes them (they are billed).

---

## Public widget API

CORS is open; per-chatbot **allowed domains** are enforced via the `Origin`/`Referer` header when enabled.

| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/api/widget/config/:publicId` | – | `{ config: { publicId, name, welcomeMessage, placeholder, language, widget: {...}, features: { streaming, pageProducts }, limits: { maxMessageChars, maxProducts, maxProductsBytes } } }` |
| POST | `/api/widget/chat` | `{ chatbotId, message, visitorId, conversationId?, products?, pageUrl?, stream? }` | JSON or SSE (below) |
| GET | `/api/widget/conversations/:conversationId?chatbotId=&visitorId=` | – | `{ conversationId, messages: [{ id, role, content, timestamp }] }` |

### Chat responses
Non-streaming: `{ conversationId, messageId, content, error?: { code } }`. Preview chat also returns `error.message` and `debug`.

Streaming (`stream: true`) returns `text/event-stream`:
```
event: start   data: {"conversationId":"conv_..."}
event: delta   data: {"text":"Hel"}
event: reset   data: {}                 ← discard text streamed so far (provider fallback)
event: error   data: {"code":"rate_limit","content":"Sorry — ..."}
event: done    data: {"conversationId":"conv_...","messageId":"...","content":"full final text"}
```
Always render `done.content` as the final message (it may include a price notice appended after verification).
