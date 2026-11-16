import type { ProviderId } from '../../config/providers.js';
import type { AIProvider } from './ai-provider.interface.js';
import { AnthropicProvider } from './providers/anthropic.provider.js';
import { CustomProvider } from './providers/custom.provider.js';
import { DeepSeekProvider } from './providers/deepseek.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { OpenAIProvider } from './providers/openai.provider.js';
import { OpenRouterProvider } from './providers/openrouter.provider.js';

/**
 * Provider registry. To add a provider: implement AIProvider, describe it in
 * config/providers.ts, and register it here — the chat engine needs no changes.
 */
const registry: Record<ProviderId, AIProvider> = {
  openai: new OpenAIProvider(),
  deepseek: new DeepSeekProvider(),
  anthropic: new AnthropicProvider(),
  gemini: new GeminiProvider(),
  openrouter: new OpenRouterProvider(),
  custom: new CustomProvider(),
};

export function getProvider(id: ProviderId): AIProvider {
  const provider = registry[id];
  if (!provider) throw new Error(`Unknown AI provider: ${id}`);
  return provider;
}
