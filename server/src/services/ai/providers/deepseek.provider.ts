import { PROVIDERS } from '../../../config/providers.js';
import type { EmbedRequest, EmbedResult } from '../ai-provider.interface.js';
import { AIProviderError } from '../errors.js';
import { OpenAICompatibleProvider } from './openai-compatible.base.js';

export class DeepSeekProvider extends OpenAICompatibleProvider {
  readonly id = 'deepseek' as const;
  protected readonly defaultBaseUrl = PROVIDERS.deepseek.defaultBaseUrl;

  protected override extraBody(stream: boolean) {
    return stream ? { stream_options: { include_usage: true } } : {};
  }

  /** DeepSeek does not offer an embeddings API. */
  override async embed(_req: EmbedRequest): Promise<EmbedResult> {
    throw new AIProviderError({ provider: this.id, code: 'config', detail: 'DeepSeek does not provide embeddings' });
  }
}
