export type AIErrorCode =
  | 'auth'
  | 'not_found'
  | 'bad_request'
  | 'rate_limit'
  | 'insufficient_credits'
  | 'server'
  | 'timeout'
  | 'network'
  | 'refusal'
  | 'config'
  | 'unknown';

const PUBLIC_MESSAGES: Record<AIErrorCode, string> = {
  auth: 'The AI provider rejected the API key. Check the key and its permissions.',
  not_found: 'The selected model or endpoint was not found at the AI provider.',
  bad_request: 'The AI provider rejected the request.',
  rate_limit: 'The AI provider rate limit was reached. Try again shortly.',
  insufficient_credits: 'The AI provider account has insufficient credits or quota.',
  server: 'The AI provider is temporarily unavailable.',
  timeout: 'The AI provider took too long to respond.',
  network: 'Could not reach the AI provider.',
  refusal: 'The AI provider declined to answer this request.',
  config: 'The AI provider is not fully configured for this chatbot.',
  unknown: 'The AI provider returned an unexpected error.',
};

/**
 * Normalized provider error. `message` is safe to show to the chatbot owner (dashboard);
 * widget visitors only ever see a generic message.
 */
export class AIProviderError extends Error {
  readonly provider: string;
  readonly code: AIErrorCode;
  readonly status?: number;
  readonly retryable: boolean;
  readonly detail?: string;

  constructor(opts: { provider: string; code: AIErrorCode; status?: number; detail?: string; retryable?: boolean }) {
    super(opts.detail ? `${PUBLIC_MESSAGES[opts.code]} (${opts.detail})` : PUBLIC_MESSAGES[opts.code]);
    this.provider = opts.provider;
    this.code = opts.code;
    this.status = opts.status;
    this.detail = opts.detail;
    this.retryable = opts.retryable ?? ['rate_limit', 'server', 'timeout', 'network'].includes(opts.code);
  }
}

export function codeFromStatus(status: number): AIErrorCode {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'insufficient_credits';
  if (status === 404) return 'not_found';
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  if (status >= 400) return 'bad_request';
  return 'unknown';
}

/** Removes anything that looks like a credential from provider error text before it is stored or shown. */
export function redactSecrets(text: string, secrets: (string | undefined)[] = []): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 6) out = out.split(s).join('[redacted]');
  }
  return out
    .replace(/\b(sk|rk|pk)-[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/\bsk-ant-[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, '[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, '$1[redacted]')
    .slice(0, 400);
}
