import { describe, expect, it } from 'vitest';
import { chunkSegments } from '../src/services/knowledge/chunker.js';
import { sanitizeFileName } from '../src/services/knowledge/file-validation.js';
import { fitHistory } from '../src/services/chat/context-window.js';
import { checkPrices } from '../src/services/chat/price-guard.js';
import { computeCost } from '../src/services/ai/ai.service.js';
import { redactSecrets } from '../src/services/ai/errors.js';
import { normalizeProduct, parsePrice } from '../src/services/products/normalizer.js';
import { matchCategories, parseProductQuery } from '../src/services/products/retrieval.js';
import { stripDangerousKeys } from '../src/middleware/sanitize.js';
import { decryptSecret, encryptSecret } from '../src/utils/crypto.js';
import { isHostAllowed, normalizeDomainEntry } from '../src/utils/domains.js';

describe('crypto', () => {
  it('round-trips with AES-256-GCM and detects tampering / wrong context', () => {
    const c = encryptSecret('sk-secret-value', 'chatbot:1:ai-key');
    expect(c).not.toContain('sk-secret');
    expect(decryptSecret(c, 'chatbot:1:ai-key')).toBe('sk-secret-value');
    expect(() => decryptSecret(c, 'chatbot:2:ai-key')).toThrow();
    const parts = c.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), 'chatbot:1:ai-key')).toThrow();
    expect(encryptSecret('same', 'ctx')).not.toBe(encryptSecret('same', 'ctx')); // random IV
  });
});

describe('product query understanding', () => {
  it.each([
    ['under ₹3,000', { priceMax: 3000 }],
    ['below 3k please', { priceMax: 3000 }],
    ['between 1000 and 2,500', { priceMin: 1000, priceMax: 2500 }],
    ['more than $50', { priceMin: 50 }],
    ['2 lakh or less', { priceMax: 200000 }],
    ['cheapest laptop', { sort: 'price_asc' }],
    ['your most expensive watch', { sort: 'price_desc' }],
  ])('%s', (text, expected) => {
    expect(parseProductQuery(text)).toMatchObject(expected);
  });

  it('matches categories including plurals', () => {
    expect(matchCategories('show me some accessories and electronic items', ['Accessories', 'Electronics', 'Home'])).toEqual(['Accessories', 'Electronics']);
    expect(matchCategories('any home decor?', ['Home Decor', 'Garden'])).toEqual(['Home Decor']);
  });
});

describe('product normalization', () => {
  it('parses international price formats', () => {
    expect(parsePrice('₹2,499.00')).toEqual({ price: 2499, currency: 'INR' });
    expect(parsePrice('$1,299.99')).toEqual({ price: 1299.99, currency: 'USD' });
    expect(parsePrice('1.299,50 €')).toEqual({ price: 1299.5, currency: 'EUR' });
    expect(parsePrice('1,50,000')).toEqual({ price: 150000, currency: undefined });
    expect(parsePrice('-10').error).toBeDefined();
    expect(parsePrice('free').error).toBeDefined();
  });

  it('does not duplicate standard fields into additionalFields', () => {
    const { product } = normalizeProduct({ id: 'P1', name: 'Lamp', price: 10, availability: 'In Stock', stock: 4, color: 'red' });
    expect(product!.availability).toBe('In Stock');
    expect(product!.additionalFields).toEqual({ stock: 4, color: 'red' });
  });

  it('accepts the API’s own product shape unchanged (round trip)', () => {
    const fromApi = {
      id: '6afa5d6e9f606f523e0fbbe4', productId: 'P1', name: 'Lamp', description: '', price: 10, currency: 'INR',
      availability: 'In Stock', category: null, productUrl: null, imageUrl: null,
      additionalFields: { color: 'red', watts: 40 }, source: 'manual', createdAt: '2026-11-16T00:00:00Z', updatedAt: '2026-11-16T00:00:00Z',
    };
    const { product } = normalizeProduct(fromApi);
    expect(product).toMatchObject({ productId: 'P1', name: 'Lamp', price: 10, currency: 'INR', availability: 'In Stock' });
    expect(product!.additionalFields).toEqual({ color: 'red', watts: 40 });
  });

  it('keeps file and entry titles readable', () => {
    expect(sanitizeFileName('Shipping & returns, FAQ (2026)!.txt')).toBe('Shipping & returns, FAQ (2026)!.txt');
    expect(sanitizeFileName('..\\..\\etc/pass<wd>.txt')).toBe('pass_wd_.txt');
    expect(sanitizeFileName('...')).toBe('file');
  });

  it('maps aliases, strips HTML and keeps extra fields', () => {
    const { product } = normalizeProduct({ SKU: 'A1', Title: 'Desk', 'Sale Price': '₹5,000', body_html: '<p>Solid <b>oak</b></p>', color: 'brown', $where: 'x' });
    expect(product).toMatchObject({ productId: 'A1', name: 'Desk', price: 5000, currency: 'INR', description: 'Solid oak', additionalFields: { color: 'brown' } });
    expect(product!.additionalFields).not.toHaveProperty('$where');
  });
});

