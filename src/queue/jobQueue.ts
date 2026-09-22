import PQueue from 'p-queue';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { dotNetApiClient } from '../services/DotNetApiClient';
import type { StartJobPayload, JobStatus, JobStatusResult } from '../types';

const queue = new PQueue({ concurrency: env.MAX_CONCURRENT_SESSIONS });

/**
 * jobId -> timestamp it was first seen.
 * Prevents the same job (e.g. re-sent by .NET on a timeout/retry) from being
 * executed twice concurrently. Entries older than IDEMPOTENCY_TTL_HOURS are
 * swept periodically so this map doesn't grow forever.
 */
const seenJobs = new Map<number, number>();
const jobStatuses = new Map<number, JobStatus>();

const TTL_MS = env.IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000;

function sweepExpiredJobIds(): void {
  const now = Date.now();
  let removed = 0;
  for (const [jobId, seenAt] of seenJobs.entries()) {
    if (now - seenAt > TTL_MS) {
      seenJobs.delete(jobId);
      jobStatuses.delete(jobId);
      removed++;
    }
  }
  if (removed > 0) {
    logger.debug({ removed }, 'Swept expired jobIds from idempotency map');
  }
}

const sweepTimer = setInterval(sweepExpiredJobIds, 60 * 60 * 1000); // hourly
sweepTimer.unref();

export type JobExecutor = (payload: StartJobPayload, correlationId: string) => Promise<void>;

export function getJobStatus(jobId: number): JobStatusResult {
  logger.debug({ jobId }, 'getJobStatus() called in jobQueue.ts');
  const status = jobStatuses.get(jobId);
  if (!status) {
    return { jobId, status: 'not_found', found: false, message: 'Job not found or expired' };
  }
  return { jobId, status, found: true };
}

/**
 * Enqueues a job for execution, respecting MAX_CONCURRENT_SESSIONS.
 * Returns 'duplicate' if this jobId was already seen (still within TTL),
 * 'queued' otherwise.
 */
export function enqueueJob(payload: StartJobPayload, correlationId: string, executor: JobExecutor,): 'queued' | 'duplicate' {
  logger.debug({ jobId: payload.jobId }, 'enqueueJob() called in jobQueue.ts');
  logger.info({ jobId: payload.jobId, correlationId }, 'Enqueuing job for background execution');

  logger.debug({ seenJobs: Array.from(seenJobs.keys()) }, 'Current seenJobs map');
  if (seenJobs.has(payload.jobId)) {
    return 'duplicate';
  }
  seenJobs.set(payload.jobId, Date.now());
  jobStatuses.set(payload.jobId, 'Pending');

  // Fire-and-forget from the caller's perspective; errors are caught here so
  // a bug inside a job can never silently vanish or crash the process.
  logger.info({ jobId: payload.jobId, correlationId }, 'Adding job to queue for execution');
  queue
    .add(async () => {
      jobStatuses.set(payload.jobId, 'Processing');
      await executor(payload, correlationId);
      jobStatuses.set(payload.jobId, 'Completed');
    })
    .catch(async (err) => {
      jobStatuses.set(payload.jobId, 'Failed');
      logger.error({ err, jobId: payload.jobId }, 'Unhandled error while executing job');
      await dotNetApiClient.logActivity({
        correlationId,
        userId: payload.userId,
        logLevel: 'ERROR',
        message: `Unhandled job error: ${(err as Error).message}`,
        stackTrace: (err as Error).stack,
      });
    });

  return 'queued';
}

/** Stops accepting new jobs and waits for in-flight ones to finish. Used during graceful shutdown. */
export async function drainQueue(): Promise<void> {
  queue.pause();
  logger.info({ pending: queue.pending, size: queue.size }, 'Draining job queue');
  await queue.onIdle();
  logger.info('Job queue drained');
}

export function getQueueStats() {
  return { pending: queue.pending, size: queue.size, isPaused: queue.isPaused };
}

// Exported for tests.
export const __testables = { seenJobs, sweepExpiredJobIds };
