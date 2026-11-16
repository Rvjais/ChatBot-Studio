import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { GenerateRequest, StreamEvent } from '../src/services/ai/ai-provider.interface.js';
import { getProvider } from '../src/services/ai/ai-provider.factory.js';
import { computeCost } from '../src/services/ai/ai.service.js';
import { AIProviderError } from '../src/services/ai/errors.js';
import { auth, clearDatabase, createChatbot, mockAi, parseSSEText, registerUser, startContext, type TestContext } from './helpers/context.js';
import { systemPromptOf } from './helpers/mock-ai.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startContext();
});
afterAll(async () => ctx.stop());
beforeEach(async () => {
  await clearDatabase();
  ctx.mock.reset();
});

function request(over: Partial<GenerateRequest> & Pick<GenerateRequest, 'model' | 'credentials'>): GenerateRequest {
  return {
    system: 'You are a test assistant.',
    messages: [{ role: 'user', content: 'Hello there' }],
    params: { maxOutputTokens: 256, temperature: 0.3, topP: 0.9 },
    ...over,
  };
}

async function collect(gen: AsyncGenerator<StreamEvent>) {
  let text = '';
  let done: Extract<StreamEvent, { type: 'done' }>['result'] | undefined;
  for await (const e of gen) {
    if (e.type === 'delta') text += e.text;
    if (e.type === 'done') done = e.result;
  }
  return { text, done: done! };
}

