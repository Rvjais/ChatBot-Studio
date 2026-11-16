import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Chatbot } from '../src/models/Chatbot.js';
import { Conversation } from '../src/models/Conversation.js';
import { KnowledgeChunk } from '../src/models/KnowledgeChunk.js';
import { Product } from '../src/models/Product.js';
import { decryptSecret } from '../src/utils/crypto.js';
import {
  auth,
  clearDatabase,
  createChatbot,
  mockAi,
  processAllFiles,
  registerUser,
  SAMPLE_PRODUCTS,
  startContext,
  type TestContext,
} from './helpers/context.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startContext();
});
afterAll(async () => ctx.stop());
beforeEach(async () => {
  await clearDatabase();
  ctx.mock.reset();
});

describe('chatbot management', () => {
  it('creates a chatbot with defaults, a unique public id and identifier', async () => {
    const { token } = await registerUser(ctx.api);
    const a = await createChatbot(ctx.api, token, { name: 'Support Bot' });
    const b = await createChatbot(ctx.api, token, { name: 'Support Bot' });
    expect(a.publicId).toMatch(/^cb_[A-Za-z0-9]{20}$/);
    expect(a.publicId).not.toBe(b.publicId);
    expect(a.identifier).toBe('support-bot');
    expect(b.identifier).toBe('support-bot-2');
    expect(a.status).toBe('active');
    expect(a.widget.title).toBe('Support Bot');
  });

  it('lists, searches and filters only the owner’s chatbots', async () => {
    const { token } = await registerUser(ctx.api);
    await createChatbot(ctx.api, token, { name: 'Shoe Store Assistant', ai: { provider: 'anthropic', model: 'claude-opus-5-5' } });
    await createChatbot(ctx.api, token, { name: 'HR Helper', status: 'inactive' });
    const all = await ctx.api.get('/api/chatbots').set(auth(token));
    expect(all.body.total).toBe(2);
    expect(all.body.items[0].stats).toMatchObject({ conversations: 0, knowledgeFiles: 0, products: 0 });
    const search = await ctx.api.get('/api/chatbots?q=shoe').set(auth(token));
    expect(search.body.items.map((c: any) => c.name)).toEqual(['Shoe Store Assistant']);
    const inactive = await ctx.api.get('/api/chatbots?status=inactive').set(auth(token));
    expect(inactive.body.items.map((c: any) => c.name)).toEqual(['HR Helper']);
    const anthropic = await ctx.api.get('/api/chatbots?provider=anthropic').set(auth(token));
    expect(anthropic.body.total).toBe(1);
  });

  it('updates settings independently per chatbot and merges nested objects', async () => {
    const { token } = await registerUser(ctx.api);
    const a = await createChatbot(ctx.api, token, { name: 'A', systemPrompt: 'Prompt A' });
    const b = await createChatbot(ctx.api, token, { name: 'B', systemPrompt: 'Prompt B' });
    const res = await ctx.api
      .put(`/api/chatbots/${a.id}`)
      .set(auth(token))
      .send({ systemPrompt: 'Updated A', widget: { primaryColor: '#ff0000' }, personality: { tones: ['technical'] } });
    expect(res.status).toBe(200);
    expect(res.body.chatbot.systemPrompt).toBe('Updated A');
    expect(res.body.chatbot.widget.primaryColor).toBe('#ff0000');
    expect(res.body.chatbot.widget.title).toBe('A'); // sibling setting preserved
    const bAfter = await ctx.api.get(`/api/chatbots/${b.id}`).set(auth(token));
    expect(bAfter.body.chatbot.systemPrompt).toBe('Prompt B');
  });

  it('validates input (hex colors, domains, identifiers, enums)', async () => {
    const { token } = await registerUser(ctx.api);
    const bot = await createChatbot(ctx.api, token);
    const bad = await ctx.api.put(`/api/chatbots/${bot.id}`).set(auth(token)).send({ widget: { primaryColor: 'red;background:url(x)' } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].path).toContain('primaryColor');
    expect((await ctx.api.put(`/api/chatbots/${bot.id}`).set(auth(token)).send({ allowedDomains: ['not a domain!'] })).status).toBe(400);
    expect((await ctx.api.put(`/api/chatbots/${bot.id}`).set(auth(token)).send({ identifier: 'Bad Identifier' })).status).toBe(400);
    const ok = await ctx.api.put(`/api/chatbots/${bot.id}`).set(auth(token)).send({ allowedDomains: ['https://Shop.Example.com/path', '*.example.org'] });
    expect(ok.body.chatbot.allowedDomains).toEqual(['shop.example.com', '*.example.org']);
  });

  it('exposes the configured platform limits to signed-in users only', async () => {
    const { token } = await registerUser(ctx.api);
    expect((await ctx.api.get('/api/platform/limits')).status).toBe(401);
    const res = await ctx.api.get('/api/platform/limits').set(auth(token));
    expect(res.body.limits).toMatchObject({ maxUploadMb: 20, maxFilesPerUpload: 10, maxProductImportMb: 15, widget: { maxProducts: 20 } });
  });

  it('keeps readable titles for text knowledge entries', async () => {
    const { token } = await registerUser(ctx.api);
    const bot = await createChatbot(ctx.api, token);
    const res = await ctx.api.post(`/api/chatbots/${bot.id}/knowledge/text`).set(auth(token)).send({ title: 'Shipping & returns', content: 'Free returns.' });
    expect(res.body.file.fileName).toBe('Shipping & returns.txt');
  });

  it('activates and deactivates a chatbot', async () => {
    const { token } = await registerUser(ctx.api);
    const bot = await createChatbot(ctx.api, token);
    const res = await ctx.api.patch(`/api/chatbots/${bot.id}/status`).set(auth(token)).send({ status: 'inactive' });
    expect(res.body.chatbot.status).toBe('inactive');
    expect((await ctx.api.get(`/api/widget/config/${bot.publicId}`)).status).toBe(404);
  });

  it('duplicates settings, products and knowledge with re-encrypted keys', async () => {
    const { token } = await registerUser(ctx.api);
    const ai = mockAi(ctx.mock, 'openai');
    const bot = await createChatbot(ctx.api, token, { name: 'Original', systemPrompt: 'Be helpful', ai });
    await ctx.api.post(`/api/chatbots/${bot.id}/products/import`).set(auth(token)).attach('file', Buffer.from(JSON.stringify(SAMPLE_PRODUCTS)), 'p.json');
    await ctx.api.post(`/api/chatbots/${bot.id}/knowledge/text`).set(auth(token)).send({ title: 'FAQ', content: 'Our refund policy lasts 30 days.' });
    await processAllFiles(bot.id);

    const res = await ctx.api.post(`/api/chatbots/${bot.id}/duplicate`).set(auth(token)).send({});
    expect(res.status).toBe(201);
    const copy = res.body.chatbot;
    expect(copy.name).toBe('Original (copy)');
    expect(copy.status).toBe('inactive');
    expect(copy.publicId).not.toBe(bot.publicId);
    expect(copy.systemPrompt).toBe('Be helpful');
    expect(copy.ai.hasApiKey).toBe(true);
    expect(await Product.countDocuments({ chatbotId: copy.id })).toBe(3);
    expect(await KnowledgeChunk.countDocuments({ chatbotId: copy.id })).toBeGreaterThan(0);

    const stored = await Chatbot.findById(copy.id).select('+ai.encryptedApiKey').lean();
    const original = await Chatbot.findById(bot.id).select('+ai.encryptedApiKey').lean();
    expect(stored!.ai!.encryptedApiKey).not.toBe(original!.ai!.encryptedApiKey);
    expect(decryptSecret(stored!.ai!.encryptedApiKey!, `chatbot:${copy.id}:ai-key`)).toBe(ai.apiKey);

    // The copy can actually use its key.
    const test = await ctx.api.post(`/api/chatbots/${copy.id}/test-provider`).set(auth(token)).send({ target: 'chat' });
    expect(test.body.ok).toBe(true);
  });

  it('deletes a chatbot and cascades to all of its data', async () => {
    const { token } = await registerUser(ctx.api);
    const bot = await createChatbot(ctx.api, token, { ai: mockAi(ctx.mock) });
    await ctx.api.post(`/api/chatbots/${bot.id}/products`).set(auth(token)).send(SAMPLE_PRODUCTS[0]);
    await ctx.api.post(`/api/chatbots/${bot.id}/knowledge/text`).set(auth(token)).send({ title: 'FAQ', content: 'Hello world facts.' });
    await processAllFiles(bot.id);
    await ctx.api.post('/api/widget/chat').send({ chatbotId: bot.publicId, visitorId: 'visitor_12345', message: 'Hi' });
    expect(await Conversation.countDocuments({ chatbotId: bot.id })).toBe(1);

    expect((await ctx.api.delete(`/api/chatbots/${bot.id}`).set(auth(token))).status).toBe(204);
    expect(await Chatbot.countDocuments({ _id: bot.id })).toBe(0);
    expect(await Product.countDocuments({ chatbotId: bot.id })).toBe(0);
    expect(await KnowledgeChunk.countDocuments({ chatbotId: bot.id })).toBe(0);
    expect(await Conversation.countDocuments({ chatbotId: bot.id })).toBe(0);
  });
});

