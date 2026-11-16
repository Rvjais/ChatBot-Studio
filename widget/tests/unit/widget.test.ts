import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatWidget } from '../../src/components/chat-widget';
import { resolveConfig } from '../../src/config';
import { readSSE } from '../../src/services/sse';
import type { ServerConfig } from '../../src/types';
import { contrastText, safeColor } from '../../src/utils/color';
import { renderMarkdown } from '../../src/utils/markdown';

const SERVER: ServerConfig = {
  publicId: 'cb_ABCDEFGHIJKLMNOPQRST',
  name: 'Shop Assistant',
  welcomeMessage: 'Hi! How can I help?',
  placeholder: 'Ask me anything',
  language: 'auto',
  widget: {
    title: 'Shop Assistant',
    subtitle: 'Online',
    primaryColor: '#4f46e5',
    secondaryColor: '#eef2ff',
    headerBackground: '#4f46e5',
    headerTextColor: '#ffffff',
    position: 'bottom-right',
    avatarUrl: null,
    borderRadius: 16,
    theme: 'light',
    size: 'medium',
    launcherText: '',
    showBranding: true,
    autoOpen: false,
    suggestedQuestions: ['Do you ship abroad?'],
  },
  features: { streaming: true, pageProducts: true },
  limits: { maxMessageChars: 500, maxProducts: 3, maxProductsBytes: 2000 },
};

