import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Conversation } from '../src/models/Conversation.js';
import { Message } from '../src/models/Message.js';
import { auth, clearDatabase, createChatbot, mockAi, parseSSEText, registerUser, SAMPLE_PRODUCTS, startContext, type TestContext } from './helpers/context.js';
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

async function bot(extra: Record<string, unknown> = {}) {
  const { token } = await registerUser(ctx.api);
  const chatbot = await createChatbot(ctx.api, token, { ai: mockAi(ctx.mock), ...extra });
  return { token, chatbot };
}

describe('widget configuration', () => {
  it('serves public config for active chatbots only', async () => {
    const { token, chatbot } = await bot({ welcomeMessage: 'Hello shopper!', widget: { primaryColor: '#123456', suggestedQuestions: ['Do you ship?'] } });
    const res = await ctx.api.get(`/api/widget/config/${chatbot.publicId}`).set('Origin', 'https://any-site.com');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://any-site.com');
    expect(res.body.config).toMatchObject({
      publicId: chatbot.publicId,
      welcomeMessage: 'Hello shopper!',
      widget: { primaryColor: '#123456', suggestedQuestions: ['Do you ship?'] },
      limits: { maxProducts: 20 },
    });
    await ctx.api.patch(`/api/chatbots/${chatbot.id}/status`).set(auth(token)).send({ status: 'inactive' });
    expect((await ctx.api.get(`/api/widget/config/${chatbot.publicId}`)).status).toBe(404);
    expect((await ctx.api.get('/api/widget/config/cb_doesnotexist000000000')).status).toBe(404);
    expect((await ctx.api.get('/api/widget/config/..%2F..%2Fetc')).status).toBe(404);
  });

  it('enforces allowed domains via Origin/Referer when enabled', async () => {
    const { chatbot } = await bot({ domainRestrictionEnabled: true, allowedDomains: ['shop.example.com', '*.brand.io', 'localhost:3000'] });
    const cfg = (origin?: string) => {
      const r = ctx.api.get(`/api/widget/config/${chatbot.publicId}`);
      return origin ? r.set('Origin', origin) : r;
    };
    expect((await cfg('https://shop.example.com')).status).toBe(200);
    expect((await cfg('https://www.shop.example.com')).status).toBe(200);
    expect((await cfg('https://eu.brand.io')).status).toBe(200);
    expect((await cfg('http://localhost:3000')).status).toBe(200);
    expect((await cfg('http://localhost:4000')).status).toBe(403);
    expect((await cfg('https://evil.com')).status).toBe(403);
    expect((await cfg('https://shop.example.com.evil.com')).status).toBe(403);
    expect((await cfg()).status).toBe(403);
    const chat = await ctx.api.post('/api/widget/chat').set('Origin', 'https://evil.com').send({ chatbotId: chatbot.publicId, visitorId: 'visitor_evil1', message: 'hi' });
    expect(chat.status).toBe(403);
    expect(ctx.mock.requests).toHaveLength(0); // no AI spend for blocked origins
  });
});

