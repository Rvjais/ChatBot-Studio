import { env } from '../../../config/env.js';
import { PROVIDERS } from '../../../config/providers.js';
import type { ModelInfo, ProviderCredentials } from '../ai-provider.interface.js';
import { OpenAICompatibleProvider } from './openai-compatible.base.js';

export class OpenRouterProvider extends OpenAICompatibleProvider {
  readonly id = 'openrouter' as const;
  protected readonly defaultBaseUrl = PROVIDERS.openrouter.defaultBaseUrl;

  protected override headers(creds: ProviderCredentials) {
    return {
      ...super.headers(creds),
      // Optional attribution headers recognised by OpenRouter.
      'HTTP-Referer': env.PUBLIC_API_URL,
      'X-Title': 'AI Chatbot Builder',
    };
  }

  /** Usage accounting makes OpenRouter return token counts and the actual cost charged. */
  protected override extraBody() {
    return { usage: { include: true } };
  }

  protected override mapModel(m: Record<string, unknown>): ModelInfo {
    const pricing = m.pricing as { prompt?: string; completion?: string } | undefined;
    const prompt = Number(pricing?.prompt);
    const completion = Number(pricing?.completion);
    const arch = m.architecture as { output_modalities?: string[] } | undefined;
    return {
      id: String(m.id),
      label: typeof m.name === 'string' ? m.name : String(m.id),
      type: arch?.output_modalities && !arch.output_modalities.includes('text') ? 'embedding' : 'chat',
      contextWindow: typeof m.context_length === 'number' ? m.context_length : undefined,
      pricing:
        Number.isFinite(prompt) && Number.isFinite(completion) && prompt >= 0 && completion >= 0
          ? { inputPerMillion: prompt * 1_000_000, outputPerMillion: completion * 1_000_000 }
          : undefined,
    };
  }
}