describe('provider adapters (real HTTP against wire-format mock)', () => {
  it('OpenAI: generate + stream with usage, system message and max_completion_tokens', async () => {
    ctx.mock.reply = () => 'Hello from OpenAI format';
    const p = getProvider('openai');
    const creds = { apiKey: 'sk-test-openai-123456', baseUrl: `${ctx.mock.origin}/v1` };
    const res = await p.generate(request({ model: 'gpt-4o-mini', credentials: creds }));
    expect(res).toMatchObject({ text: 'Hello from OpenAI format', usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 } });
    const sent = ctx.mock.last('/chat/completions')!;
    expect(sent.headers.authorization).toBe('Bearer sk-test-openai-123456');
    expect(sent.body.messages[0]).toEqual({ role: 'system', content: 'You are a test assistant.' });
    expect(sent.body.max_completion_tokens).toBe(256);
    expect(sent.body.temperature).toBe(0.3);

    const streamed = await collect(p.stream(request({ model: 'gpt-4o-mini', credentials: creds })));
    expect(streamed.text).toBe('Hello from OpenAI format');
    expect(streamed.done.usage?.totalTokens).toBe(150);
    expect(ctx.mock.last('/chat/completions')!.body.stream_options).toEqual({ include_usage: true });
  });

  it('Anthropic (official SDK): system blocks, no sampling params, effort, streaming and usage', async () => {
    ctx.mock.reply = () => 'Hello from Claude format';
    const p = getProvider('anthropic');
    const creds = { apiKey: 'sk-ant-test-123456789', baseUrl: ctx.mock.origin };
    const req = request({
      model: 'claude-opus-5-5',
      credentials: creds,
      systemParts: { stable: 'Stable rules', dynamic: 'Retrieved context' },
      params: { maxOutputTokens: 512, temperature: 0.9, effort: 'low' },
      options: { refusalFallback: true },
    });
    const res = await p.generate(req);
    expect(res.text).toBe('Hello from Claude format');
    expect(res.usage).toMatchObject({ inputTokens: 120, outputTokens: 30 });
    const sent = ctx.mock.last('/v1/messages')!;
    expect(sent.headers['x-api-key'] ?? sent.headers.authorization).toBeTruthy();
    expect(sent.body.system).toEqual([
      { type: 'text', text: 'Stable rules', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'Retrieved context' },
    ]);
    expect(sent.body.temperature).toBeUndefined();
    expect(sent.body.top_p).toBeUndefined();
    expect(sent.body.output_config).toEqual({ effort: 'low' });
    expect(sent.body.fallbacks).toBe('default');
    expect(String(sent.headers['anthropic-beta'])).toContain('server-side-fallback-2026-07-01');

    const streamed = await collect(p.stream({ ...req, options: { refusalFallback: false } }));
    expect(streamed.text).toBe('Hello from Claude format');
    expect(streamed.done.usage?.outputTokens).toBe(30);
    expect(ctx.mock.last('/v1/messages')!.body.fallbacks).toBeUndefined();
  });

  it('Gemini: systemInstruction, model role mapping, SSE streaming, embeddings', async () => {
    ctx.mock.reply = () => 'Hello from Gemini format';
    const p = getProvider('gemini');
    const creds = { apiKey: 'AIzaTestKey1234567890123', baseUrl: `${ctx.mock.origin}/v1beta` };
    const req = request({
      model: 'gemini-2.5-flash',
      credentials: creds,
      messages: [
        { role: 'user', content: 'Q1' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'Q2' },
      ],
    });
    const res = await p.generate(req);
    expect(res.text).toBe('Hello from Gemini format');
    const sent = ctx.mock.last(':generateContent')!;
    expect(sent.headers['x-goog-api-key']).toBe('AIzaTestKey1234567890123');
    expect(sent.body.systemInstruction.parts[0].text).toBe('You are a test assistant.');
    expect(sent.body.contents.map((c: any) => c.role)).toEqual(['user', 'model', 'user']);
    expect(sent.body.generationConfig).toMatchObject({ maxOutputTokens: 256, temperature: 0.3, topP: 0.9 });

    const streamed = await collect(p.stream(req));
    expect(streamed.text).toBe('Hello from Gemini format');
    expect(streamed.done.usage).toMatchObject({ inputTokens: 120, outputTokens: 30 });

    const emb = await p.embed!({ model: 'gemini-embedding-001', inputs: ['a', 'b'], credentials: creds, purpose: 'document' });
    expect(emb.vectors).toHaveLength(2);
  });

  it('OpenRouter: reports provider cost from usage accounting', async () => {
    const p = getProvider('openrouter');
    // OpenRouter's base URL is fixed; route it to the mock by overriding fetch target via a custom-like call.
    const res = await (p as any).generate.call(
      Object.assign(Object.create(Object.getPrototypeOf(p)), { defaultBaseUrl: `${ctx.mock.origin}/v1` }),
      request({ model: 'openai/gpt-4o-mini', credentials: { apiKey: 'or-key-123456789' } }),
    );
    expect(res.providerCostUsd).toBe(0.00042);
    expect(ctx.mock.last('/chat/completions')!.body.usage).toEqual({ include: true });
    expect(computeCost('openrouter', 'openai/gpt-4o-mini', res.usage, null, res.providerCostUsd)).toEqual({ costUsd: 0.00042, costSource: 'provider' });
  });

  it('Custom provider: configurable auth header, prefix and extra headers', async () => {
    const p = getProvider('custom');
    await p.generate(
      request({
        model: 'local-model',
        credentials: { apiKey: 'custom-secret-123', baseUrl: `${ctx.mock.origin}/v1`, authHeader: 'X-Api-Token', authPrefix: '', extraHeaders: { 'X-Tenant': 'acme' } },
      }),
    );
    const sent = ctx.mock.last('/chat/completions')!;
    expect(sent.headers['x-api-token']).toBe('custom-secret-123');
    expect(sent.headers['x-tenant']).toBe('acme');
    expect(sent.headers.authorization).toBeUndefined();
    expect(sent.body.max_tokens).toBe(256);
  });

  it('retries on 429/5xx, then succeeds', async () => {
    ctx.mock.failures = [{ status: 429 }, { status: 503 }];
    const res = await getProvider('deepseek').generate(request({ model: 'deepseek-chat', credentials: { apiKey: 'ds-key-12345678', baseUrl: `${ctx.mock.origin}/v1` } }));
    expect(res.text).toBe('This is a mock answer.');
    expect(ctx.mock.requests.filter((r) => r.path.includes('/chat/completions'))).toHaveLength(3);
  });

  it('maps provider errors to normalized codes and redacts keys', async () => {
    ctx.mock.failures = [{ status: 401, body: { error: { message: 'Incorrect API key provided: sk-live-ABCDEFGHIJKLMNOP' } } }];
    const err = await getProvider('openai')
      .generate(request({ model: 'gpt-4o-mini', credentials: { apiKey: 'sk-live-ABCDEFGHIJKLMNOP', baseUrl: `${ctx.mock.origin}/v1` } }))
      .catch((e) => e);
    expect(err).toBeInstanceOf(AIProviderError);
    expect(err.code).toBe('auth');
    expect(err.message).not.toContain('ABCDEFGHIJKLMNOP');

    ctx.mock.failures = [{ status: 404, body: { type: 'error', error: { type: 'not_found_error', message: 'model: nope' } } }];
    const err2 = await getProvider('anthropic')
      .generate(request({ model: 'nope', credentials: { apiKey: 'sk-ant-xyz-1234567', baseUrl: ctx.mock.origin } }))
      .catch((e) => e);
    expect(err2).toBeInstanceOf(AIProviderError);
    expect(err2.code).toBe('not_found');
  });

  it('retries without sampling parameters when a model rejects them', async () => {
    ctx.mock.failures = [{ status: 400, body: { error: { message: "Unsupported parameter: 'temperature' is not supported with this model." } } }];
    const res = await getProvider('openai').generate(
      request({ model: 'some-reasoning-model', credentials: { apiKey: 'sk-test-12345678', baseUrl: `${ctx.mock.origin}/v1` } }),
    );
    expect(res.text).toBe('This is a mock answer.');
    expect(ctx.mock.last('/chat/completions')!.body.temperature).toBeUndefined();
  });
});

