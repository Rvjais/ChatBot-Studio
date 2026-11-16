import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Chatbot } from '../src/models/Chatbot.js';
import { Product } from '../src/models/Product.js';
import { auth, clearDatabase, createChatbot, mockAi, registerUser, SAMPLE_PRODUCTS, startContext, type TestContext } from './helpers/context.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startContext();
});
afterAll(async () => ctx.stop());
beforeEach(async () => {
  await clearDatabase();
  ctx.mock.reset();
});

describe('product sync API (large catalogs)', () => {
  it('requires a valid per-chatbot sync key and stores only its hash', async () => {
    const { token } = await registerUser(ctx.api);
    const bot = await createChatbot(ctx.api, token);
    const keyRes = await ctx.api.post(`/api/chatbots/${bot.id}/sync-key`).set(auth(token));
    const key: string = keyRes.body.key;
    expect(key).toMatch(new RegExp(`^cbsk_${bot.id}_`));
    const stored = await Chatbot.findById(bot.id).select('+syncKey.hash').lean();
    expect(stored!.syncKey!.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(key);
    expect((await ctx.api.get(`/api/chatbots/${bot.id}`).set(auth(token))).body.chatbot.syncKey.prefix).toMatch(/^cbsk_…/);

    expect((await ctx.api.post('/api/v1/sync/products').send({ products: SAMPLE_PRODUCTS })).status).toBe(401);
    const wrong = key.slice(0, -3) + 'xyz';
    expect((await ctx.api.post('/api/v1/sync/products').set('Authorization', `Bearer ${wrong}`).send({ products: SAMPLE_PRODUCTS })).status).toBe(401);

    const ok = await ctx.api.post('/api/v1/sync/products').set('Authorization', `Bearer ${key}`).send({ products: SAMPLE_PRODUCTS });
    expect(ok.body.report).toMatchObject({ inserted: 3 });
    expect(await Product.countDocuments({ chatbotId: bot.id, source: 'sync' })).toBe(3);

    const replace = await ctx.api.post('/api/v1/sync/products').set('Authorization', `Bearer ${key}`).send({ mode: 'replace', products: [SAMPLE_PRODUCTS[0]] });
    expect(replace.body.report.removed).toBe(2);
    expect((await ctx.api.delete('/api/v1/sync/products/P001').set('Authorization', `Bearer ${key}`)).status).toBe(204);

    await ctx.api.delete(`/api/chatbots/${bot.id}/sync-key`).set(auth(token));
    expect((await ctx.api.get('/api/v1/sync/products').set('Authorization', `Bearer ${key}`)).status).toBe(401);
  });

  it('a sync key only grants access to its own chatbot', async () => {
    const { token } = await registerUser(ctx.api);
    const a = await createChatbot(ctx.api, token, { name: 'A' });
    const b = await createChatbot(ctx.api, token, { name: 'B' });
    const keyA: string = (await ctx.api.post(`/api/chatbots/${a.id}/sync-key`).set(auth(token))).body.key;
    const forged = keyA.replace(a.id, b.id);
    expect((await ctx.api.post('/api/v1/sync/products').set('Authorization', `Bearer ${forged}`).send({ products: SAMPLE_PRODUCTS })).status).toBe(401);
    expect(await Product.countDocuments({ chatbotId: b.id })).toBe(0);
  });
});

describe('conversations', () => {
  it('lists, searches, filters, opens and deletes conversations', async () => {
    const { token } = await registerUser(ctx.api);
    const a = await createChatbot(ctx.api, token, { name: 'Alpha', ai: mockAi(ctx.mock) });
    const b = await createChatbot(ctx.api, token, { name: 'Beta', ai: mockAi(ctx.mock) });
    await ctx.api.post('/api/widget/chat').send({ chatbotId: a.publicId, visitorId: 'visitor_one001', message: 'Where is my parcel?' });
    await ctx.api.post('/api/widget/chat').send({ chatbotId: b.publicId, visitorId: 'visitor_two002', message: 'Opening hours please' });
    await ctx.api.post(`/api/chatbots/${a.id}/preview-chat`).set(auth(token)).send({ message: 'owner test' });

    const all = await ctx.api.get('/api/conversations').set(auth(token));
    expect(all.body.total).toBe(3);
    const widgetOnly = await ctx.api.get('/api/conversations?channel=widget').set(auth(token));
    expect(widgetOnly.body.total).toBe(2);
    const byBot = await ctx.api.get(`/api/conversations?chatbotId=${b.id}`).set(auth(token));
    expect(byBot.body.items.map((c: any) => c.chatbotName)).toEqual(['Beta']);
    const search = await ctx.api.get('/api/conversations?q=parcel').set(auth(token));
    expect(search.body.items).toHaveLength(1);
    expect(search.body.items[0]).toMatchObject({ chatbotName: 'Alpha', visitorId: 'visitor_one001', messageCount: 2 });

    const detail = await ctx.api.get(`/api/conversations/${search.body.items[0].id}`).set(auth(token));
    expect(detail.body.messages.map((m: any) => m.role)).toEqual(['user', 'assistant']);
    expect(detail.body.messages[1].metadata).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini' });

    expect((await ctx.api.delete(`/api/conversations/${search.body.items[0].id}`).set(auth(token))).status).toBe(204);
    expect((await ctx.api.get('/api/conversations').set(auth(token))).body.total).toBe(2);
  });
});

describe('analytics', () => {
  it('reports real usage, catalog-priced cost, top questions and daily counts', async () => {
    const { token } = await registerUser(ctx.api);
    const bot = await createChatbot(ctx.api, token, { ai: mockAi(ctx.mock, 'anthropic') }); // claude-opus-5-5: $4 / $20 per 1M
    for (const [visitor, q] of [
      ['visitor_aaa001', 'Do you ship to Pune?'],
      ['visitor_bbb002', 'do you ship to pune'],
      ['visitor_ccc003', 'What are your hours?'],
    ]) {
      await ctx.api.post('/api/widget/chat').send({ chatbotId: bot.publicId, visitorId: visitor, message: q });
    }
    const res = await ctx.api.get(`/api/analytics/chatbots/${bot.id}?days=7`).set(auth(token));
    expect(res.body.totals).toMatchObject({ conversations: 3, messages: 6, avgMessagesPerConversation: 2 });
    expect(res.body.dailyConversations).toHaveLength(7);
    expect(res.body.dailyConversations.at(-1).count).toBe(3);
    expect(res.body.topQuestions[0]).toMatchObject({ count: 2 });
    const usage = res.body.providerUsage[0];
    expect(usage).toMatchObject({ provider: 'anthropic', model: 'claude-opus-5-5', messages: 3, inputTokens: 360, outputTokens: 90, messagesWithCost: 3 });
    // 3 × (120 × $4 + 30 × $20) / 1M = $0.00324
    expect(usage.costUsd).toBeCloseTo(0.00324, 8);

    const overview = await ctx.api.get('/api/analytics/overview').set(auth(token));
    expect(overview.body.totals).toMatchObject({ chatbots: 1, activeChatbots: 1, conversations: 3, messages: 6, configuredChatbots: 1 });
    expect(overview.body.recentActivity).toHaveLength(3);
    expect(overview.body.providerStatus[0]).toMatchObject({ provider: 'anthropic', configured: true });
  });

  it('never invents a cost when pricing is unknown; uses owner pricing when set', async () => {
    const { token } = await registerUser(ctx.api);
    const bot = await createChatbot(ctx.api, token, { ai: { ...mockAi(ctx.mock, 'custom'), model: 'my-local-llm' } });
    await ctx.api.post('/api/widget/chat').send({ chatbotId: bot.publicId, visitorId: 'visitor_cost01', message: 'hello' });
    let res = await ctx.api.get(`/api/analytics/chatbots/${bot.id}`).set(auth(token));
    expect(res.body.providerUsage[0].costUsd).toBeNull();
    expect(res.body.usage).toMatchObject({ costUsd: null, messagesWithCost: 0, messagesWithoutCost: 1, inputTokens: 120 });

    await ctx.api.put(`/api/chatbots/${bot.id}/ai-config`).set(auth(token)).send({ pricing: { inputPerMillion: 1, outputPerMillion: 2 } });
    await ctx.api.post('/api/widget/chat').send({ chatbotId: bot.publicId, visitorId: 'visitor_cost01', message: 'hello again' });
    res = await ctx.api.get(`/api/analytics/chatbots/${bot.id}`).set(auth(token));
    expect(res.body.usage.costUsd).toBeCloseTo((120 * 1 + 30 * 2) / 1_000_000, 10);
    expect(res.body.usage.messagesWithoutCost).toBe(1);
  });

  it('excludes dashboard test chats from visitor counts but counts their token spend', async () => {
    const { token } = await registerUser(ctx.api);
    const bot = await createChatbot(ctx.api, token, { ai: mockAi(ctx.mock) });
    await ctx.api.post(`/api/chatbots/${bot.id}/preview-chat`).set(auth(token)).send({ message: 'test' });
    const res = await ctx.api.get(`/api/analytics/chatbots/${bot.id}`).set(auth(token));
    expect(res.body.totals.conversations).toBe(0);
    expect(res.body.totals.messages).toBe(0);
    expect(res.body.usage.inputTokens).toBe(120);
  });
});
