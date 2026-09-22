import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
let timer: NodeJS.Timeout | null = null;

async function runOnce(): Promise<void> {
  const dir = path.resolve(env.SCREENSHOT_DIR);

  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return; // Directory doesn't exist yet — nothing to clean.
  }

  const maxAgeMs = env.SCREENSHOT_RETENTION_DAYS * ONE_DAY_MS;
  const now = Date.now();
  let removed = 0;

  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const stats = await fs.stat(filePath);
      if (now - stats.mtimeMs > maxAgeMs) {
        await fs.unlink(filePath);
        removed++;
      }
    } catch (err) {
      logger.warn({ err, filePath }, 'Failed to inspect/remove screenshot during cleanup');
    }
  }

  if (removed > 0) {
    logger.info({ removed }, 'Cleaned up old error screenshots');
  }
}

export function startScreenshotCleanup(): void {
  if (timer) return;
  // Daily is enough for a retention window measured in days.
  timer = setInterval(() => {
    runOnce().catch((err) => logger.error({ err }, 'Unhandled error in screenshot cleanup'));
  }, ONE_DAY_MS);
  timer.unref();
  logger.info('Screenshot cleanup scheduler started');
}

export function stopScreenshotCleanup(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export const __testables = { runOnce };
