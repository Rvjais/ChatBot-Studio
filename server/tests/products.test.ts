import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Message } from '../src/models/Message.js';
import { Product } from '../src/models/Product.js';
import { auth, clearDatabase, createChatbot, makeXlsx, mockAi, registerUser, SAMPLE_PRODUCTS, startContext, type TestContext } from './helpers/context.js';
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

async function setup() {
  const { token } = await registerUser(ctx.api);
  const bot = await createChatbot(ctx.api, token, { ai: mockAi(ctx.mock) });
  return { token, bot, base: `/api/chatbots/${bot.id}` };
}

describe('product import (method A: dashboard upload)', () => {
  it('imports JSON, CSV and XLSX with field-name aliases and price parsing', async () => {
    const { token, base } = await setup();
    const json = await ctx.api.post(`${base}/products/import`).set(auth(token)).attach('file', Buffer.from(JSON.stringify({ products: SAMPLE_PRODUCTS })), 'catalog.json');
    expect(json.body.report).toMatchObject({ total: 3, inserted: 3, updated: 0, failed: 0 });

    const csv = 'SKU,Product Name,Sale Price,Stock,Category\nP010,Gaming Mouse,"₹1,299.00",12,Accessories\n,Missing Id Lamp,500,0,Home\nP011,,100,1,Home\n';
    const csvRes = await ctx.api.post(`${base}/products/import`).set(auth(token)).attach('file', Buffer.from(csv), 'catalog.csv');
    expect(csvRes.body.report).toMatchObject({ total: 3, inserted: 2, failed: 1 });
    expect(csvRes.body.report.errors[0]).toMatchObject({ row: 3, message: 'missing product name' });
    expect(csvRes.body.report.warnings.join(' ')).toContain('generated "missing-id-lamp"');

    const xlsx = await makeXlsx([
      ['id', 'title', 'price', 'currency', 'available'],
      ['P020', 'Webcam HD', 1999, 'INR', 'yes'],
    ]);
    const xlsxRes = await ctx.api.post(`${base}/products/import`).set(auth(token)).attach('file', xlsx, 'catalog.xlsx');
    expect(xlsxRes.body.report).toMatchObject({ inserted: 1, failed: 0 });

    const mouse = await Product.findOne({ productId: 'P010' }).lean();
    expect(mouse).toMatchObject({ name: 'Gaming Mouse', price: 1299, currency: 'INR', availability: 'In Stock (12)', category: 'Accessories' });
    const webcam = await Product.findOne({ productId: 'P020' }).lean();
    expect(webcam).toMatchObject({ price: 1999, availability: 'In Stock' });
    expect((await ctx.api.get(`${base}/products`).set(auth(token))).body.total).toBe(6);
  });

  it('upserts on re-import and removes missing products in replace mode', async () => {
    const { token, base } = await setup();
    await ctx.api.post(`${base}/products/import`).set(auth(token)).attach('file', Buffer.from(JSON.stringify(SAMPLE_PRODUCTS)), 'a.json');
    const updated = [{ ...SAMPLE_PRODUCTS[0], price: 2299 }];
    const upsert = await ctx.api.post(`${base}/products/import`).set(auth(token)).attach('file', Buffer.from(JSON.stringify(updated)), 'b.json');
    expect(upsert.body.report).toMatchObject({ inserted: 0, updated: 1, removed: 0 });
    expect((await Product.findOne({ productId: 'P001' }).lean())!.price).toBe(2299);

    const replace = await ctx.api.post(`${base}/products/import`).set(auth(token)).field('mode', 'replace').attach('file', Buffer.from(JSON.stringify(updated)), 'c.json');
    expect(replace.body.report.removed).toBe(2);
    expect(await Product.countDocuments({})).toBe(1);
  });

  it('rejects invalid files and unsafe values', async () => {
    const { token, base } = await setup();
    expect((await ctx.api.post(`${base}/products/import`).set(auth(token)).attach('file', Buffer.from('{"foo":1}'), 'x.json')).status).toBe(400);
    expect((await ctx.api.post(`${base}/products/import`).set(auth(token)).attach('file', Buffer.from('hello'), 'x.pdf')).status).toBe(400);
    const res = await ctx.api.post(`${base}/products`).set(auth(token)).send({ id: 'X1', name: 'Bad', price: -5 });
    expect(res.status).toBe(400);
    const xss = await ctx.api.post(`${base}/products`).set(auth(token)).send({ id: 'X2', name: 'Link', url: 'javascript:alert(1)' });
    expect(xss.body.product.productUrl).toBeNull();
  });

  it('updates a product by sending back exactly what the API returned', async () => {
    const { token, base } = await setup();
    const created = await ctx.api.post(`${base}/products`).set(auth(token)).send({ ...SAMPLE_PRODUCTS[0], color: 'black' });
    const edited = { ...created.body.product, price: 2299, additionalFields: { ...created.body.product.additionalFields, warranty: '2 years' } };
    const res = await ctx.api.put(`${base}/products/${created.body.product.id}`).set(auth(token)).send(edited);
    expect(res.status).toBe(200);
    expect(res.body.product).toMatchObject({ productId: 'P001', price: 2299, availability: 'In Stock' });
    expect(res.body.product.additionalFields).toEqual({ color: 'black', warranty: '2 years' });

    // PUT is a replace: clearing optional fields actually removes them.
    const cleared = await ctx.api
      .put(`${base}/products/${created.body.product.id}`)
      .set(auth(token))
      .send({ productId: 'P001', name: 'Wireless Headphones', price: 2299 });
    expect(cleared.body.product).toMatchObject({ price: 2299, category: null, availability: null, currency: null, productUrl: null, additionalFields: {} });
  });

  it('supports add, update, search, category list and delete', async () => {
    const { token, base } = await setup();
    const created = await ctx.api.post(`${base}/products`).set(auth(token)).send(SAMPLE_PRODUCTS[1]);
    expect(created.status).toBe(201);
    const id = created.body.product.id;
    const upd = await ctx.api.put(`${base}/products/${id}`).set(auth(token)).send({ ...SAMPLE_PRODUCTS[1], price: 3199 });
    expect(upd.body.product.price).toBe(3199);
    await ctx.api.post(`${base}/products`).set(auth(token)).send(SAMPLE_PRODUCTS[0]);
    const search = await ctx.api.get(`${base}/products?q=keyboard`).set(auth(token));
    expect(search.body.items.map((p: any) => p.productId)).toEqual(['P002']);
    const cats = await ctx.api.get(`${base}/products/categories`).set(auth(token));
    expect(cats.body.categories).toEqual(['Accessories', 'Electronics']);
    expect((await ctx.api.delete(`${base}/products/${id}`).set(auth(token))).status).toBe(204);
    const del = await ctx.api.delete(`${base}/products`).set(auth(token)).send({ confirm: true });
    expect(del.body.deleted).toBe(1);
  });
});

