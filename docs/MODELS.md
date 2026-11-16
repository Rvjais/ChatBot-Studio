# AI Providers & Models

## Supported providers

| Provider | Adapter | Wire format | Streaming | Embeddings | Notes |
|---|---|---|---|---|---|
| OpenAI | `openai.provider.ts` | Chat Completions | ✔ | ✔ | Uses `max_completion_tokens`; usage via `stream_options.include_usage`. |
| DeepSeek | `deepseek.provider.ts` | OpenAI-compatible | ✔ | – | Use another provider for embeddings. |
| Anthropic Claude | `anthropic.provider.ts` | Messages API via the official `@anthropic-ai/sdk` | ✔ | – | `temperature`/`top_p` are not accepted by the current API version; depth is set with **effort**. Optional server-side refusal fallback on supported models. System prompt split into a cacheable stable part + per-request context. |
| Google Gemini | `gemini.provider.ts` | `generateContent` / `streamGenerateContent` | ✔ | ✔ | Thinking tokens are counted as output tokens. |
| OpenRouter | `openrouter.provider.ts` | OpenAI-compatible | ✔ | ✔ | Reports the actual cost charged per request (used for cost analytics). |
| Custom | `custom.provider.ts` | OpenAI-compatible | ✔ | ✔ | Any base URL (Ollama, vLLM, LM Studio, LiteLLM, gateways), configurable auth header/prefix and encrypted extra headers. |

All adapters implement `AIProvider` (`server/src/services/ai/ai-provider.interface.ts`): `generate`, `stream`, `listModels`, optional `embed`. Shared behavior: timeouts (`AI_REQUEST_TIMEOUT_MS`, also applied as an inactivity timeout while streaming), retries with exponential backoff that honor `Retry-After` (`AI_MAX_RETRIES`), normalized errors (`auth`, `rate_limit`, `not_found`, `timeout`, …) with credentials redacted, and an automatic retry without sampling parameters when a model rejects them.

Each chatbot chooses its own provider, model, key, base URL and parameters. The dashboard only shows parameters the selected provider supports (from `server/src/config/providers.ts`).

## Model catalog

`server/src/config/model-catalog.ts` lists suggested models with context windows and — **only where a verified price source exists** — pricing. The catalog never restricts what can be used: owners can type any model ID or load the live list from the provider (*Load models* button).

Context windows drive conversation-history trimming; unknown models default to 32K tokens (override per chatbot in AI Settings).

### Adding or overriding models without code changes
Create a JSON file and set `MODEL_CATALOG_PATH=/path/to/models.json`:

```json
[
  { "provider": "openai", "id": "gpt-4o-mini", "contextWindow": 128000,
    "pricing": { "inputPerMillion": 0.15, "outputPerMillion": 0.6, "source": "OpenAI pricing page, checked 2026-11-01" } },
  { "provider": "custom", "id": "llama3.1:8b", "label": "Llama 3.1 8B (Ollama)", "contextWindow": 128000 }
]
```
Entries are merged with the built-in catalog by `provider` + `id`. Prices are USD per 1M tokens.

## Cost accounting

Cost per message is recorded only from real data, in this order:
1. the cost reported by the provider (OpenRouter),
2. the chatbot owner's pricing override (AI Settings → Pricing),
3. verified catalog pricing.

Otherwise no cost is recorded, and analytics show "no pricing data" rather than an estimate. Token counts are always the provider-reported usage.

## Adding a new provider

1. Add its ID and capabilities to `PROVIDERS` in `server/src/config/providers.ts`.
2. Implement `AIProvider` in `server/src/services/ai/providers/<name>.provider.ts` (extend `OpenAICompatibleProvider` if it speaks that format — usually a few lines).
3. Register it in `server/src/services/ai/ai-provider.factory.ts`.
4. Optionally add catalog entries.

The chat engine, dashboard (which renders from `/api/ai/providers`) and analytics need no changes.
