import type { Response } from 'express';
import { runChat, type ChatRequest, type ChatResponse } from '../services/chat/chat.service.js';
import { AppError } from '../utils/errors.js';
import { abortOnDisconnect, openSSE } from '../utils/sse.js';

/**
 * Runs the chat engine and replies either as JSON or as an SSE stream:
 *   event: start  {conversationId}
 *   event: delta  {text}
 *   event: reset  {}            (discard streamed text; a fallback model is answering)
 *   event: error  {code, message}
 *   event: done   {conversationId, messageId, content}
 * `exposeErrors` is true only for the authenticated owner (dashboard preview); widget
 * visitors never see provider error details.
 */
export async function respondWithChat(
  res: Response,
  request: Omit<ChatRequest, 'signal'>,
  opts: { stream: boolean; exposeErrors: boolean },
): Promise<void> {
  const signal = abortOnDisconnect(res);
  const shape = (result: ChatResponse) => ({
    conversationId: result.conversationId,
    messageId: result.messageId,
    content: result.content,
    ...(result.error ? { error: opts.exposeErrors ? result.error : { code: result.error.code } } : {}),
    ...(opts.exposeErrors && result.debug ? { debug: result.debug } : {}),
  });

  if (!opts.stream) {
    const result = await runChat({ ...request, signal });
    res.json(shape(result));
    return;
  }

  const sse = openSSE(res);
  try {
    const result = await runChat(
      { ...request, signal },
      {
        onStart: (info) => sse.send('start', info),
        onDelta: (text) => sse.send('delta', { text }),
        onReset: () => sse.send('reset', {}),
      },
    );
    const payload = shape(result);
    if (payload.error) sse.send('error', { ...payload.error, content: result.content });
    sse.send('done', payload);
  } catch (err) {
    const known = err instanceof AppError;
    sse.send('error', {
      code: known ? err.code : 'INTERNAL_ERROR',
      message: known ? err.message : 'Something went wrong. Please try again.',
    });
  } finally {
    sse.close();
  }
}
