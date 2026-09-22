import fs from 'fs/promises';
import path from 'path';
import lockfile from 'proper-lockfile';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { dotNetApiClient } from './DotNetApiClient';
import { DlqEntry } from '../types';

let timer: NodeJS.Timeout | null = null;

/** Reads the DLQ file, retries each entry, and rewrites the file with only the ones that still failed. */
async function runOnce(): Promise<void> {
  const filePath = path.resolve(env.DLQ_FILE_PATH);

  try {
    await fs.access(filePath);
  } catch {
    return; // Nothing to sync yet.
  }

  let release: (() => Promise<void>) | undefined;
  try {
    release = await lockfile.lock(filePath, { retries: { retries: 5, minTimeout: 100 } });

    logger.debug({ filePath }, 'Acquired lock for DLQ sync run');
    const raw = await fs.readFile(filePath, 'utf-8');

    logger.debug({ rawLength: raw.length }, 'Read DLQ file contents');
    const entries: DlqEntry[] = raw ? JSON.parse(raw) : [];

    if (entries.length === 0) {
      logger.debug('No entries to sync in DLQ file');
      return;
    }

    logger.info({ count: entries.length }, 'Attempting to sync Dead Letter Queue entries');

    const stillFailing: DlqEntry[] = [];
    for (const entry of entries) {
      const ok = await dotNetApiClient.trySendRaw(entry);
      if (!ok) stillFailing.push(entry);
    }

    await fs.writeFile(filePath, JSON.stringify(stillFailing, null, 2), 'utf-8');

    logger.debug({ stillFailing: stillFailing.length }, 'DLQ sync run finished');
    logger.info(
      { synced: entries.length - stillFailing.length, remaining: stillFailing.length },
      'Dead Letter Queue sync finished',
    );
  } catch (err) {
    logger.error({ err }, 'DLQ sync run failed unexpectedly');
  } finally {
    if (release) await release();
  }
}

export function startDlqSync(): void {
  if (timer) return;
  timer = setInterval(() => {
    runOnce().catch((err) => logger.error({ err }, 'Unhandled error in DLQ sync interval'));
  }, env.DLQ_SYNC_INTERVAL_MS);
  timer.unref(); // don't keep the process alive just for this timer
  logger.info({ intervalMs: env.DLQ_SYNC_INTERVAL_MS }, 'DLQ sync scheduler started');
}

export function stopDlqSync(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// Exported for tests.
export const __testables = { runOnce };
