import { env } from '../../config/env.js';
import { AIProviderError, codeFromStatus, redactSecrets } from './errors.js';

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

export interface TimeoutHandle {
  signal: AbortSignal;
  /** Restart the inactivity timer (call on every streamed chunk). */
  touch(): void;
  clear(): void;
  timedOut(): boolean;
}

/** AbortSignal that fires after `ms` of inactivity or when the parent signal aborts. */
export function inactivityTimeout(ms: number, parent?: AbortSignal): TimeoutHandle {
  const controller = new AbortController();
  let fired = false;
  let timer: NodeJS.Timeout | undefined;
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fired = true;
      controller.abort(new Error('timeout'));
    }, ms);
  };
  const onParentAbort = () => controller.abort(parent?.reason);
  if (parent) {
    if (parent.aborted) controller.abort(parent.reason);
    else parent.addEventListener('abort', onParentAbort, { once: true });
  }
  arm();
  return {
    signal: controller.signal,
    touch: arm,
    clear: () => {
      if (timer) clearTimeout(timer);
      parent?.removeEventListener('abort', onParentAbort);
    },
    timedOut: () => fired,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function backoffMs(attempt: number, retryAfterHeader: string | null): number {
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1000, 20_000);
  const base = 500 * 2 ** attempt;
  return Math.min(base + Math.random() * 250, 8_000);
}

/** Extracts a human-readable error message from common provider error payloads. */
export function extractErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body);
    const candidates = [
      parsed?.error?.message,
      parsed?.error?.metadata?.raw,
      parsed?.message,
      Array.isArray(parsed) ? parsed[0]?.error?.message : undefined,
      typeof parsed?.error === 'string' ? parsed.error : undefined,
    ];
    const msg = candidates.find((c) => typeof c === 'string' && c.trim());
    if (msg) return msg;
  } catch {
    /* not JSON */
  }
  return body.slice(0, 300);
}

export interface ProviderFetchOptions {
  provider: string;
  url: string;
  init: RequestInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  /** Secrets to redact from error messages. */
  secrets?: (string | undefined)[];
}

/**
 * fetch() with timeout, retry (exponential backoff + jitter, honoring Retry-After) and
 * normalized errors. Returns the OK response with an active inactivity timer the caller
 * must `touch()` while streaming and `clear()` when done.
 */
export async function providerFetch(opts: ProviderFetchOptions): Promise<{ response: Response; timer: TimeoutHandle }> {
  const maxRetries = opts.maxRetries ?? env.AI_MAX_RETRIES;
  const timeoutMs = opts.timeoutMs ?? env.AI_REQUEST_TIMEOUT_MS;
  let attempt = 0;
  for (;;) {
    const timer = inactivityTimeout(timeoutMs, opts.signal);
    let response: Response;
    try {
      response = await fetch(opts.url, { ...opts.init, signal: timer.signal });
    } catch (err) {
      const timedOut = timer.timedOut();
      timer.clear();
      if (opts.signal?.aborted && !timedOut) throw err;
      const code = timedOut ? 'timeout' : 'network';
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt++, null));
        continue;
      }
      throw new AIProviderError({
        provider: opts.provider,
        code,
        detail: timedOut ? `no response within ${timeoutMs}ms` : redactSecrets(String((err as Error)?.message ?? err), opts.secrets),
      });
    }

    if (response.ok) return { response, timer };

    const body = await response.text().catch(() => '');
    timer.clear();
    if (RETRYABLE_STATUS.has(response.status) && attempt < maxRetries) {
      await sleep(backoffMs(attempt++, response.headers.get('retry-after')));
      continue;
    }
    throw new AIProviderError({
      provider: opts.provider,
      code: codeFromStatus(response.status),
      status: response.status,
      detail: redactSecrets(`HTTP ${response.status}: ${extractErrorMessage(body)}`, opts.secrets),
    });
  }
}

export interface SSEMessage {
  event?: string;
  data: string;
}

/** Minimal, spec-compliant Server-Sent Events parser over a fetch() body. */
export async function* parseSSE(body: ReadableStream<Uint8Array>, onChunk?: () => void): AsyncGenerator<SSEMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event: string | undefined;
  let data: string[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      onChunk?.();
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.search(/\r?\n/)) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + (buffer[idx] === '\r' ? 2 : 1));
        if (line === '') {
          if (data.length) yield { event, data: data.join('\n') };
          event = undefined;
          data = [];
          continue;
        }
        if (line.startsWith(':')) continue;
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? '' : line.slice(colon + 1);
        if (value.startsWith(' ')) value = value.slice(1);
        if (field === 'data') data.push(value);
        else if (field === 'event') event = value;
      }
    }
    if (data.length) yield { event, data: data.join('\n') };
  } finally {
    reader.releaseLock();
  }
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
