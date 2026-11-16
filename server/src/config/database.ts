import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';
import { SERVER_ROOT } from './paths.js';

mongoose.set('strictQuery', true);

let embeddedServer: { stop: () => Promise<boolean>; getUri: () => string } | null = null;

/**
 * Connects to MongoDB. When MONGODB_URI is empty outside production, an embedded MongoDB
 * (mongodb-memory-server) is started with its data persisted to server/.data/db so the app
 * runs out of the box on a machine without MongoDB installed.
 */
export async function connectDatabase(uri = env.MONGODB_URI): Promise<string> {
  let target = uri;
  if (!target) {
    if (env.isProd) throw new Error('MONGODB_URI is required in production');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const dbPath = path.join(SERVER_ROOT, '.data', 'db');
    fs.mkdirSync(dbPath, { recursive: true });
    logger.warn({ dbPath }, 'MONGODB_URI not set - starting embedded development MongoDB (first run downloads the binary)');
    let server;
    // On a watch-mode restart the previous process's mongod may need a few seconds to exit and
    // release its lock, so retry briefly before reporting a genuine conflict.
    for (let attempt = 1; ; attempt++) {
      try {
        server = await MongoMemoryServer.create({
          instance: { dbPath, storageEngine: 'wiredTiger', dbName: 'chatbot_builder' },
        });
        break;
      } catch (err) {
        const inUse = /DBPathInUse|mongod\.lock/i.test(String((err as Error)?.message));
        if (inUse && attempt < 8) {
          logger.warn(`Embedded database is still locked (attempt ${attempt}/8) - waiting for the previous instance to exit`);
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        if (inUse) {
          throw new Error(
            `The embedded development database (${dbPath}) is already in use - another API server ` +
              '(npm run dev / npm start) is probably still running in another terminal. Stop it first, ' +
              'or set MONGODB_URI in server/.env to use a separate MongoDB.',
          );
        }
        throw err;
      }
    }
    embeddedServer = server;
    target = server.getUri('chatbot_builder');
  }

  await mongoose.connect(target, {
    serverSelectionTimeoutMS: 15_000,
    maxPoolSize: 20,
    autoIndex: true,
  });
  logger.info({ embedded: Boolean(embeddedServer) }, 'MongoDB connected');
  return target;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  if (embeddedServer) {
    await embeddedServer.stop();
    embeddedServer = null;
  }
}
