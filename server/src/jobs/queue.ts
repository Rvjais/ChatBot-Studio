import { Job, type JobDoc } from '../models/Job.js';

export const JOB_TYPES = {
  processKnowledgeFile: 'knowledge.process',
} as const;

/** A job locked longer than this is assumed to belong to a crashed worker and is reclaimed. */
const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

type Listener = () => void;
const listeners = new Set<Listener>();

/** Lets an in-process runner wake up immediately instead of waiting for the next poll. */
export function onJobEnqueued(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function enqueueJob(type: string, payload: Record<string, unknown>, maxAttempts = 3): Promise<JobDoc> {
  const job = await Job.create({ type, payload, maxAttempts });
  listeners.forEach((l) => l());
  return job;
}

/** Atomically claims the next runnable job (or a stale one from a dead worker). */
export async function claimNextJob(workerId: string): Promise<JobDoc | null> {
  const now = new Date();
  return Job.findOneAndUpdate(
    {
      $or: [
        { status: 'queued', runAt: { $lte: now } },
        { status: 'running', lockedAt: { $lt: new Date(now.getTime() - LOCK_TIMEOUT_MS) } },
      ],
    },
    { $set: { status: 'running', lockedAt: now, lockedBy: workerId }, $inc: { attempts: 1 } },
    { sort: { runAt: 1 }, new: true },
  );
}

export async function completeJob(job: JobDoc): Promise<void> {
  await Job.updateOne({ _id: job._id }, { $set: { status: 'completed', completedAt: new Date() }, $unset: { lockedAt: 1, lockedBy: 1 } });
}

/** Returns true when the job will be retried, false when it permanently failed. */
export async function failJob(job: JobDoc, error: unknown): Promise<boolean> {
  const message = error instanceof Error ? error.message : String(error);
  const retry = job.attempts < job.maxAttempts;
  await Job.updateOne(
    { _id: job._id },
    {
      $set: {
        status: retry ? 'queued' : 'failed',
        lastError: message.slice(0, 2000),
        runAt: new Date(Date.now() + 2 ** job.attempts * 5000),
        ...(retry ? {} : { completedAt: new Date() }),
      },
      $unset: { lockedAt: 1, lockedBy: 1 },
    },
  );
  return retry;
}

/** Cancels pending jobs for a file (used when the file is deleted). */
export async function cancelJobsForFile(fileId: string): Promise<void> {
  await Job.deleteMany({ 'payload.fileId': fileId, status: { $in: ['queued'] } });
}