describe('widget chat', () => {
  it('streams tokens over SSE and stores the conversation with usage', async () => {
    const { chatbot } = await bot();
    ctx.mock.reply = () => 'Streaming works great!';
    const res = await ctx.api.post('/api/widget/chat').send({ chatbotId: chatbot.publicId, visitorId: 'visitor_stream1', message: 'Hello', stream: true });
    expect(res.headers['content-type']).toContain('text/event-stream');
    const events = parseSSEText(res.text);
    expect(events[0]).toMatchObject({ event: 'start', data: { conversationId: expect.stringMatching(/^conv_/) } });
    const deltas = events.filter((e) => e.event === 'delta').map((e) => e.data.text);
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.join('')).toBe('Streaming works great!');
    expect(events.at(-1)).toMatchObject({ event: 'done', data: { content: 'Streaming works great!' } });

    const assistant = await Message.findOne({ role: 'assistant' }).lean();
    expect(assistant!.tokenUsage).toMatchObject({ inputTokens: 120, outputTokens: 30, totalTokens: 150 });
    expect(assistant!.metadata).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini', streamed: true });
  });

  it('keeps independent conversations per visitor and sends history on follow-ups', async () => {
    const { chatbot } = await bot();
    ctx.mock.reply = () => 'Nice to meet you, Sam.';
    const first = await ctx.api.post('/api/widget/chat').send({ chatbotId: chatbot.publicId, visitorId: 'visitor_sam001', message: 'My name is Sam' });
    ctx.mock.reply = () => 'Your name is Sam.';
    const second = await ctx.api
      .post('/api/widget/chat')
      .send({ chatbotId: chatbot.publicId, visitorId: 'visitor_sam001', conversationId: first.body.conversationId, message: 'What is my name?' });
    expect(second.body.conversationId).toBe(first.body.conversationId);
    const sent = ctx.mock.last('/chat/completions')!.body.messages.filter((m: any) => m.role !== 'system');
    expect(sent.map((m: any) => m.content)).toEqual(['My name is Sam', 'Nice to meet you, Sam.', 'What is my name?']);

    // Another visitor cannot continue (or read) Sam's conversation.
    const other = await ctx.api
      .post('/api/widget/chat')
      .send({ chatbotId: chatbot.publicId, visitorId: 'visitor_eve001', conversationId: first.body.conversationId, message: 'What is my name?' });
    expect(other.body.conversationId).not.toBe(first.body.conversationId);
    const history = await ctx.api.get(`/api/widget/conversations/${first.body.conversationId}?chatbotId=${chatbot.publicId}&visitorId=visitor_eve001`);
    expect(history.status).toBe(404);
    const own = await ctx.api.get(`/api/widget/conversations/${first.body.conversationId}?chatbotId=${chatbot.publicId}&visitorId=visitor_sam001`);
    expect(own.body.messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(JSON.stringify(own.body)).not.toContain('metadata');
    expect(await Conversation.countDocuments({})).toBe(2);
  });

  it('returns a generic error to visitors while recording details for the owner', async () => {
    const { token, chatbot } = await bot();
    ctx.mock.failures = [{ status: 401, body: { error: { message: 'Invalid key sk-should-not-leak-123456' } } }];
    const res = await ctx.api.post('/api/widget/chat').send({ chatbotId: chatbot.publicId, visitorId: 'visitor_err001', message: 'Hello' });
    expect(res.status).toBe(200);
    expect(res.body.error).toEqual({ code: 'auth' });
    expect(res.body.content).toMatch(/trouble answering/);
    expect(JSON.stringify(res.body)).not.toContain('sk-should-not-leak');
    const conv = await ctx.api.get(`/api/conversations?chatbotId=${chatbot.id}`).set(auth(token));
    const detail = await ctx.api.get(`/api/conversations/${conv.body.items[0].id}`).set(auth(token));
    const failed = detail.body.messages.find((m: any) => m.role === 'assistant');
    expect(failed.metadata.error.code).toBe('auth');
    expect(failed.metadata.error.message).not.toContain('sk-should-not-leak');
  });

  it('validates input and rejects oversized messages', async () => {
    const { chatbot } = await bot();
    expect((await ctx.api.post('/api/widget/chat').send({ chatbotId: chatbot.publicId, visitorId: 'visitor_val001', message: '' })).status).toBe(400);
    expect((await ctx.api.post('/api/widget/chat').send({ chatbotId: chatbot.publicId, visitorId: 'bad id!', message: 'hi' })).status).toBe(400);
    expect((await ctx.api.post('/api/widget/chat').send({ chatbotId: chatbot.publicId, visitorId: 'visitor_val001', message: 'x'.repeat(2001) })).status).toBe(400);
  });
});

