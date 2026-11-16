import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { connectDatabase } from '../../src/config/database.js';
import { startJobRunner, type JobRunner } from '../../src/jobs/runner.js';
import { KnowledgeFile } from '../../src/models/KnowledgeFile.js';
import { MockAIServer } from './mock-ai.js';

export interface TestContext {
  api: supertest.Agent;
  app: ReturnType<typeof createApp>;
  mock: MockAIServer;
  stop(): Promise<void>;
}

let mongo: MongoMemoryServer | null = null;

export async function startContext(): Promise<TestContext> {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri('chatbot_test'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const mock = new MockAIServer();
  await mock.start();
  const app = createApp();
  return {
    app,
    api: supertest.agent(app),
    mock,
    async stop() {
      await mock.stop();
      await mongoose.disconnect();
      await mongo?.stop();
      mongo = null;
    },
  };
}

export async function clearDatabase(): Promise<void> {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

let userCounter = 0;
export async function registerUser(api: supertest.Agent, name = 'Tester') {
  const email = `user${Date.now()}${userCounter++}@example.com`;
  const res = await api.post('/api/auth/register').send({ name, email, password: 'password123' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token as string, user: res.body.user as { id: string; email: string }, email };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** AI configs pointing at the mock server, per provider. */
export function mockAi(mock: MockAIServer, provider: 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'custom' | 'deepseek' = 'openai') {
  const base = {
    openai: `${mock.origin}/v1`,
    deepseek: `${mock.origin}/v1`,
    custom: `${mock.origin}/v1`,
    anthropic: mock.origin,
    gemini: `${mock.origin}/v1beta`,
    openrouter: undefined,
  }[provider];
  const model = { openai: 'gpt-4o-mini', deepseek: 'deepseek-chat', custom: 'local-model', anthropic: 'claude-opus-5-5', gemini: 'gemini-2.5-flash', openrouter: 'openai/gpt-4o-mini' }[provider];
  return { provider, model, apiKey: `test-key-${provider}-SECRET-1234567890`, ...(base ? { baseUrl: base } : {}) };
}

export async function createChatbot(api: supertest.Agent, token: string, body: Record<string, unknown> = {}) {
  const res = await api.post('/api/chatbots').set(auth(token)).send({ name: 'Test Bot', ...body });
  if (res.status !== 201) throw new Error(`create chatbot failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.chatbot as { id: string; publicId: string; [k: string]: any };
}

/** Runs the background job runner until every knowledge file of the chatbot is finished. */
export async function processAllFiles(chatbotId: string, timeoutMs = 30_000): Promise<void> {
  const runner: JobRunner = startJobRunner({ concurrency: 2, pollMs: 50 });
  const started = Date.now();
  try {
    for (;;) {
      const pending = await KnowledgeFile.countDocuments({ chatbotId, processingStatus: { $in: ['pending', 'processing'] } });
      if (!pending) break;
      if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for file processing');
      await new Promise((r) => setTimeout(r, 50));
    }
    await runner.idle();
  } finally {
    await runner.stop();
  }
}

// ── File fixtures ───────────────────────────────────────────────────────────

/** Minimal but valid single-page PDF containing the given lines of text. */
export function makePdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream = `BT /F1 12 Tf 72 720 Td 16 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/** Minimal valid .docx with one paragraph per line. */
export async function makeDocx(paragraphs: string[]): Promise<Buffer> {
  const zip = new JSZip();
  const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs
      .map((p) => `<w:p><w:r><w:t xml:space="preserve">${x(p)}</w:t></w:r></w:p>`)
      .join('')}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

export async function makeXlsx(rows: (string | number)[][], sheetName = 'Sheet1'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const SAMPLE_PRODUCTS = [
  { id: 'P001', name: 'Wireless Headphones', price: 2499, currency: 'INR', description: 'Bluetooth wireless headphones', availability: 'In Stock', category: 'Electronics', url: 'https://example.com/headphones' },
  { id: 'P002', name: 'Mechanical Keyboard', price: 3499, currency: 'INR', description: 'RGB mechanical keyboard', availability: 'In Stock', category: 'Accessories', url: 'https://example.com/keyboard' },
  { id: 'P003', name: 'USB-C Charger', price: 999, currency: 'INR', description: '65W fast charger', availability: 'Out of Stock', category: 'Electronics', url: 'https://example.com/charger' },
];

/** Parses an SSE response body (supertest buffers it) into events. */
export function parseSSEText(text: string): { event: string; data: any }[] {
  return text
    .split(/\n\n/)
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      return event && data ? { event, data: JSON.parse(data) } : null;
    })
    .filter((e): e is { event: string; data: any } => e !== null);
}
