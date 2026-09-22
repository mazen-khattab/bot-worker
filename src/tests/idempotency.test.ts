import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StartJobPayload } from '../types';

describe('Job queue idempotency', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('queues a new jobId and rejects a duplicate submission', async () => {
    const { enqueueJob } = await import('../queue/jobQueue');

    const payload: StartJobPayload = { jobId: 'abc-123', cookies: [], leads: [] };
    const executor = vi.fn().mockResolvedValue(undefined);

    const first = enqueueJob(payload, 'corr-1', executor);
    const second = enqueueJob(payload, 'corr-2', executor);

    expect(first).toBe('queued');
    expect(second).toBe('duplicate');
  });

  it('sweeps entries older than the TTL', async () => {
    const { __testables } = await import('../queue/jobQueue');

    const oldTimestamp = Date.now() - 999 * 60 * 60 * 1000; // way past any reasonable TTL
    __testables.seenJobs.set('stale-job', oldTimestamp);

    __testables.sweepExpiredJobIds();

    expect(__testables.seenJobs.has('stale-job')).toBe(false);
  });
});
