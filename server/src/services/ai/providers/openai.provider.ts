import { PROVIDERS } from '../../../config/providers.js';
import { OpenAICompatibleProvider } from './openai-compatible.base.js';

export class OpenAIProvider extends OpenAICompatibleProvider {
  readonly id = 'openai' as const;
  protected readonly defaultBaseUrl = PROVIDERS.openai.defaultBaseUrl;

  /** Current OpenAI models use max_completion_tokens (max_tokens is rejected by reasoning models). */
  protected override maxTokensField() {
    return 'max_completion_tokens' as const;
  }

  /** Ask for token usage in the final streamed chunk. */
  protected override extraBody(stream: boolean) {
    return stream ? { stream_options: { include_usage: true } } : {};
  }
}
