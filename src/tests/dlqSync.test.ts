import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env';

vi.mock('../services/DotNetApiClient', () => ({
  dotNetApiClient: {
    trySendRaw: vi.fn(),
  },
}));

describe('dlqSync', () => {
  const dlqPath = path.resolve(env.DLQ_FILE_PATH);

  beforeEach(async () => {
    vi.resetModules();
    await fs.mkdir(path.dirname(dlqPath), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(dlqPath, { force: true });
  });

  it('removes entries that resend successfully and keeps the ones that still fail', async () => {
    const entries = [
      { kind: 'jobStatus', payload: { jobId: 'ok-1', status: 'COMPLETED' }, failedAt: 'x' },
      { kind: 'jobStatus', payload: { jobId: 'still-fails', status: 'FAILED' }, failedAt: 'x' },
    ];
    await fs.writeFile(dlqPath, JSON.stringify(entries), 'utf-8');

    const { dotNetApiClient } = await import('../services/DotNetApiClient');
    (dotNetApiClient.trySendRaw as ReturnType<typeof vi.fn>).mockImplementation(
      async (entry: (typeof entries)[number]) => entry.payload.jobId === 'ok-1',
    );

    const { __testables } = await import('../services/dlqSync');
    await __testables.runOnce();

    const remaining = JSON.parse(await fs.readFile(dlqPath, 'utf-8'));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].payload.jobId).toBe('still-fails');
  });
});
