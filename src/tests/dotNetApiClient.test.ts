import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('axios', () => ({
  default: { create: () => ({ request }) },
}));

vi.mock('axios-retry', () => ({
  default: Object.assign(vi.fn(), {
    exponentialDelay: vi.fn(),
    isNetworkOrIdempotentRequestError: vi.fn(() => true),
  }),
}));

import { dotNetApiClient } from '../services/DotNetApiClient';

describe('DotNetApiClient', () => {
  const dlqPath = path.resolve(env.DLQ_FILE_PATH);

  beforeEach(async () => {
    request.mockReset();
    await fs.rm(dlqPath, { force: true });
  });

  afterEach(async () => {
    await fs.rm(dlqPath, { force: true });
  });

  it('preserves the callback method, URL and payload when the backend is unreachable', async () => {
    request.mockRejectedValue(new Error('network down'));

    await dotNetApiClient.updateJobStatus(1, { status: 'Failed' });

    const entries = JSON.parse(await fs.readFile(dlqPath, 'utf-8'));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: expect.any(String),
      failedAt: expect.any(String),
      method: 'PUT',
      url: '/api/v1/worker/jobs/1/status',
      payload: { status: 'Failed' },
    });
  });

  it('sends the callback without creating a DLQ file when the backend accepts it', async () => {
    request.mockResolvedValue({ status: 200 });

    await dotNetApiClient.updateJobStatus(2, { status: 'Completed' });

    expect(request).toHaveBeenCalledWith({
      method: 'PUT',
      url: '/api/v1/worker/jobs/2/status',
      data: { status: 'Completed' },
    });
    await expect(fs.access(dlqPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
