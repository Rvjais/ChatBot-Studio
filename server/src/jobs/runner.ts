import os from 'node:os';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { JobDoc } from '../models/Job.js';
import { processKnowledgeFile } from '../services/knowledge/processor.js';
import { claimNextJob, completeJob, failJob, JOB_TYPES, onJobEnqueued } from './queue.js';

type Handler = (payload: Record<string, unknown>) => Promise<void>;

const handlers: Record<string, Handler> = {
  [JOB_TYPES.processKnowledgeFile]: async (payload) => processKnowledgeFile(String(payload.fileId)),
};

export interface JobRunner {
  stop(): Promise<void>;
  /** Resolves when no job is currently executing (used by tests). */
  idle(): Promise<void>;
}

/**
 * Polling job runner with bounded concurrency. Used in-process by the API server
 * (RUN_WORKER_IN_PROCESS=true) or by the standalone worker (src/jobs/worker.ts).
 */
export function startJobRunner(opts: { concurrency?: number; pollMs?: number } = {}): JobRunner {
  const concurrency = opts.concurrency ?? env.JOB_CONCURRENCY;
  const pollMs = opts.pollMs ?? env.JOB_POLL_INTERVAL_MS;
  const workerId = `${os.hostname()}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
  let active = 0;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const running = new Set<Promise<void>>();

  const run = async (job: JobDoc) => {
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`No handler for job type ${job.type}`);
      await handler(job.payload as Record<string, unknown>);
      await completeJob(job);
    } catch (err) {
      const willRetry = await failJob(job, err);
      logger.error({ err, jobId: job._id.toString(), type: job.type, willRetry }, 'Job failed');
    }
  };

  const tick = async () => {
    if (stopped) return;
    try {
      while (!stopped && active < concurrency) {
        const job = await claimNextJob(workerId);
        if (!job) break;
        active++;
        const p = run(job).finally(() => {
          active--;
          running.delete(p);
          void tick();
        });
        running.add(p);
      }
    } catch (err) {
      logger.error({ err }, 'Job runner poll failed');
    }
  };

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(async () => {
      await tick();
      schedule();
    }, pollMs);
  };

  const unsubscribe = onJobEnqueued(() => void tick());
  void tick();
  schedule();
  logger.info({ workerId, concurrency }, 'Job runner started');

  return {
    async stop() {
      stopped = true;
      unsubscribe();
      if (timer) clearTimeout(timer);
      await Promise.allSettled([...running]);
    },
    async idle() {
      while (running.size) await Promise.allSettled([...running]);
    },
  };
}
