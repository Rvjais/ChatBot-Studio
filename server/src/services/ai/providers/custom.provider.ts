import type { ProviderCredentials } from '../ai-provider.interface.js';
import { OpenAICompatibleProvider } from './openai-compatible.base.js';

const FORBIDDEN_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'cookie']);

/**
 * Any OpenAI-compatible endpoint (Ollama, vLLM, LM Studio, LiteLLM, corporate gateways…)
 * with a configurable base URL, authentication header/prefix and extra headers.
 */
export class CustomProvider extends OpenAICompatibleProvider {
  readonly id = 'custom' as const;
  protected readonly defaultBaseUrl = '';

  protected override headers(creds: ProviderCredentials) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    for (const [name, value] of Object.entries(creds.extraHeaders ?? {})) {
      if (!FORBIDDEN_HEADERS.has(name.toLowerCase())) headers[name] = value;
    }
    if (creds.apiKey) {
      const headerName = creds.authHeader?.trim() || 'Authorization';
      const prefix = creds.authPrefix ?? 'Bearer ';
      headers[headerName] = `${prefix}${creds.apiKey}`;
    }
    return headers;
  }
}
