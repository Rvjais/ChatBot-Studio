# Deployment Guide

## Components

| Component | What it is | Runs as |
|---|---|---|
| `server/` | Express API (dashboard API, public widget API, product sync API) | Node.js process (`npm start -w server`) |
| `server` worker | Background document processing (extraction, chunking, embeddings) | In the API process (`RUN_WORKER_IN_PROCESS=true`) **or** a separate process (`npm run worker -w server`) |
| `client/` | React dashboard (static files after build) | Served by the API (`SERVE_CLIENT=true`) or any static host/CDN |
| `widget/` | `widget.js`, a single self-contained script | Served by the API at `/widget.js` |
| MongoDB | All data (users, chatbots, chunks + embeddings, products, conversations, jobs) | MongoDB 6+ / Atlas |

## 1. Build

```bash
npm ci
npm run build          # widget → server → client
```

Outputs: `widget/dist/widget.js`, `server/dist/`, `client/dist/`.

## 2. Configure the server

Copy `server/.env.example` to `server/.env` and set at least:

| Variable | Notes |
|---|---|
| `NODE_ENV=production` | Enables strict checks; the server refuses to start without the secrets below. |
| `MONGODB_URI` | e.g. `mongodb+srv://user:pass@cluster/chatbot_builder` |
| `JWT_SECRET` | ≥ 32 random characters: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
| `ENCRYPTION_KEY` | 32 bytes, base64 or hex: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Back it up** — losing or changing it makes stored provider API keys unreadable (owners would have to re-enter them). |
| `PUBLIC_API_URL` | Public HTTPS URL of the API, e.g. `https://chat.yourdomain.com`. Used in embed snippets. |
| `CLIENT_URL` | Dashboard origin (CORS). Not needed when `SERVE_CLIENT=true` (same origin). |
| `TRUST_PROXY` | Number of reverse proxies in front (e.g. `1` behind Nginx / a load balancer) so rate limits see real client IPs. |
| `UPLOAD_DIR` | Private directory for uploaded files (persistent volume). Never serve it statically. |

Optional: `SERVE_CLIENT=true` to serve `client/dist` from the API; limits (`MAX_*`, `WIDGET_*`, `RATE_LIMIT_*`); `MODEL_CATALOG_PATH`; `VECTOR_STORE`; `ALLOW_PRIVATE_PROVIDER_URLS` (keep `false` in multi-tenant production — see Security).

For a separately hosted dashboard, build it with `VITE_API_URL=https://chat.yourdomain.com npm run build -w client` and add its origin to `CLIENT_URL`/`CORS_ORIGINS`.

## 3. Run

```bash
cd server && NODE_ENV=production node dist/server.js
# optional dedicated worker (then set RUN_WORKER_IN_PROCESS=false on the API):
cd server && NODE_ENV=production node dist/jobs/worker.js
```

The worker needs the same `MONGODB_URI`, `ENCRYPTION_KEY` and access to the same `UPLOAD_DIR` (shared volume) — see `server/.env.worker.example`. Multiple workers are safe: jobs are claimed atomically, and jobs whose worker died are re-claimed after 10 minutes.

Health check: `GET /health` → `200 {"status":"ok"}` (503 if the database is unreachable).

### Reverse proxy (Nginx) — streaming
Widget answers stream over Server-Sent Events; disable proxy buffering for the chat endpoints:

```nginx
location / {
  proxy_pass http://127.0.0.1:4000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_buffering off;          # SSE
  proxy_read_timeout 300s;
  client_max_body_size 25m;     # >= MAX_UPLOAD_MB
}
```

### Docker
The repository's `Dockerfile` builds a production image (API + dashboard + `widget.js`, non-root user,
built-in health check). `deploy/docker-compose.yml` runs it with MongoDB and Caddy (automatic HTTPS), and
`.github/workflows/ci-cd.yml` tests, builds and deploys it on every push to `main`.
**Step-by-step VPS guide (Hostinger or any Ubuntu server): [HOSTINGER-VPS.md](HOSTINGER-VPS.md).**

Without Compose: `docker run -p 4000:4000 --env-file server.env -v uploads:/data/uploads <image>`
(the image sets `NODE_ENV=production`, `SERVE_CLIENT=true` and `UPLOAD_DIR=/data/uploads`). The server locates
`server/.env`, `widget/dist` and `client/dist` relative to its own package, so the working directory does not matter.

## 4. Vector search at scale (optional)

The default `VECTOR_STORE=memory` loads one chatbot's vectors (filtered by `chatbotId` + embedding model) and computes exact cosine similarity in the API process, cached per knowledge-base version. It works with any MongoDB and is fast up to tens of thousands of chunks per chatbot.

For larger knowledge bases on **MongoDB Atlas**, set `VECTOR_STORE=atlas` and create this Atlas Vector Search index on the `knowledgechunks` collection (name it as `ATLAS_VECTOR_INDEX`, default `knowledge_chunk_vector_index`). `numDimensions` must match your embedding model (1536 for `text-embedding-3-small`, 3072 for `gemini-embedding-001` by default):

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine" },
    { "type": "filter", "path": "chatbotId" },
    { "type": "filter", "path": "embeddingModel" }
  ]
}
```
Every vector query is filtered by `chatbotId`, so knowledge never crosses chatbots or tenants.

## 5. Security checklist

- [ ] HTTPS everywhere (`PUBLIC_API_URL` must be `https://` so widget traffic is encrypted).
- [ ] Strong `JWT_SECRET` and `ENCRYPTION_KEY` from a secret manager; `ENCRYPTION_KEY` backed up.
- [ ] `ALLOW_PRIVATE_PROVIDER_URLS=false` (default in production): custom provider base URLs must be public HTTPS hosts, preventing server-side request forgery into your network/cloud metadata.
- [ ] `TRUST_PROXY` set correctly so rate limits key on real client IPs.
- [ ] `UPLOAD_DIR` on a private, persistent volume with backups; not web-served.
- [ ] MongoDB user limited to the application database; network access restricted.
- [ ] Review rate limits (`RATE_LIMIT_*`) and per-chatbot limits (`WIDGET_*`) for your traffic.
- [ ] Encourage chatbot owners to enable **allowed domains** for production chatbots.

What the platform already enforces: bcrypt (cost 12) password hashing; JWT with issuer/audience and server-side revocation (logout/password change); AES-256-GCM encryption of provider keys and custom headers with per-record associated data; keys never returned by any API or included in embed code; zod validation + operator-key stripping on all input (NoSQL injection); ownership checks on every private resource (foreign IDs return 404); upload type validation by extension *and* content signature, size/count limits, server-generated storage names; Helmet security headers and CSP; XSS-safe rendering in the widget (escaped Markdown, http(s)-only links, hex-only colors); prompt-injection hardening (untrusted content delimited, delimiter injection neutralized, rules placed above reference data); per-IP and per-chatbot rate limits; request body limits; Origin-based domain allow-lists (a browser control — rate limits remain the backstop for scripted clients).

## 6. Operations

- Logs are JSON (pino) on stdout; secrets (`authorization`, `apiKey`, `password`…) are redacted.
- Finished background jobs are removed automatically after 7 days (TTL index).
- Back up MongoDB and `UPLOAD_DIR` together (chunks reference uploaded files for reprocessing).
- Rotating `ENCRYPTION_KEY` requires re-entering provider keys (or a one-off re-encryption script using the old and new keys).