describe('price guard', () => {
  it('accepts known amounts in any format and flags invented ones', () => {
    expect(checkPrices('It costs ₹2,499 or Rs. 2499.00', [2499])).toEqual({ passed: true, unverifiedAmounts: [] });
    expect(checkPrices('Now only $19.99!', [24.99])).toEqual({ passed: false, unverifiedAmounts: ['$19.99'] });
    expect(checkPrices('Ships in 3 days, 2 items left', [])).toEqual({ passed: true, unverifiedAmounts: [] });
    expect(checkPrices('Total 500 rupees', [499])).toMatchObject({ passed: false });
  });
});

describe('context window management', () => {
  const turn = (role: 'user' | 'assistant', content: string) => ({ role, content });
  it('keeps the newest turns that fit and always starts with a user turn', () => {
    const history = Array.from({ length: 30 }, (_, i) => turn(i % 2 ? 'assistant' : 'user', `message ${i} `.repeat(50)));
    const out = fitHistory(history, turn('user', 'latest'), { contextWindow: 8000, systemTokens: 2000, maxOutputTokens: 1000 });
    expect(out.at(-1)!.content).toContain('latest');
    expect(out[0]!.role).toBe('user');
    expect(out.length).toBeLessThan(31);
    const tokens = out.reduce((n, t) => n + Math.ceil(t.content.length / 4), 0);
    expect(tokens).toBeLessThanOrEqual(8000 - 2000 - 1000);
  });
  it('merges consecutive same-role turns (e.g. after a failed answer)', () => {
    const out = fitHistory([turn('user', 'a'), turn('assistant', 'b'), turn('user', 'c')], turn('user', 'd'), { contextWindow: 100000, systemTokens: 10, maxOutputTokens: 10 });
    expect(out.map((t) => t.role)).toEqual(['user', 'assistant', 'user']);
    expect(out[2]!.content).toBe('c\n\nd');
  });
});

describe('chunker', () => {
  it('splits long text with overlap and keeps provenance', () => {
    const text = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} talks about topic ${i}.`).join(' ');
    const chunks = chunkSegments([{ text, meta: { page: 3 } }], { size: 300, overlap: 60 });
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.content.length <= 360 && c.meta.page === 3)).toBe(true);
    expect(chunks[1]!.content.slice(0, 20)).not.toBe(chunks[0]!.content.slice(0, 20));
  });
});

describe('security helpers', () => {
  it('matches allowed domains safely', () => {
    expect(normalizeDomainEntry('https://Shop.Example.com/x')).toBe('shop.example.com');
    expect(normalizeDomainEntry('javascript:alert(1)')).toBeNull();
    expect(isHostAllowed('www.example.com', ['example.com'])).toBe(true);
    expect(isHostAllowed('evilexample.com', ['example.com'])).toBe(false);
    expect(isHostAllowed('example.com.evil.net', ['example.com'])).toBe(false);
    expect(isHostAllowed('a.b.example.com', ['*.example.com'])).toBe(true);
    expect(isHostAllowed('localhost:3001', ['localhost:3000'])).toBe(false);
  });
  it('strips operator and prototype keys recursively', () => {
    const input = JSON.parse('{"a":{"$gt":1,"ok":2},"b.c":1,"__proto__":{"polluted":true},"list":[{"$where":"x","y":1}]}');
    expect(stripDangerousKeys(input)).toEqual({ a: { ok: 2 }, list: [{ y: 1 }] });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('redacts credentials from provider error text', () => {
    const out = redactSecrets('Incorrect API key provided: sk-proj-abcdefghijklmnop; key AIzaSyA1234567890abcdefghijk; Bearer abc.def.ghi123', ['my-custom-secret-1']);
    expect(out).not.toMatch(/sk-proj-abcdef|AIzaSyA1234|abc\.def\.ghi123/);
  });
  it('computes cost only from known pricing', () => {
    expect(computeCost('custom', 'unknown-model', { inputTokens: 1000, outputTokens: 1000 }, null)).toEqual({});
    expect(computeCost('openai', 'gpt-4o-mini', undefined, { inputPerMillion: 1, outputPerMillion: 1 })).toEqual({});
    expect(computeCost('anthropic', 'claude-haiku-5-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 }, null)).toEqual({ costUsd: 0.6, costSource: 'catalog' });
  });
});