describe('AI configuration endpoints', () => {
  it('test-provider reports success and persists the result; failures are reported, not thrown', async () => {
    const { token } = await registerUser(ctx.api);
    const bot = await createChatbot(ctx.api, token, { ai: mockAi(ctx.mock, 'anthropic') });
    const ok = await ctx.api.post(`/api/chatbots/${bot.id}/test-provider`).set(auth(token)).send({ target: 'chat' });
    expect(ok.body).toMatchObject({ ok: true });
    const after = await ctx.api.get(`/api/chatbots/${bot.id}`).set(auth(token));
    expect(after.body.chatbot.ai.lastTest.status).toBe('success');

    ctx.mock.failures = [{ status: 401 }];
    const bad = await ctx.api.post(`/api/chatbots/${bot.id}/test-provider`).set(auth(token)).send({ target: 'chat' });
    expect(bad.body.ok).toBe(false);
    expect(bad.body.message).toMatch(/API key/i);

    const noKey = await createChatbot(ctx.api, token, { name: 'No key' });
    const res = await ctx.api.post(`/api/chatbots/${noKey.id}/test-provider`).set(auth(token)).send({ target: 'chat' });
    expect(res.body).toMatchObject({ ok: false });
    expect(res.body.message).toMatch(/No API key/);
  });

  it('can test an unsaved override without persisting it', async () => {
    const { token } = await registerUser(ctx.api);
    const bot = await createChatbot(ctx.api, token);
    const res = await ctx.api.post(`/api/chatbots/${bot.id}/test-provider`).set(auth(token)).send({ target: 'chat', override: mockAi(ctx.mock, 'gemini') });
    expect(res.body.ok).toBe(true);
    const after = await ctx.api.get(`/api/chatbots/${bot.id}`).set(auth(token));
    expect(after.body.chatbot.ai.provider).toBe('openai');
    expect(after.body.chatbot.ai.hasApiKey).toBe(false);
  });

  it('lists live models from the provider and catalog providers/models', async () => {
    const { token } = await registerUser(ctx.api);
    const bot = await createChatbot(ctx.api, token, { ai: mockAi(ctx.mock, 'openai') });
    const live = await ctx.api.post(`/api/chatbots/${bot.id}/models`).set(auth(token)).send({});
    expect(live.status).toBe(200);
    expect(live.body.models.map((m: any) => m.id)).toContain('mock-model-a');
    const providers = await ctx.api.get('/api/ai/providers').set(auth(token));
    expect(providers.body.providers.map((p: any) => p.id)).toEqual(['openai', 'deepseek', 'anthropic', 'gemini', 'openrouter', 'custom']);
    const models = await ctx.api.get('/api/ai/models?provider=anthropic').set(auth(token));
    expect(models.body.models[0].id).toBe('claude-opus-5-5');
  });

  it('each chatbot uses its own provider and model in chat (OpenAI, Anthropic and Gemini)', async () => {
    const { token } = await registerUser(ctx.api);
    for (const provider of ['openai', 'anthropic', 'gemini'] as const) {
      ctx.mock.reply = () => `answer via ${provider}`;
      const bot = await createChatbot(ctx.api, token, { name: provider, systemPrompt: `You are the ${provider} bot.`, ai: mockAi(ctx.mock, provider) });
      const res = await ctx.api.post('/api/widget/chat').send({ chatbotId: bot.publicId, visitorId: 'visitor_multi1', message: 'Hi', stream: true });
      const events = parseSSEText(res.text);
      expect(events.at(-1)).toMatchObject({ event: 'done', data: { content: `answer via ${provider}` } });
      const last = ctx.mock.requests.at(-1)!;
      expect(systemPromptOf(last)).toContain(`You are the ${provider} bot.`);
    }
  });
});
