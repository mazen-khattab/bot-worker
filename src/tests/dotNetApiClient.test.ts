import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env';

// axios-retry will otherwise really wait between retries; keep tests fast
// by mocking axios entirely at the module boundary before importing the client.
const post = vi.fn();

vi.mock('axios', () => {
  return {
    default: {
      create: () => ({
        post,
        interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      }),
    },
  };
});

vi.mock('axios-retry', () => ({
  default: Object.assign(vi.fn(), {
    exponentialDelay: vi.fn(),
    isNetworkOrIdempotentRequestError: vi.fn(() => true),
  }),
}));

describe('DotNetApiClient', () => {
  const dlqPath = path.resolve(env.DLQ_FILE_PATH);

  beforeEach(async () => {
    post.mockReset();
    await fs.rm(dlqPath, { force: true });
  });

  afterEach(async () => {
    await fs.rm(dlqPath, { force: true });
  });

  it('writes to the Dead Letter Queue file when the .NET API is unreachable', async () => {
    post.mockRejectedValue(new Error('network down'));

    const { dotNetApiClient } = await import('../services/DotNetApiClient');
    await dotNetApiClient.updateJobStatus({ jobId: 'job-1', status: 'FAILED' });

    const raw = await fs.readFile(dlqPath, 'utf-8');
    const entries = JSON.parse(raw);

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('jobStatus');
    expect(entries[0].payload.jobId).toBe('job-1');
  });

  it('does not write to the DLQ when the call succeeds', async () => {
    post.mockResolvedValue({ status: 200 });

    const { dotNetApiClient } = await import('../services/DotNetApiClient');
    await dotNetApiClient.updateJobStatus({ jobId: 'job-2', status: 'COMPLETED' });

    await expect(fs.access(dlqPath)).rejects.toThrow();
  });
});
