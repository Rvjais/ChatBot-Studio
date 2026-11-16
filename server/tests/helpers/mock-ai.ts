/**
 * Local HTTP server that speaks the real wire formats of the supported providers so the
 * adapters are exercised end-to-end over HTTP in tests (no real API keys available):
 *   OpenAI-compatible: POST /v1/chat/completions (JSON + SSE), POST /v1/embeddings, GET /v1/models
 *   Anthropic:         POST /v1/messages (JSON + SSE, as consumed by @anthropic-ai/sdk)
 *   Gemini:            POST /v1beta/models/:model:generateContent | :streamGenerateContent | :batchEmbedContents
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: any;
}

type ReplyFn = (req: RecordedRequest) => string;

const DIM = 64;

/** Deterministic bag-of-words embedding: texts sharing words have high cosine similarity. */
export function fakeEmbedding(text: string): number[] {
  const v = new Array(DIM).fill(0);
  for (const word of text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)) {
    let h = 2166136261;
    for (const ch of word) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    v[Math.abs(h) % DIM] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export class MockAIServer {
  private server = http.createServer((req, res) => void this.handle(req, res));
  requests: RecordedRequest[] = [];
  /** Queue of HTTP statuses to fail with before succeeding (e.g. [429] to test retries). */
  failures: { status: number; body?: unknown }[] = [];
  reply: ReplyFn = () => 'This is a mock answer.';
  usage = { input: 120, output: 30 };
  port = 0;

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.port = (this.server.address() as AddressInfo).port;
  }
  async stop(): Promise<void> {
    this.server.closeAllConnections?.();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
  get origin() {
    return `http://127.0.0.1:${this.port}`;
  }
  reset() {
    this.requests = [];
    this.failures = [];
    this.reply = () => 'This is a mock answer.';
  }
  last(pathPart: string): RecordedRequest | undefined {
    return [...this.requests].reverse().find((r) => r.path.includes(pathPart));
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    const url = new URL(req.url ?? '/', this.origin);
    const record: RecordedRequest = {
      method: req.method ?? 'GET',
      path: url.pathname + url.search,
      headers: req.headers,
      body: raw ? JSON.parse(raw) : undefined,
    };
    this.requests.push(record);

    const failure = this.failures.shift();
    if (failure) {
      res.writeHead(failure.status, { 'content-type': 'application/json', 'retry-after': '0' });
      res.end(JSON.stringify(failure.body ?? { error: { message: `mock failure ${failure.status}`, type: 'error' } }));
      return;
    }

    const p = url.pathname;
    if (p.endsWith('/chat/completions')) return this.openaiChat(record, res);
    if (p.endsWith('/embeddings')) return this.openaiEmbeddings(record, res);
    if (p === '/v1/messages') return this.anthropic(record, res);
    if (p.startsWith('/v1beta') && p.endsWith('/models')) {
      return this.json(res, {
        models: [
          {
            name: 'models/gemini-2.5-flash',
            displayName: 'Gemini 2.5 Flash',
            inputTokenLimit: 1048576,
            outputTokenLimit: 65536,
            supportedGenerationMethods: ['generateContent'],
          },
        ],
      });
    }
    if (p.endsWith('/models')) {
      return this.json(res, {
        data: [{ id: 'mock-model-a' }, { id: 'mock-embed', pricing: { prompt: '0.000001', completion: '0.000002' } }],
        has_more: false,
      });
    }
    if (p.includes(':generateContent')) return this.gemini(record, res, false);
    if (p.includes(':streamGenerateContent')) return this.gemini(record, res, true);
    if (p.includes(':batchEmbedContents')) {
      return this.json(res, {
        embeddings: record.body.requests.map((r: any) => ({ values: fakeEmbedding(r.content.parts[0].text) })),
      });
    }
    res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":{"message":"not found"}}');
  }

  private json(res: http.ServerResponse, body: unknown, status = 200) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  private sse(res: http.ServerResponse, events: { event?: string; data: unknown }[]) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    for (const e of events) {
      res.write(`${e.event ? `event: ${e.event}\n` : ''}data: ${typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}\n\n`);
    }
    res.end();
  }

  private pieces(text: string): string[] {
    return text.match(/[\s\S]{1,7}/g) ?? [''];
  }

  private openaiChat(r: RecordedRequest, res: http.ServerResponse) {
    const text = this.reply(r);
    const usage = {
      prompt_tokens: this.usage.input,
      completion_tokens: this.usage.output,
      total_tokens: this.usage.input + this.usage.output,
      ...(r.body.usage?.include ? { cost: 0.00042 } : {}),
    };
    if (!r.body.stream) {
      return this.json(res, {
        id: 'chatcmpl-1',
        model: r.body.model,
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage,
      });
    }
    const events: { data: unknown }[] = this.pieces(text).map((t) => ({
      data: { id: 'c1', model: r.body.model, choices: [{ index: 0, delta: { content: t }, finish_reason: null }] },
    }));
    events.push({ data: { id: 'c1', model: r.body.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] } });
    if (r.body.stream_options?.include_usage || r.body.usage?.include) {
      events.push({ data: { id: 'c1', model: r.body.model, choices: [], usage } });
    }
    events.push({ data: '[DONE]' });
    this.sse(res, events);
  }

  private openaiEmbeddings(r: RecordedRequest, res: http.ServerResponse) {
    const inputs: string[] = Array.isArray(r.body.input) ? r.body.input : [r.body.input];
    this.json(res, {
      data: inputs.map((t, index) => ({ index, embedding: fakeEmbedding(t) })),
      usage: { prompt_tokens: inputs.length * 10 },
    });
  }

  private anthropic(r: RecordedRequest, res: http.ServerResponse) {
    const text = this.reply(r);
    const model = r.body.model;
    const usage = { input_tokens: this.usage.input, output_tokens: this.usage.output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    if (!r.body.stream) {
      return this.json(res, {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model,
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage,
      });
    }
    const events: { event: string; data: unknown }[] = [
      {
        event: 'message_start',
        data: {
          type: 'message_start',
          message: { id: 'msg_1', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 1 } },
        },
      },
      { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
      ...this.pieces(text).map((t) => ({
        event: 'content_block_delta',
        data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
      })),
      { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
      {
        event: 'message_delta',
        data: { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: this.usage.output } },
      },
      { event: 'message_stop', data: { type: 'message_stop' } },
    ];
    this.sse(res, events);
  }

  private gemini(r: RecordedRequest, res: http.ServerResponse, stream: boolean) {
    const text = this.reply(r);
    const usageMetadata = {
      promptTokenCount: this.usage.input,
      candidatesTokenCount: this.usage.output,
      totalTokenCount: this.usage.input + this.usage.output,
    };
    if (!stream) {
      return this.json(res, {
        candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }],
        usageMetadata,
        modelVersion: 'gemini-2.5-flash',
      });
    }
    const parts = this.pieces(text);
    this.sse(
      res,
      parts.map((t, i) => ({
        data: {
          candidates: [{ content: { role: 'model', parts: [{ text: t }] }, ...(i === parts.length - 1 ? { finishReason: 'STOP' } : {}) }],
          ...(i === parts.length - 1 ? { usageMetadata } : {}),
          modelVersion: 'gemini-2.5-flash',
        },
      })),
    );
  }
}

/** System prompt text as received by each provider (for assertions). */
export function systemPromptOf(r: RecordedRequest): string {
  if (r.path.startsWith('/v1/messages')) return (r.body.system ?? []).map((b: any) => b.text).join('\n');
  if (r.path.includes('/v1beta/')) return r.body.systemInstruction?.parts?.[0]?.text ?? '';
  return r.body.messages?.find((m: any) => m.role === 'system')?.content ?? '';
}