describe('tenant isolation and ownership checks', () => {
  it('never exposes or mutates another user’s chatbot data', async () => {
    const alice = await registerUser(ctx.api, 'Alice');
    const mallory = await registerUser(ctx.api, 'Mallory');
    const bot = await createChatbot(ctx.api, alice.token, { name: 'Alice Bot', ai: mockAi(ctx.mock) });
    const prod = await ctx.api.post(`/api/chatbots/${bot.id}/products`).set(auth(alice.token)).send(SAMPLE_PRODUCTS[0]);
    const file = await ctx.api.post(`/api/chatbots/${bot.id}/knowledge/text`).set(auth(alice.token)).send({ title: 'Secret', content: 'Alice confidential pricing notes.' });
    await processAllFiles(bot.id);
    await ctx.api.post('/api/widget/chat').send({ chatbotId: bot.publicId, visitorId: 'visitor_alice1', message: 'Hello' });
    const conv = await Conversation.findOne({ chatbotId: bot.id }).lean();

    const m = auth(mallory.token);
    const base = `/api/chatbots/${bot.id}`;
    const attempts = await Promise.all([
      ctx.api.get(base).set(m),
      ctx.api.put(base).set(m).send({ name: 'pwned' }),
      ctx.api.delete(base).set(m),
      ctx.api.post(`${base}/duplicate`).set(m).send({}),
      ctx.api.put(`${base}/ai-config`).set(m).send({ model: 'x' }),
      ctx.api.post(`${base}/test-provider`).set(m).send({}),
      ctx.api.post(`${base}/preview-chat`).set(m).send({ message: 'hi' }),
      ctx.api.get(`${base}/embed`).set(m),
      ctx.api.get(`${base}/knowledge`).set(m),
      ctx.api.post(`${base}/knowledge/search`).set(m).send({ query: 'pricing' }),
      ctx.api.delete(`${base}/knowledge/${file.body.file.id}`).set(m),
      ctx.api.get(`${base}/products`).set(m),
      ctx.api.put(`${base}/products/${prod.body.product.id}`).set(m).send({ id: 'P001', name: 'x' }),
      ctx.api.delete(`${base}/products/${prod.body.product.id}`).set(m),
      ctx.api.post(`${base}/sync-key`).set(m),
      ctx.api.get(`/api/analytics/chatbots/${bot.id}`).set(m),
      ctx.api.get(`/api/conversations/${conv!._id}`).set(m),
      ctx.api.delete(`/api/conversations/${conv!._id}`).set(m),
    ]);
    for (const res of attempts) expect(res.status).toBe(404);

    const lists = await Promise.all([
      ctx.api.get('/api/chatbots').set(m),
      ctx.api.get(`/api/conversations?chatbotId=${bot.id}`).set(m),
      ctx.api.get(`/api/knowledge?chatbotId=${bot.id}`).set(m),
    ]);
    for (const res of lists) expect(res.body.total).toBe(0);
    const overview = await ctx.api.get('/api/analytics/overview').set(m);
    expect(overview.body.totals).toMatchObject({ chatbots: 0, conversations: 0, messages: 0 });

    // Alice's data is untouched.
    const own = await ctx.api.get(base).set(auth(alice.token));
    expect(own.body.chatbot.name).toBe('Alice Bot');
    expect((await ctx.api.get(`${base}/products`).set(auth(alice.token))).body.total).toBe(1);
  });

  it('does not treat a chatbot ID as authorization for invalid ids', async () => {
    const { token } = await registerUser(ctx.api);
    expect((await ctx.api.get('/api/chatbots/not-an-id').set(auth(token))).status).toBe(404);
    expect((await ctx.api.get('/api/chatbots/000000000000000000000000').set(auth(token))).status).toBe(404);
  });
});

