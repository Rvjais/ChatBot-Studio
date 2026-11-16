# Development Checklist

Status legend: ✅ implemented and verified by automated tests or a real-browser run · ☑️ implemented, verified manually · ⏳ pending

## Phase 1 — Foundation
- ✅ Repository inspected (greenfield: only the specification existed)
- ✅ npm workspaces monorepo: `server/`, `client/`, `widget/`
- ✅ Environment validation with fail-fast production checks; `.env.example` for server, worker and client
- ✅ MongoDB connection; embedded persistent MongoDB for zero-setup development
- ✅ Authentication: register, login, logout with token revocation, `/me`, profile, password change (bcrypt, JWT)
- ✅ Dashboard foundation: login/register, protected routes, session expiry handling, responsive sidebar layout (drawer on mobile)

## Phase 2 — Chatbot management
- ✅ CRUD, duplicate (settings, products, knowledge; secrets re-encrypted), activate/deactivate, search/filter/sort, quota
- ✅ Per-chatbot system prompt, personality, language, welcome/placeholder/fallback messages, strict mode
- ✅ Provider/model selection per chatbot with provider-specific parameters
- ✅ Dashboard: chatbot list (search, status/provider filters, sort), create/duplicate/delete dialogs, status toggle; workspace with General, AI Settings (provider-aware parameters, write-only key field, live model list, connection test) and Instructions tabs; unsaved-changes guard

## Phase 3 — AI integration
- ✅ Provider interface, factory, model catalog with operator overrides
- ✅ OpenAI, DeepSeek, Anthropic (official SDK), Gemini, OpenRouter, custom OpenAI-compatible
- ✅ Streaming (SSE) end to end, usage capture, provider cost (OpenRouter), timeouts, retries with backoff, normalized + redacted errors
- ✅ Test connection, live model listing, unsaved-config testing
- ✅ API keys encrypted (AES-256-GCM, record-bound AAD), never returned, never in embed code
- ✅ SSRF guard for custom base URLs in production

## Phase 4 — Knowledge base
- ✅ Upload (PDF, TXT/MD, DOCX, CSV, JSON, XLSX) with extension + content-signature validation, size/count limits, private storage
- ✅ Background job queue (MongoDB) with retries, stale-lock recovery, in-process or standalone worker
- ✅ Extraction with provenance (page/sheet/rows), normalization, boundary-aware chunking with overlap
- ✅ Embeddings (OpenAI, Gemini, OpenRouter, custom), graceful keyword-only fallback
- ✅ Hybrid retrieval (cosine vector search + MongoDB full-text, RRF), strictly filtered per chatbot; Atlas Vector Search option
- ✅ Retrieved knowledge in prompts with source tracking; prompt-injection delimiter neutralization
- ✅ Dashboard: drag-and-drop upload with configured limits, live processing status, chunk viewer, reprocess/delete, text entries, retrieval tester, global Knowledge Base page

## Phase 5 — Product data
- ✅ JSON / CSV / Excel import with alias mapping, price parsing, validation report, upsert/replace
- ✅ Product CRUD, search, categories, delete-all
- ✅ Structured retrieval: IDs, price ranges ("under ₹3,000", "3k", "between"), categories, cheapest/most expensive, keywords, follow-up carry-over
- ✅ Page-provided products via embed config: validation, limits, unverified labelling, verified-wins conflicts, per-chatbot switch
- ✅ Product sync API with hashed per-chatbot keys
- ✅ Post-generation price verification with notice/flag
- ✅ Dashboard: product table (search, category filter, pagination), add/edit/delete/delete-all, import with validation report, product settings, retrieval tester

## Phase 6 — Embeddable widget
- ✅ Standalone IIFE bundle, Shadow DOM, no framework dependency (verified on a plain HTML page from another origin)
- ✅ Launcher, panel, header, welcome, suggestions, Markdown, typing indicator, streaming, errors + retry, history restore, mobile full screen, a11y
- ✅ Customization (colors, position, avatar, radius, theme, size, launcher text, branding) + page overrides + JS API
- ✅ Embed snippet generation, standalone test page
- ✅ Allowed-domain restriction (verified in browser)
- ✅ Dashboard: Appearance tab with live widget preview; Embed tab with snippets, platform/product/styling/domain docs, standalone test page link, sync-key management and domain allow-list editor; streaming test chat with Markdown and per-answer debug details

## Phase 7 — Conversations & analytics
- ✅ Conversation and message storage with tokens, cost, latency, sources, products, price checks, errors
- ✅ Conversation list/search/filter/detail/delete API
- ✅ Analytics: totals, daily series, messages per conversation, top questions, provider/model usage, real tokens, cost only with known pricing
- ✅ Dashboard: Overview, Conversations (search, filters, viewer with per-message model/tokens/cost/sources/price checks), Analytics (global and per chatbot, accessible SVG charts with table view), API Configuration, Settings

## Phase 8 — Security & production
- ✅ Tenant isolation verified by a cross-tenant attack test over every private endpoint
- ✅ Rate limiting (API, auth, widget chat per IP+chatbot, widget config, provider tests, sync), request size limits
- ✅ NoSQL-injection key stripping + strict validation; XSS-safe widget rendering; Helmet headers + CSP
- ✅ Structured logging with secret redaction; centralized error handling
- ✅ Deployment documentation, security checklist, Atlas vector index definition
