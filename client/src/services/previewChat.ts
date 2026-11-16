import type { ChatDonePayload } from '../types/api';
import { ApiError, NETWORK_ERROR_MESSAGE } from '../utils/errors';
import { API_BASE, handleUnauthorized } from './http';
import { getToken } from '../stores/auth';

export interface PreviewChatHandlers {
  onStart?: (data: { conversationId: string }) => void;
  onDelta?: (text: string) => void;
  /** Discard text streamed so far (the provider fell back to another model). */
  onReset?: () => void;
  onError?: (data: { code: string; message?: string; content?: string }) => void;
  onDone?: (data: ChatDonePayload) => void;
}

export interface PreviewChatRequest {
  message: string;
  conversationId?: string | null;
  products?: unknown[];
}

/**
 * Streams a dashboard test chat over SSE using fetch (EventSource cannot POST or send headers).
 * Resolves when the stream ends. Throws ApiError for non-2xx responses.
 */
export async function streamPreviewChat(
  chatbotId: string,
  body: PreviewChatRequest,
  handlers: PreviewChatHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/chatbots/${encodeURIComponent(chatbotId)}/preview-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: JSON.stringify({ ...body, conversationId: body.conversationId ?? undefined, stream: true }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE);
  }

  if (!res.ok) {
    let code = 'HTTP_ERROR';
    let message = `Request failed with status ${res.status}`;
    let details;
    try {
      const data = (await res.json()) as { error?: { code?: string; message?: string; details?: { path: string; message: string }[] } };
      if (data.error?.message) {
        code = data.error.code ?? code;
        message = data.error.message;
        details = data.error.details;
        if (code === 'VALIDATION_ERROR' && details?.[0]) message = `${message} — ${details[0].path}: ${details[0].message}`;
      }
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 401) handleUnauthorized(message);
    throw new ApiError(res.status, code, message, details);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream') || !res.body) {
    // Server answered with plain JSON (e.g. streaming disabled) — treat as a single done event.
    const data = (await res.json()) as ChatDonePayload;
    if (data.error) handlers.onError?.({ ...data.error, content: data.content });
    handlers.onDone?.(data);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (block: string) => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue; // comment / heartbeat
      const idx = line.indexOf(':');
      const field = idx === -1 ? line : line.slice(0, idx);
      const value = idx === -1 ? '' : line.slice(idx + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'data') dataLines.push(value);
    }
    if (!dataLines.length) return;
    let data: unknown;
    try {
      data = JSON.parse(dataLines.join('\n'));
    } catch {
      return;
    }
    switch (event) {
      case 'start':
        handlers.onStart?.(data as { conversationId: string });
        break;
      case 'delta':
        handlers.onDelta?.((data as { text?: string }).text ?? '');
        break;
      case 'reset':
        handlers.onReset?.();
        break;
      case 'error':
        handlers.onError?.(data as { code: string; message?: string; content?: string });
        break;
      case 'done':
        handlers.onDone?.(data as ChatDonePayload);
        break;
      default:
        break;
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      dispatch(buffer.slice(0, sep));
      buffer = buffer.slice(sep + 2);
      sep = buffer.indexOf('\n\n');
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) dispatch(buffer);
}
