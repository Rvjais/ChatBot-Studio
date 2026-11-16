# AI Chatbot Builder

A multi-tenant SaaS for creating AI chatbots and embedding them on any website with one script tag.
Each chatbot has its own system prompt, personality, AI provider/model/API key, knowledge base (RAG),
product catalog, appearance, domain restrictions, conversations and analytics.

```
┌──────────────┐   JWT    ┌──────────────────────────── server (Express + MongoDB) ───────────────────────────┐
│  Dashboard   │ ───────► │ /api/*          auth · chatbots · AI config · knowledge · products · analytics      │
│ (React/Vite) │          │ /api/widget/*   public config · chat (JSON or SSE stream) · conversation restore   │
└──────────────┘          │ /api/v1/sync/*  server-to-server product sync (per-chatbot secret key)              │
┌──────────────┐  public  │ /widget.js      embeddable bundle      /embed-test/:id   plain-HTML test page       │
│ Any website  │ ───────► │                                                                                    │
│ + widget.js  │   ID     │ Chat engine ─► knowledge retrieval (vector + full-text, per chatbot)               │
└──────────────┘          │             ─► structured product retrieval (exact DB queries) + page products     │
                          │             ─► AI provider adapters: OpenAI · DeepSeek · Anthropic · Gemini ·       │
                          │                OpenRouter · custom OpenAI-compatible                                │
                          │ Job worker ─► extract (PDF/DOCX/TXT/CSV/JSON/XLSX) → chunk → embed → store          │
                          └────────────────────────────────────────────────────────────────────────────────────┘
```

## Quick start (development)

Requirements: Node.js 20+ and a Chromium-based browser for the end-to-end test. MongoDB is optional in development.

```bash
npm install
npm run dev
```

- API: http://localhost:4000 · Dashboard: http://localhost:5173 · Widget bundle rebuilt on change.
- Without `MONGODB_URI`, the API starts an **embedded MongoDB** persisted in `server/.data/db`. The first start downloads a MongoDB binary (several hundred MB). To use your own database, set `MONGODB_URI` in `server/.env` (copy `server/.env.example`).
- Development secrets (`JWT_SECRET`, `ENCRYPTION_KEY`) are generated once into `server/.data/dev-secrets.json`. Production requires explicit values.

Then: register in the dashboard → create a chatbot → **AI Settings**: choose a provider, model and paste your API key → *Test connection* → upload knowledge files / products → **Embed**: copy the snippet or open the standalone test page.

## Features

| Area | What you get |
|---|---|
| Accounts | Registration, login, logout (server-side token revocation), password change; every query scoped to the owner. |
| Chatbots | Unlimited chatbots (configurable cap), search/filter, duplicate (with products & knowledge), activate/deactivate, delete with full cascade. |
| Instructions | Per-chatbot system prompt, personality tones + custom instructions, language, welcome/placeholder/fallback messages, strict mode. |
| AI providers | OpenAI, DeepSeek, Anthropic Claude (official SDK), Google Gemini, OpenRouter, any OpenAI-compatible endpoint. Per-chatbot model, key, base URL, parameters (only those the provider supports), pricing and context window. Test connection and live model lists. Streaming, retries, timeouts, normalized errors. |
| Key security | AES-256-GCM encryption at rest bound to each chatbot; keys are write-only in the API and never reach the browser or embed code. |
| Knowledge base | Upload PDF, TXT/MD, DOCX, CSV, JSON, XLSX or add text entries. Background processing (validate → store → extract → normalize → chunk → embed). Status, chunk counts, chunk viewer, reprocess, retrieval tester. Hybrid retrieval (embeddings + full-text) strictly per chatbot, with source attribution. |
| Products | Import JSON/CSV/Excel (flexible field names, price parsing, validation report, upsert/replace), CRUD, search; sync API for large catalogs; products supplied by the page through the embed config. Exact database queries for IDs, price ranges, categories and "cheapest/most expensive"; prices always copied from records and verified after generation. |
| Widget | ~10 KB gzipped, no dependencies, Shadow DOM isolation, streaming, Markdown, suggested questions, history restore, retry, mobile full-screen, light/dark/auto, positions, sizes, colors, avatar, JS API, allowed-domain restriction. |
| Conversations | All conversations with search and filters, full history with per-message model, tokens, cost, latency, sources, products and price-check results. |
| Analytics | Conversations/messages over time, messages per conversation, top questions, provider/model usage, real token counts, cost only where pricing is known. |

