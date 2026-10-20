import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StartJobPayload } from '../types';

vi.mock('../services/DotNetApiClient', () => ({
  dotNetApiClient: { logActivity: vi.fn().mockResolvedValue(undefined) },
}));

import { enqueueJob, getJobStatus, __testables } from '../queue/jobQueue';
import { dotNetApiClient } from '../services/DotNetApiClient';

const payload: StartJobPayload = {
  jobId: 1,
  userId: 'user-1',
  botId: 2,
  accountId: 3,
  cookies: [],
  leads: [],
};

describe('Job queue idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __testables.seenJobs.clear();
  });

  it('executes a job once when its numeric ID is submitted twice', async () => {
    const executor = vi.fn().mockResolvedValue(undefined);

    expect(enqueueJob(payload, 'corr-1', executor)).toBe('queued');
    expect(enqueueJob(payload, 'corr-2', executor)).toBe('duplicate');

    await vi.waitFor(() => expect(getJobStatus(1).status).toBe('Completed'));
    expect(executor).toHaveBeenCalledOnce();
  });

  it('includes the bot ID when reporting an unhandled job failure', async () => {
    const executor = vi.fn().mockRejectedValue(new Error('browser disconnected'));
    enqueueJob(payload, 'corr-failed', executor);

    await vi.waitFor(() => {
      expect(getJobStatus(1).status).toBe('Failed');
      expect(dotNetApiClient.logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'corr-failed',
          userId: 'user-1',
          botId: 2,
          logLevel: 'ERROR',
          message: 'Unhandled job error: browser disconnected',
        }),
      );
    });
  });

  it('sweeps entries older than the TTL', () => {
    __testables.seenJobs.set(99, Date.now() - 999 * 60 * 60 * 1000);
    __testables.sweepExpiredJobIds();
    expect(__testables.seenJobs.has(99)).toBe(false);
  });
});
