import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { REPO_ROOT } from './config/paths.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { apiLimiter } from './middleware/rate-limit.js';
import { sanitizeRequest } from './middleware/sanitize.js';
import { dashboardRouter, syncRouter, widgetRouter } from './routes/index.js';

const WIDGET_BUNDLE = process.env.WIDGET_BUNDLE_PATH ?? path.join(REPO_ROOT, 'widget/dist/widget.js');
const CLIENT_DIST = process.env.CLIENT_DIST_PATH ?? path.join(REPO_ROOT, 'client/dist');

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/health' },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      serializers: { req: (req) => ({ method: req.method, url: req.url?.split('?')[0] }) },
    }),
  );

  app.use(
    helmet({
      // widget.js and widget API responses are consumed cross-origin by design.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
        },
      },
    }),
  );

  app.get('/health', (_req, res) => {
    const db = mongoose.connection.readyState === 1;
    res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'degraded', database: db ? 'connected' : 'disconnected' });
  });

  // ── Embeddable widget bundle ────────────────────────────────────────────
  app.get(['/widget.js', '/widget.js.map'], cors({ origin: '*' }), (req, res) => {
    const file = req.path.endsWith('.map') ? `${WIDGET_BUNDLE}.map` : WIDGET_BUNDLE;
    if (!fs.existsSync(file)) {
      res.status(404).type('text/plain').send('// Widget bundle not built. Run: npm run build -w widget');
      return;
    }
    res.setHeader('Cache-Control', env.isProd ? 'public, max-age=300' : 'no-cache');
    res.type('application/javascript').sendFile(file);
  });

  // ── Plain-HTML test page (no React, no framework) to verify an embed ────
  app.get('/embed-test/:publicId', (req, res) => {
    const publicId = String(req.params.publicId);
    if (!/^cb_[A-Za-z0-9]{20}$/.test(publicId)) {
      res.status(404).send('Not found');
      return;
    }
    const nonce = crypto.randomBytes(16).toString('base64');
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self' ${env.PUBLIC_API_URL} 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ${env.PUBLIC_API_URL}; frame-ancestors 'none'`,
    );
    res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Widget test page</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:760px;margin:48px auto;padding:0 16px;color:#1f2937;line-height:1.6}
code{background:#f3f4f6;padding:2px 6px;border-radius:4px}.card{border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px;margin:16px 0}</style>
</head><body>
<h1>Standalone widget test page</h1>
<p>This page is plain HTML with no framework. It loads <code>/widget.js</code> exactly as a customer website would.</p>
<div class="card"><strong>Chatbot:</strong> <code>${escapeHtml(publicId)}</code><br>
<strong>Page products:</strong> two sample products are passed via <code>window.AIChatbotConfig.products</code>.</div>
<p>Open the chat bubble in the corner and ask a question.</p>
<script nonce="${nonce}">
window.AIChatbotConfig = {
  chatbotId: ${JSON.stringify(publicId)},
  apiBase: ${JSON.stringify(env.PUBLIC_API_URL)},
  products: [
    { id: "DEMO-1", name: "Demo Travel Mug", price: 799, currency: "INR", availability: "In Stock", category: "Kitchen" },
    { id: "DEMO-2", name: "Demo Desk Lamp", price: 1899, currency: "INR", availability: "Only 3 left", category: "Home" }
  ]
};
</script>
<script src="/widget.js" async></script>
</body></html>`);
  });

  // ── Public widget API: any origin may call it; per-chatbot domain rules apply ──
  app.use(
    '/api/widget',
    cors({ origin: true, credentials: false, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'], maxAge: 600 }),
    express.json({ limit: Math.max(64 * 1024, env.WIDGET_MAX_PRODUCTS_BYTES * 2) }),
    sanitizeRequest,
    widgetRouter(),
  );

  // ── Server-to-server product sync API ───────────────────────────────────
  app.use('/api/v1/sync', cors({ origin: false }), express.json({ limit: '10mb' }), sanitizeRequest, syncRouter());

  // ── Authenticated dashboard API ─────────────────────────────────────────
  app.use(
    '/api',
    cors({
      origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin.replace(/\/+$/, ''))),
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
    apiLimiter,
    express.json({ limit: '1mb' }),
    sanitizeRequest,
    dashboardRouter(),
  );
  app.use('/api', notFoundHandler);

  // ── Optional: serve the built dashboard (single-origin deployment) ──────
  if (env.SERVE_CLIENT && fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/|widget\.js).*/, (_req: Request, res: Response) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
