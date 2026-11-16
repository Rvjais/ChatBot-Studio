import type { ServerConfig } from '../types';
import { readSSE } from './sse';

export class WidgetApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

async function errorFrom(res: Response): Promise<WidgetApiError> {
  let code = 'HTTP_ERROR';
  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
  } catch {
    /* non-JSON error */
  }
  return new WidgetApiError(message, res.status, code);
}

export async function fetchConfig(apiBase: string, chatbotId: string): Promise<ServerConfig> {
  const res = await fetch(`${apiBase}/api/widget/config/${encodeURIComponent(chatbotId)}`, {
    method: 'GET',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { config: ServerConfig }).config;
}

export async function fetchConversation(apiBase: string, chatbotId: string, visitorId: string, conversationId: string) {
  const params = new URLSearchParams({ chatbotId, visitorId });
  const res = await fetch(`${apiBase}/api/widget/conversations/${encodeURIComponent(conversationId)}?${params}`, {
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as { conversationId: string; messages: { id: string; role: 'user' | 'assistant'; content: string }[] };
}

export interface SendMessageInput {
  apiBase: string;
  chatbotId: string;
  visitorId: string;
  conversationId: string | null;
  message: string;
  products?: unknown[];
  pageUrl: string;
  stream: boolean;
  signal?: AbortSignal;
}

export interface SendHandlers {
  onStart?(conversationId: string): void;
  onDelta?(text: string): void;
  onReset?(): void;
}

export interface SendResult {
  conversationId: string;
  content: string;
  error?: { code: string };
}

/**
 * Sends a visitor message. With streaming, tokens are delivered through `onDelta`;
 * the resolved `content` is always the final, server-verified text.
 */
export async function sendMessage(input: SendMessageInput, handlers: SendHandlers = {}): Promise<SendResult> {
  const res = await fetch(`${input.apiBase}/api/widget/chat`, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', Accept: input.stream ? 'text/event-stream' : 'application/json' },
    body: JSON.stringify({
      chatbotId: input.chatbotId,
      visitorId: input.visitorId,
      conversationId: input.conversationId,
      message: input.message,
      products: input.products && input.products.length ? input.products : undefined,
      pageUrl: input.pageUrl.slice(0, 1000),
      stream: input.stream,
    }),
    signal: input.signal,
  });
  if (!res.ok) throw await errorFrom(res);

  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('text/event-stream') || !res.body) {
    return (await res.json()) as SendResult;
  }

  let conversationId = input.conversationId ?? '';
  let streamed = '';
  const outcome: { final?: SendResult; error?: { code: string; message?: string; content?: string } } = {};
  for await (const evt of readSSE(res.body)) {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(evt.data) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (evt.event === 'start') {
      conversationId = String(data.conversationId ?? conversationId);
      handlers.onStart?.(conversationId);
    } else if (evt.event === 'delta' && typeof data.text === 'string') {
      streamed += data.text;
      handlers.onDelta?.(data.text);
    } else if (evt.event === 'reset') {
      streamed = '';
      handlers.onReset?.();
    } else if (evt.event === 'error') {
      outcome.error = data as unknown as { code: string; message?: string; content?: string };
    } else if (evt.event === 'done') {
      outcome.final = data as unknown as SendResult;
    }
  }
  if (outcome.final) return outcome.final;
  const streamError = outcome.error;
  if (streamError) {
    if (streamError.content) return { conversationId, content: streamError.content, error: { code: streamError.code } };
    throw new WidgetApiError(streamError.message ?? 'The assistant could not respond.', 200, streamError.code);
  }
  if (streamed) return { conversationId, content: streamed };
  throw new WidgetApiError('The connection closed before the answer completed.', 0, 'STREAM_INTERRUPTED');
}