describe('structured product question answering', () => {
  const cases: [string, string[]][] = [
    ['What is the price of Wireless Headphones?', ['P001']],
    ['Do you have any mechanical keyboards?', ['P002']],
    ['Which product costs less than ₹3,000?', ['P003', 'P001']],
    ['Is product P001 available?', ['P001']],
    ['Tell me about your headphones.', ['P001']],
    ['Show me products in the electronics category.', ['P003', 'P001']],
  ];

  it.each(cases)('%s', async (question, expected) => {
    const { token, base } = await setup();
    await ctx.api.post(`${base}/products/import`).set(auth(token)).attach('file', Buffer.from(JSON.stringify(SAMPLE_PRODUCTS)), 'p.json');
    const res = await ctx.api.post(`${base}/products/search-test`).set(auth(token)).send({ query: question });
    expect(res.body.verified.map((p: any) => p.productId)).toEqual(expected);
  });

  it('puts exact database records in the prompt and keeps prices unmodified', async () => {
    const { token, bot, base } = await setup();
    await ctx.api.post(`${base}/products/import`).set(auth(token)).attach('file', Buffer.from(JSON.stringify(SAMPLE_PRODUCTS)), 'p.json');
    ctx.mock.reply = () => 'The Wireless Headphones (P001) cost ₹2,499 and are in stock.';
    const res = await ctx.api.post('/api/widget/chat').send({ chatbotId: bot.publicId, visitorId: 'visitor_price1', message: 'What is the price of Wireless Headphones?' });
    expect(res.body.content).toBe('The Wireless Headphones (P001) cost ₹2,499 and are in stock.');
    const prompt = systemPromptOf(ctx.mock.last('/chat/completions')!);
    expect(prompt).toContain('<verified_product_records');
    expect(prompt).toContain('"id":"P001","name":"Wireless Headphones","price":2499,"currency":"INR"');
    const msg = await Message.findOne({ role: 'assistant' }).sort({ timestamp: -1 }).lean();
    expect(msg!.metadata!.productIds).toEqual(['P001']);
    expect(msg!.metadata!.priceCheck!.passed).toBe(true);
  });

  it('flags and annotates prices that are not in any record (price guard)', async () => {
    const { token, bot, base } = await setup();
    await ctx.api.post(`${base}/products/import`).set(auth(token)).attach('file', Buffer.from(JSON.stringify(SAMPLE_PRODUCTS)), 'p.json');
    ctx.mock.reply = () => 'The Wireless Headphones are on sale for ₹1,999 today!';
    const res = await ctx.api.post('/api/widget/chat').send({ chatbotId: bot.publicId, visitorId: 'visitor_price2', message: 'How much are the headphones?' });
    expect(res.body.content).toContain('please confirm the final price');
    const msg = await Message.findOne({ role: 'assistant' }).sort({ timestamp: -1 }).lean();
    expect(msg!.metadata!.priceCheck).toMatchObject({ passed: false, unverifiedAmounts: ['₹1,999'] });
  });

  it('carries products over to follow-up questions', async () => {
    const { token, bot, base } = await setup();
    await ctx.api.post(`${base}/products/import`).set(auth(token)).attach('file', Buffer.from(JSON.stringify(SAMPLE_PRODUCTS)), 'p.json');
    const first = await ctx.api.post('/api/widget/chat').send({ chatbotId: bot.publicId, visitorId: 'visitor_follow1', message: 'Tell me about the mechanical keyboard' });
    await ctx.api.post('/api/widget/chat').send({ chatbotId: bot.publicId, visitorId: 'visitor_follow1', conversationId: first.body.conversationId, message: 'how much?' });
    expect(systemPromptOf(ctx.mock.last('/chat/completions')!)).toContain('"id":"P002"');
  });
});
