import { env } from './config/env';
import { logger } from './utils/logger';
import { createApp } from './app';
import { browserManager } from './browser/browserManager';
import { drainQueue } from './queue/jobQueue';
import { startDlqSync, stopDlqSync } from './services/dlqSync';
import { startScreenshotCleanup, stopScreenshotCleanup } from './services/screenshotCleanup';

async function main() {
  await browserManager.initialize();
  startDlqSync();
  startScreenshotCleanup();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV, url: env.DOTNET_API_URL }, 'bot-worker listening');
  });

  let shuttingDown = false;

  /**
   * Handles both SIGTERM and SIGINT identically. This matters for PM2:
   * PM2 sends SIGINT by default on `pm2 restart`/reload, and SIGTERM (or a
   * custom signal) on `pm2 stop`/delete — either way we must drain cleanly.
   * Make sure ecosystem.config.js's kill_timeout is >= the worst-case time
   * this whole sequence can take, or PM2 will force-kill mid-shutdown.
   */
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Shutdown signal received, starting graceful shutdown');

    // 1. Stop accepting new HTTP connections.
    server.close(() => logger.info('HTTP server closed'));

    // 2. Stop background timers.
    stopDlqSync();
    stopScreenshotCleanup();

    // 3. Stop accepting new jobs and wait for in-flight ones to finish.
    await drainQueue();

    // 4. Close the browser last, once nothing needs it anymore.
    await browserManager.shutdown();

    logger.info('Graceful shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup');
  process.exit(1);
});
