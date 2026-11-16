import os from 'node:os';
import path from 'node:path';

// Runs before any application module is imported.
process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `chatbot-test-uploads-${process.pid}`);
process.env.RUN_WORKER_IN_PROCESS = 'false';
process.env.PUBLIC_API_URL = 'http://localhost:4999';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.WIDGET_MAX_PRODUCTS = '20';
process.env.WIDGET_MAX_PRODUCTS_BYTES = '16384';
process.env.AI_MAX_RETRIES = '2';
process.env.AI_REQUEST_TIMEOUT_MS = '10000';
