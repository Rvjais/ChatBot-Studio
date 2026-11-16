import type { Response } from 'express';

export interface SSEChannel {
  send(event: string, data: unknown): void;
  close(): void;
  readonly closed: boolean;
}

/** Opens a Server-Sent Events response with keep-alive heartbeats. */
export function openSSE(res: Response): SSEChannel {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  let closed = false;
  const heartbeat = setInterval(() => !closed && res.write(': ping\n\n'), 15_000);
  res.on('close', () => {
    closed = true;
    clearInterval(heartbeat);
  });
  return {
    send(event, data) {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      res.end();
    },
    get closed() {
      return closed;
    },
  };
}

/** AbortSignal that fires if the client disconnects before the response completes. */
export function abortOnDisconnect(res: Response): AbortSignal {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort(new Error('client disconnected'));
  });
  return controller.signal;
}