describe('page-provided products (method B: embed configuration)', () => {
  it('uses page products as clearly-labelled unverified context', async () => {
    const { chatbot } = await bot();
    const products = [{ id: 'PAGE-1', name: 'Bamboo Toothbrush', price: 149, currency: 'INR', availability: 'In Stock' }];
    await ctx.api.post('/api/widget/chat').send({ chatbotId: chatbot.publicId, visitorId: 'visitor_page01', message: 'How much is the toothbrush?', products });
    const prompt = systemPromptOf(ctx.mock.last('/chat/completions')!);
    expect(prompt).toContain('<page_provided_products source="web page the visitor is viewing — unverified">');
    expect(prompt).toContain('"id":"PAGE-1","name":"Bamboo Toothbrush","price":149');
    const msg = await Message.findOne({ role: 'assistant' }).lean();
    expect(msg!.metadata!.browserProductIds).toEqual(['PAGE-1']);
  });

  it('works together with dashboard products; verified records win conflicts', async () => {
    const { token, chatbot } = await bot();
    await ctx.api.post(`/api/chatbots/${chatbot.id}/products/import`).set(auth(token)).attach('file', Buffer.from(JSON.stringify(SAMPLE_PRODUCTS)), 'p.json');
    const page = [
      { id: 'P001', name: 'Wireless Headphones', price: 99, currency: 'INR' }, // tampered price
      { id: 'PAGE-9', name: 'Headphone Stand', price: 599, currency: 'INR' },
    ];
    await ctx.api.post('/api/widget/chat').send({ chatbotId: chatbot.publicId, visitorId: 'visitor_mix001', message: 'Tell me about headphones', products: page });
    const prompt = systemPromptOf(ctx.mock.last('/chat/completions')!);
    expect(prompt).toContain('"id":"P001","name":"Wireless Headphones","price":2499');
    expect(prompt).not.toContain('"price":99,');
    expect(prompt).toContain('page shows price 99, verified record says 2499');
    expect(prompt).toContain('"id":"PAGE-9"');
  });

  it('enforces limits, drops invalid entries and honours the per-chatbot switch', async () => {
    const { token, chatbot } = await bot();
    const tooMany = Array.from({ length: 21 }, (_, i) => ({ id: `T${i}`, name: `Item ${i}`, price: i }));
    const res = await ctx.api.post('/api/widget/chat').send({ chatbotId: chatbot.publicId, visitorId: 'visitor_lim001', message: 'hi', products: tooMany });
    expect(res.status).toBe(413);
    const huge = [{ id: 'BIG', name: 'Big', description: 'x'.repeat(20_000) }];
    expect((await ctx.api.post('/api/widget/chat').send({ chatbotId: chatbot.publicId, visitorId: 'visitor_lim001', message: 'hi', products: huge })).status).toBe(413);

    const mixed = [{ name: '' }, 'string', { id: 'OK1', name: 'Valid Item', price: 10, url: 'javascript:alert(1)' }];
    await ctx.api.post('/api/widget/chat').send({ chatbotId: chatbot.publicId, visitorId: 'visitor_lim001', message: 'Do you have the valid item?', products: mixed });
    const prompt = systemPromptOf(ctx.mock.last('/chat/completions')!);
    expect(prompt).toContain('"id":"OK1"');
    expect(prompt).not.toContain('javascript:');

    await ctx.api.put(`/api/chatbots/${chatbot.id}`).set(auth(token)).send({ productSettings: { allowBrowserProducts: false } });
    await ctx.api.post('/api/widget/chat').send({ chatbotId: chatbot.publicId, visitorId: 'visitor_lim001', message: 'Do you have the valid item?', products: mixed });
    expect(systemPromptOf(ctx.mock.last('/chat/completions')!)).not.toContain('page_provided_products source');
  });
});

describe('embed snippet and static assets', () => {
  it('generates snippets without secrets and serves a framework-free test page', async () => {
    const { token, chatbot } = await bot();
    const embed = await ctx.api.get(`/api/chatbots/${chatbot.id}/embed`).set(auth(token));
    expect(embed.body.snippets.basic).toContain(`chatbotId: "${chatbot.publicId}"`);
    expect(embed.body.snippets.basic).toContain('/widget.js');
    expect(JSON.stringify(embed.body)).not.toContain('test-key-openai');
    const page = await ctx.api.get(`/embed-test/${chatbot.publicId}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('<script src="/widget.js" async></script>');
    expect(page.text).not.toMatch(/react/i);
    expect(page.headers['content-security-policy']).toMatch(/script-src 'self' http:\/\/localhost:4999 'nonce-[A-Za-z0-9+/=]+'/);
  });
});