## Commands

| Command | Description |
|---|---|
| `npm run dev` | API (watch) + dashboard (Vite) + widget (watch build) |
| `npm run build` | Build widget, server and dashboard |
| `npm start` | Start the built API server |
| `npm run worker` | Start a standalone background worker (production) |
| `npm test` | Server test suite + widget unit tests |
| `npm run test:e2e -w widget` | Real-browser test of the embed on a plain HTML page from another origin (build the widget first) |
| `npm run typecheck` | Type-check all packages |

**Deployment:** push to `main` → GitHub Actions runs everything above, builds a Docker image and deploys it to
your server (`.github/workflows/ci-cd.yml`, `Dockerfile`, `deploy/`). See [docs/HOSTINGER-VPS.md](docs/HOSTINGER-VPS.md).

## Testing

- **Server (94 tests)** — `server/tests`: auth & token revocation, platform limits, chatbot CRUD/duplicate/cascade, a cross-tenant attack matrix (every private endpoint returns 404 for another user), API-key encryption and non-disclosure, all six provider adapters over real HTTP against a wire-format mock (OpenAI, Anthropic via the official SDK, Gemini, OpenRouter, DeepSeek, custom), retries and error mapping, real PDF/DOCX/XLSX/CSV/JSON/TXT processing, hybrid RAG and knowledge isolation, prompt-injection delimiter neutralization, product imports, product updates round-tripping the API's own shape, the example product questions, price guard, widget config/chat/SSE/conversation restore, page-provided products and conflicts, domain restrictions, sync API, analytics and cost accounting.
- **Widget unit (13 tests)** — XSS-safe Markdown, SSE parsing, config sanitization, Shadow DOM rendering, streaming, error + retry, product limits.
- **End-to-end (17 checks)** — `widget/tests/e2e/run-e2e.mjs` starts MongoDB, a mock AI provider and the real API, serves a plain HTML store with hostile global CSS on a different origin, and drives headless Edge/Chrome: boot without React, style isolation, streaming chat, both product methods together, history restore, JS API, mobile layout, domain blocking, analytics.

The automated tests use a local mock that implements each provider's real wire format, because no provider API keys are available to the test environment. Live calls are made by the same adapters once you enter real keys (use *Test connection* in AI Settings).

## Project structure

```
server/   Express + TypeScript API
  src/config        env validation, providers, model catalog, database, logger
  src/models        Mongoose models (User, Chatbot, KnowledgeFile, KnowledgeChunk, Product, Conversation, Message, Job)
  src/middleware    auth, ownership, validation, sanitization, rate limits, uploads, errors
  src/services/ai   provider interface, factory, adapters, HTTP/SSE utilities, cost & config resolution
  src/services/knowledge  validation, storage, extraction, chunking, embeddings, vector store, retrieval, processor
  src/services/products   normalization, import, retrieval, page products
  src/services/chat       prompt builder, context window, price guard, chat engine
  src/jobs          MongoDB-backed job queue, runner, standalone worker
client/   React + Vite + Tailwind dashboard
widget/   Standalone embeddable widget (TypeScript → single IIFE bundle)
docs/     API reference, embedding guide, deployment, models, development checklist
```

## Documentation

- [docs/API.md](docs/API.md) — REST API reference
- [docs/EMBEDDING.md](docs/EMBEDDING.md) — installing the widget, product data, styling, domain restrictions
- [docs/HOSTINGER-VPS.md](docs/HOSTINGER-VPS.md) — hosting on a VPS with Docker, HTTPS and automatic deploys from GitHub
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production configuration, worker, reverse proxy, Atlas vector search, security checklist
- [docs/MODELS.md](docs/MODELS.md) — providers, model catalog, cost accounting, adding a provider
- [docs/CHECKLIST.md](docs/CHECKLIST.md) — development checklist by phase
