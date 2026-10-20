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
      { id: 'ok-1', method: 'PUT', url: '/api/v1/worker/jobs/1/status', payload: { status: 'Completed' }, failedAt: '2026-10-20T00:00:00.000Z' },
      { id: 'still-fails', method: 'PUT', url: '/api/v1/worker/jobs/2/status', payload: { status: 'Failed' }, failedAt: '2026-10-20T00:00:00.000Z' },
    ];
    await fs.writeFile(dlqPath, JSON.stringify(entries), 'utf-8');

    const { dotNetApiClient } = await import('../services/DotNetApiClient');
    (dotNetApiClient.trySendRaw as ReturnType<typeof vi.fn>).mockImplementation(
      async (entry: (typeof entries)[number]) => entry.id === 'ok-1',
    );

    const { __testables } = await import('../services/dlqSync');
    await __testables.runOnce();

    const remaining = JSON.parse(await fs.readFile(dlqPath, 'utf-8'));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('still-fails');
  });
});
