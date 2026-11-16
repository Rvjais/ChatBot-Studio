import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { startJobRunner, type JobRunner } from './jobs/runner.js';

async function main() {
  await connectDatabase();
  const app = createApp();
  let runner: JobRunner | undefined;
  if (env.RUN_WORKER_IN_PROCESS) runner = startJobRunner();

  const server = app.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT} (public URL ${env.PUBLIC_API_URL})`);
  });
  // Allow long-running streamed answers, but don't keep idle sockets forever.
  server.requestTimeout = 5 * 60 * 1000;
  server.headersTimeout = 65_000;

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close();
    await runner?.stop();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled promise rejection'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
