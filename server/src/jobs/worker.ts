/**
 * Standalone background worker: `npm run worker` (or `npm run worker:dev`).
 * Processes uploaded knowledge files independently of the API server. Requires the same
 * MONGODB_URI, ENCRYPTION_KEY and UPLOAD_DIR as the API process.
 */
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { startJobRunner } from './runner.js';

async function main() {
  if (!env.MONGODB_URI) {
    logger.error('The standalone worker needs MONGODB_URI (the embedded dev database only runs inside the API process).');
    process.exit(1);
  }
  await connectDatabase();
  const runner = startJobRunner();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Worker shutting down');
    await runner.stop();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
