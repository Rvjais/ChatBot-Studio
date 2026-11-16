import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * MongoDB-backed job queue (no extra infrastructure required). Jobs are claimed atomically
 * with findOneAndUpdate, retried with backoff, and stale locks are recovered.
 */
const jobSchema = new Schema(
  {
    type: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['queued', 'running', 'completed', 'failed'], default: 'queued' },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    runAt: { type: Date, default: () => new Date() },
    lockedAt: { type: Date },
    lockedBy: { type: String },
    lastError: { type: String, maxlength: 2000 },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

jobSchema.index({ status: 1, runAt: 1 });
jobSchema.index({ 'payload.fileId': 1 });
// Clean up finished jobs after 7 days.
jobSchema.index({ completedAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

export type JobAttrs = InferSchemaType<typeof jobSchema>;
export type JobDoc = HydratedDocument<JobAttrs>;
export const Job = model('Job', jobSchema);