function sseResponse(events: [string, unknown][]): Response {
  const body = events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const bytes = new TextEncoder().encode(body);
      // Deliver in small, awkward pieces to exercise the parser's buffering.
      for (let i = 0; i < bytes.length; i += 13) controller.enqueue(bytes.slice(i, i + 13));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const shadow = () => document.querySelector('[data-ai-chatbot]')!.shadowRoot!;
const tick = () => new Promise((r) => setTimeout(r, 30));

describe('markdown rendering is XSS-safe', () => {
  it('escapes HTML and only allows safe links', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)> **bold** [click](javascript:alert(1)) [ok](https://shop.example.com/p?a=1&b=2)');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).not.toContain('href="javascript');
    expect(html).toContain('<a href="https://shop.example.com/p?a=1&amp;b=2" target="_blank" rel="noopener noreferrer nofollow">ok</a>');
  });
  it('renders lists, paragraphs, inline code and bare URLs', () => {
    const html = renderMarkdown('Products:\n- **Headphones** — ₹2,499\n- Keyboard\n\nSee https://example.com/a for `details`.');
    expect(html).toContain('<ul><li><strong>Headphones</strong> — ₹2,499</li><li>Keyboard</li></ul>');
    expect(html).toContain('<a href="https://example.com/a"');
    expect(html).toContain('<code>details</code>');
  });
  it('does not let attribute quotes break out of links', () => {
    const html = renderMarkdown('[x](https://a.com/"onmouseover="alert(1))');
    expect(html).not.toMatch(/"\s*onmouseover=/);
  });
});

describe('SSE parsing', () => {
  it('parses events split across arbitrary chunk boundaries', async () => {
    const res = sseResponse([
      ['start', { conversationId: 'conv_1' }],
      ['delta', { text: 'Hel' }],
      ['delta', { text: 'lo\nworld' }],
      ['done', { content: 'Hello\nworld' }],
    ]);
    const out = [];
    for await (const e of readSSE(res.body!)) out.push([e.event, JSON.parse(e.data)]);
    expect(out).toEqual([
      ['start', { conversationId: 'conv_1' }],
      ['delta', { text: 'Hel' }],
      ['delta', { text: 'lo\nworld' }],
      ['done', { content: 'Hello\nworld' }],
    ]);
  });
});

describe('configuration', () => {
  it('only accepts hex colors and picks readable text colors', () => {
    expect(safeColor('red;background:url(x)', '#000000')).toBe('#000000');
    expect(safeColor('#ABC', '#000000')).toBe('#ABC');
    expect(contrastText('#ffffff')).toBe('#111827');
    expect(contrastText('#1e1b4b')).toBe('#ffffff');
  });
  it('applies validated page overrides', () => {
    const cfg = resolveConfig(SERVER, { theme: 'dark', position: 'bottom-left', primaryColor: '#0ea5e9', zIndex: 99, openOnLoad: true }, 'https://api.example.com');
    expect(cfg.widget).toMatchObject({ theme: 'dark', position: 'bottom-left', primaryColor: '#0ea5e9', headerBackground: '#0ea5e9' });
    expect(cfg).toMatchObject({ zIndex: 99, openOnLoad: true, apiBase: 'https://api.example.com' });
    const bad = resolveConfig(SERVER, { primaryColor: 'expression(alert(1))', theme: 'neon' as never }, 'x');
    expect(bad.widget.primaryColor).toBe('#4f46e5');
    expect(bad.widget.theme).toBe('light');
  });
});

describe('ChatWidget', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<h1 style="font-family: Comic Sans MS">Host page</h1>';
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('renders inside a Shadow DOM without touching host page styles', () => {
    new ChatWidget(resolveConfig(SERVER, {}, 'https://api.test')).mount();
    const host = document.querySelector('[data-ai-chatbot]')!;
    expect(host.shadowRoot).toBeTruthy();
    expect(document.head.querySelectorAll('style').length).toBe(0);
    expect(shadow().querySelector('style')!.textContent).toContain(':host');
    expect(shadow().querySelector('.panel')!.hasAttribute('hidden')).toBe(true);
    expect(shadow().querySelector('.title')!.textContent).toBe('Shop Assistant');
  });

  it('opens, shows the welcome message and suggested questions, and closes with Escape', () => {
    const w = new ChatWidget(resolveConfig(SERVER, {}, 'https://api.test'));
    w.mount();
    (shadow().querySelector('.launcher') as HTMLButtonElement).click();
    expect(shadow().querySelector('.panel')!.hasAttribute('hidden')).toBe(false);
    expect(shadow().querySelector('.msg.assistant .bubble')!.textContent).toBe('Hi! How can I help?');
    expect(shadow().querySelector('.chip')!.textContent).toBe('Do you ship abroad?');
    shadow().querySelector('.panel')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(shadow().querySelector('.panel')!.hasAttribute('hidden')).toBe(true);
  });

  it('streams an answer, persists the conversation id and sends page products', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        ['start', { conversationId: 'conv_ABCDEFGHIJKLMNOPQRSTUVWX' }],
        ['delta', { text: 'The **headphones** ' }],
        ['delta', { text: 'cost ₹2,499.' }],
        ['done', { conversationId: 'conv_ABCDEFGHIJKLMNOPQRSTUVWX', content: 'The **headphones** cost ₹2,499.' }],
      ]),
    );
    const products = [{ id: 'P1', name: 'Headphones', price: 2499 }];
    const w = new ChatWidget(resolveConfig(SERVER, {}, 'https://api.test'), products);
    w.mount();
    await w.sendMessage('How much are the headphones?');
    await tick();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.test/api/widget/chat');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ chatbotId: SERVER.publicId, message: 'How much are the headphones?', stream: true, products });
    expect(body.visitorId).toMatch(/^v_[A-Za-z0-9]{22}$/);
    expect(init.credentials).toBe('omit');

    const bubbles = [...shadow().querySelectorAll('.msg .bubble')].map((b) => b.innerHTML);
    expect(bubbles.at(-2)).toBe('How much are the headphones?');
    expect(bubbles.at(-1)).toBe('<p>The <strong>headphones</strong> cost ₹2,499.</p>');
    expect(localStorage.getItem(`aicb:${SERVER.publicId}:conversation`)).toBe('conv_ABCDEFGHIJKLMNOPQRSTUVWX');
    expect(shadow().querySelector('.chip')).toBeNull();
  });

  it('renders user text safely (no HTML injection from the visitor)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ conversationId: 'conv_x', content: 'ok' }), { headers: { 'content-type': 'application/json' } }));
    const w = new ChatWidget(resolveConfig(SERVER, {}, 'https://api.test'));
    w.mount();
    await w.sendMessage('<img src=x onerror="window.pwned=1">');
    expect(shadow().querySelector('.msg.user img')).toBeNull();
    expect(shadow().querySelector('.msg.user .bubble')!.textContent).toBe('<img src=x onerror="window.pwned=1">');
  });

  it('shows a friendly error with a working retry button', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'slow down' } }), { status: 429, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversationId: 'conv_y', content: 'Recovered answer' }), { headers: { 'content-type': 'application/json' } }));
    const w = new ChatWidget(resolveConfig({ ...SERVER, features: { ...SERVER.features, streaming: false } }, {}, 'https://api.test'));
    w.mount();
    await w.sendMessage('hello');
    const err = shadow().querySelector('.msg.error .bubble')!;
    expect(err.textContent).toContain('too quickly');
    (err.querySelector('.retry') as HTMLButtonElement).click();
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(shadow().querySelector('.msg.error')).toBeNull();
    expect(shadow().querySelectorAll('.msg.user')).toHaveLength(1); // retry does not duplicate the question
    expect([...shadow().querySelectorAll('.msg.assistant .bubble')].at(-1)!.textContent).toBe('Recovered answer');
  });

  it('limits page products by count and size, and ignores non-arrays', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const w = new ChatWidget(resolveConfig(SERVER, {}, 'https://api.test'));
    w.setProducts(Array.from({ length: 10 }, (_, i) => ({ id: `P${i}`, name: `Item ${i}` })));
    expect((w as unknown as { products: unknown[] }).products).toHaveLength(3);
    w.setProducts([{ id: 'BIG', name: 'x'.repeat(5000) }]);
    expect((w as unknown as { products: unknown[] }).products).toHaveLength(0);
    w.setProducts('nope' as never);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('starts a new conversation on reset', async () => {
    localStorage.setItem(`aicb:${SERVER.publicId}:conversation`, 'conv_old');
    const w = new ChatWidget(resolveConfig(SERVER, {}, 'https://api.test'));
    w.mount();
    w.resetConversation();
    expect(localStorage.getItem(`aicb:${SERVER.publicId}:conversation`)).toBeNull();
    expect(shadow().querySelectorAll('.msg')).toHaveLength(1); // welcome only
  });
});
