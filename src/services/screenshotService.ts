import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env';
import type { Page } from 'playwright';

export async function saveErrorScreenshot(
  page: Page,
  jobId: number,
  leadId: number,
): Promise<string | undefined> {
  try {
    await fs.mkdir(env.SCREENSHOT_DIR, { recursive: true });
    const fileName = `error_${jobId}_${leadId}_${Date.now()}.png`;
    const filePath = path.join(env.SCREENSHOT_DIR, fileName);
    await page.screenshot({ path: filePath });
    return filePath;
  } catch {
    return undefined;
  }
}
