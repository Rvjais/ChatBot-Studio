/**
 * End-to-end widget test in a real browser (headless Edge/Chrome via puppeteer-core).
 *
 * Self-contained: starts an in-memory MongoDB, a mock OpenAI-compatible provider, the real
 * API server, and a plain-HTML "third-party website" on a different origin (no React, with
 * aggressive global CSS). It then embeds the widget exactly as a customer would and checks:
 * rendering, style isolation, streaming chat, page-provided + verified products, conversation
 * restore after reload, mobile layout and allowed-domain enforcement.
 *
 *   npm run build -w widget && npm run test:e2e -w widget
 *   (set BROWSER_PATH to override the browser executable)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const shots = path.join(here, 'screenshots');
fs.mkdirSync(shots, { recursive: true });

const API_PORT = 4100;
const SITE_PORT = 5055;
const API = `http://localhost:${API_PORT}`;
const BROWSERS = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '  ✔' : '  ✘'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Mock OpenAI-compatible provider (records prompts, streams answers) ──────
const prompts = [];
const mock = http.createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};
  if (!req.url.endsWith('/chat/completions')) return res.writeHead(404).end();
  const system = body.messages.find((m) => m.role === 'system')?.content ?? '';
  const question = [...body.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  prompts.push({ system, question });
  let answer = 'Hello from the mock model!';
  if (/toothbrush/i.test(question) && system.includes('Bamboo Toothbrush')) answer = 'The **Bamboo Toothbrush** is ₹149 as shown on this page.';
  else if (/headphone/i.test(question) && system.includes('"id":"P001"')) answer = 'Our **Wireless Headphones** (P001) cost ₹2,499 and are in stock.';
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const piece of answer.match(/[\s\S]{1,6}/g)) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
    await sleep(15);
  }
  res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 200, completion_tokens: 20, total_tokens: 220 } })}\n\n`);
  res.end('data: [DONE]\n\n');
});

// ── Plain HTML "customer website" on another origin ─────────────────────────
let publicId = '';
const site = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acme Store (plain HTML)</title>
<style>
  /* Hostile global styles — the widget must not be affected */
  * { font-family: "Times New Roman", serif !important; color: #b00020 !important; box-sizing: content-box !important; }
  button { background: lime !important; border: 4px dashed purple !important; }
  div { padding: 3px; }
  body { background: #fffbe6; margin: 40px; }
</style></head><body>
<h1>Acme Store</h1><p>This is a plain HTML page with no framework. Product of the day: Bamboo Toothbrush.</p>
<script>
  window.AIChatbotConfig = {
    chatbotId: ${JSON.stringify(publicId)},
    products: [{ id: "PAGE-1", name: "Bamboo Toothbrush", price: 149, currency: "INR", availability: "In Stock", category: "Personal Care" }]
  };
</script>
<script src="${API}/widget.js" async></script>
</body></html>`);
});

async function api(method, url, token, body) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  if (!fs.existsSync(path.join(root, 'widget/dist/widget.js'))) throw new Error('Build the widget first: npm run build -w widget');
  const browserPath = BROWSERS.find((p) => fs.existsSync(p));
  if (!browserPath) throw new Error('No Chrome/Edge found. Set BROWSER_PATH.');

  const mongo = await MongoMemoryServer.create();
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  const mockUrl = `http://127.0.0.1:${mock.address().port}/v1`;

  const server = spawn(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), 'src/server.ts'], {
    cwd: path.join(root, 'server'),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(API_PORT),
      PUBLIC_API_URL: API,
      MONGODB_URI: mongo.getUri('e2e'),
      JWT_SECRET: 'e2e-jwt-secret-e2e-jwt-secret-e2e-jwt-secret',
      ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      UPLOAD_DIR: path.join(os.tmpdir(), 'chatbot-e2e-uploads'),
      LOG_LEVEL: 'warn',
      WIDGET_BUNDLE_PATH: path.join(root, 'widget/dist/widget.js'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (d) => (serverLog += d));
  server.stderr.on('data', (d) => (serverLog += d));

  let browser;
  try {
    for (let i = 0; i < 120; i++) {
      try {
        if ((await fetch(`${API}/health`)).ok) break;
      } catch {}
      await sleep(500);
    }

    // ── Set up a chatbot through the real API ──
    const { token } = await api('POST', '/api/auth/register', null, { name: 'E2E', email: `e2e${Date.now()}@example.com`, password: 'password123' });
    const { chatbot } = await api('POST', '/api/chatbots', token, {
      name: 'Acme Helper',
      welcomeMessage: 'Hi there! Ask me about our products.',
      widget: { title: 'Acme Helper', subtitle: 'Typically replies instantly', primaryColor: '#0f766e', headerBackground: '#0f766e', suggestedQuestions: ['Do you sell headphones?', 'What is on sale?'] },
      domainRestrictionEnabled: true,
      allowedDomains: [`localhost:${SITE_PORT}`],
      ai: { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-e2e-not-a-real-key-123456', baseUrl: mockUrl },
    });
    publicId = chatbot.publicId;
    await api('POST', `/api/chatbots/${chatbot.id}/products`, token, { id: 'P001', name: 'Wireless Headphones', price: 2499, currency: 'INR', availability: 'In Stock', category: 'Electronics' });
    await new Promise((r) => site.listen(SITE_PORT, r));

    browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    const page = await browser.newPage();
    const consoleLines = [];
    page.on('console', (m) => consoleLines.push(m.text()));
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`http://localhost:${SITE_PORT}/`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.AIChatbot?.ready === true, { timeout: 15000 });
    check('widget boots on a plain HTML page', true);
    check('host page has no React', await page.evaluate(() => typeof window.React === 'undefined' && !document.querySelector('[data-reactroot]')));
    check('no API key or prompt in the page', !(await page.content()).includes('sk-e2e-not-a-real-key'));

    const inShadow = (fn, ...args) => page.evaluate((src, ...a) => new Function('root', 'args', src)(document.querySelector('[data-ai-chatbot]').shadowRoot, a), fn, ...args);
    const launcherBg = await inShadow('return getComputedStyle(root.querySelector(".launcher")).backgroundColor');
    check('Shadow DOM isolates host CSS (launcher keeps brand color)', launcherBg === 'rgb(15, 118, 110)', launcherBg);
    const font = await inShadow('return getComputedStyle(root.querySelector(".root")).fontFamily');
    check('host fonts do not leak in', !/Times New Roman/i.test(font), font.slice(0, 40));
    await page.screenshot({ path: path.join(shots, '1-closed.png') });

    await inShadow('root.querySelector(".launcher").click()');
    await sleep(300);
    const welcome = await inShadow('return root.querySelector(".msg.assistant .bubble").textContent');
    check('welcome message shown', welcome === 'Hi there! Ask me about our products.');
    check('suggested questions shown', (await inShadow('return root.querySelectorAll(".chip").length')) === 2);
    await page.screenshot({ path: path.join(shots, '2-open.png') });

    // Type + Enter like a real visitor.
    const textarea = await page.evaluateHandle(() => document.querySelector('[data-ai-chatbot]').shadowRoot.querySelector('textarea'));
    await textarea.type('How much is the bamboo toothbrush?');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => [...document.querySelector('[data-ai-chatbot]').shadowRoot.querySelectorAll('.msg.assistant .bubble')].at(-1)?.textContent.includes('as shown on this page'),
      { timeout: 15000 },
    );
    const answer1 = await inShadow('return [...root.querySelectorAll(".msg.assistant .bubble")].at(-1).innerHTML');
    check('streamed answer rendered with Markdown', answer1.includes('<strong>Bamboo Toothbrush</strong>'), answer1);
    check('page-provided products reached the model as unverified context', prompts.at(-1).system.includes('<page_provided_products source="web page the visitor is viewing — unverified">'));

    await inShadow('root.querySelector(".chip") ? null : null');
    await textarea.type('Do you sell headphones?');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => [...document.querySelector('[data-ai-chatbot]').shadowRoot.querySelectorAll('.msg.assistant .bubble')].at(-1)?.textContent.includes('₹2,499'),
      { timeout: 15000 },
    );
    check('verified catalog product used (both product methods together)', prompts.at(-1).system.includes('"id":"P001","name":"Wireless Headphones","price":2499'));
    check('conversation history sent on follow-up', prompts.length >= 2);
    await page.screenshot({ path: path.join(shots, '3-conversation.png') });

    // Reload → conversation restored from the server.
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.AIChatbot?.ready === true);
    await page.evaluate(() => window.AIChatbot.open());
    await page.waitForFunction(() => document.querySelector('[data-ai-chatbot]').shadowRoot.querySelectorAll('.msg.user').length === 2, { timeout: 10000 }).then(
      () => check('conversation restored after page reload', true),
      () => check('conversation restored after page reload', false),
    );

    // JavaScript API.
    await page.evaluate(() => window.AIChatbot.resetConversation());
    check('JS API resetConversation()', (await inShadow('return root.querySelectorAll(".msg.user").length')) === 0);

    // Mobile layout.
    // Switching to a mobile viewport reloads the page in Chromium, so wait for the widget again.
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.waitForFunction(() => window.AIChatbot?.ready === true, { timeout: 15000 });
    await page.evaluate(() => window.AIChatbot.open());
    await sleep(400);
    const panel = await inShadow('const r = root.querySelector(".panel").getBoundingClientRect(); return [r.width, r.height]');
    check('mobile: panel goes full screen', panel[0] === 390 && panel[1] >= 840, panel.join('x'));
    await page.screenshot({ path: path.join(shots, '4-mobile.png') });

    // Domain restriction: same page from a host that is not on the allow list.
    const blocked = await browser.newPage();
    const blockedLogs = [];
    blocked.on('console', (m) => blockedLogs.push(m.text()));
    await blocked.goto(`http://127.0.0.1:${SITE_PORT}/`, { waitUntil: 'networkidle0' });
    await sleep(800);
    const rendered = await blocked.evaluate(() => Boolean(document.querySelector('[data-ai-chatbot]')));
    check('allowed-domain restriction blocks other origins', !rendered && blockedLogs.some((l) => l.includes('DOMAIN_NOT_ALLOWED')));

    // Dashboard reflects the conversation.
    const convs = await api('GET', `/api/conversations?chatbotId=${chatbot.id}`, token);
    check('conversation visible in dashboard API', convs.total === 1 && convs.items[0].origin === `http://localhost:${SITE_PORT}`);
    const analytics = await api('GET', `/api/analytics/chatbots/${chatbot.id}`, token);
    check('token usage recorded from provider', analytics.usage.inputTokens === 400 && analytics.usage.outputTokens === 40);
    void consoleLines;
  } finally {
    await browser?.close();
    server.kill();
    site.close();
    mock.close();
    await mongo.stop();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${shots}`);
  if (failed.length) {
    console.log(serverLog.slice(-3000));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