describe('API key security', () => {
  it('encrypts keys at rest and never returns them from any endpoint', async () => {
    const { token } = await registerUser(ctx.api);
    const ai = mockAi(ctx.mock, 'openai');
    const bot = await createChatbot(ctx.api, token, { ai });
    const raw = await Chatbot.findById(bot.id).select('+ai.encryptedApiKey').lean();
    expect(raw!.ai!.encryptedApiKey).toMatch(/^v1\./);
    expect(JSON.stringify(raw)).not.toContain(ai.apiKey);

    const responses = await Promise.all([
      ctx.api.get(`/api/chatbots/${bot.id}`).set(auth(token)),
      ctx.api.get('/api/chatbots').set(auth(token)),
      ctx.api.get(`/api/chatbots/${bot.id}/embed`).set(auth(token)),
      ctx.api.get(`/api/widget/config/${bot.publicId}`),
      ctx.api.get('/api/analytics/overview').set(auth(token)),
      ctx.api.put(`/api/chatbots/${bot.id}/ai-config`).set(auth(token)).send({ generation: { maxOutputTokens: 500 } }),
    ]);
    for (const res of responses) {
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(ai.apiKey);
      expect(text).not.toContain('encryptedApiKey');
    }
    expect(responses[0]!.body.chatbot.ai).toMatchObject({ hasApiKey: true, apiKeyLast4: ai.apiKey.slice(-4) });
  });

  it('binds ciphertexts to their chatbot (a copied ciphertext cannot be decrypted elsewhere)', async () => {
    const { token } = await registerUser(ctx.api);
    const a = await createChatbot(ctx.api, token, { name: 'A', ai: mockAi(ctx.mock) });
    const b = await createChatbot(ctx.api, token, { name: 'B' });
    const raw = await Chatbot.findById(a.id).select('+ai.encryptedApiKey').lean();
    expect(() => decryptSecret(raw!.ai!.encryptedApiKey!, `chatbot:${b.id}:ai-key`)).toThrow();
  });

  it('public widget config exposes no prompts, keys or internal settings', async () => {
    const { token } = await registerUser(ctx.api);
    const bot = await createChatbot(ctx.api, token, { systemPrompt: 'TOP SECRET INSTRUCTIONS', ai: mockAi(ctx.mock), allowedDomains: ['example.com'] });
    const res = await ctx.api.get(`/api/widget/config/${bot.publicId}`);
    const text = JSON.stringify(res.body);
    for (const forbidden of ['TOP SECRET', 'systemPrompt', 'ownerId', 'apiKey', 'baseUrl', 'allowedDomains', 'model', 'provider']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('removes the stored key when switching provider without a new key', async () => {
    const { token } = await registerUser(ctx.api);
    const bot = await createChatbot(ctx.api, token, { ai: mockAi(ctx.mock, 'openai') });
    const res = await ctx.api.put(`/api/chatbots/${bot.id}/ai-config`).set(auth(token)).send({ provider: 'gemini', model: 'gemini-2.5-flash' });
    expect(res.body.chatbot.ai).toMatchObject({ provider: 'gemini', hasApiKey: false, apiKeyLast4: null });
  });
});
