import { chromium as chromiumExtra } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, BrowserContext } from 'playwright';
import { logger } from '../utils/logger';
import type { WorkerCookie } from '../types';

/**
 * NOTE ON STEALTH COMPATIBILITY:
 * puppeteer-extra-plugin-stealth was built for Puppeteer. playwright-extra
 * adapts it, but not every individual evasion is guaranteed to work 1:1 on
 * Playwright, and detection systems (LinkedIn, Facebook, etc.) evolve
 * constantly. Treat this as "best effort", re-verify periodically (see
 * src/tests for a basic navigator.webdriver smoke check), and consider
 * `patchright` as a fallback if a target platform starts detecting us again.
 */
chromiumExtra.use(StealthPlugin());

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
];

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Owns exactly one Chromium Browser process for the whole app.
 * Each job gets its own isolated BrowserContext (cookies, cache, etc. are
 * NOT shared between jobs), created and destroyed per-job.
 */
class BrowserManager {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  async initialize(): Promise<void> {
    await this.getBrowser();
    logger.info('Browser manager initialized');
  }

  /** Returns the singleton browser, launching it on first use if needed. */
  private async getBrowser(): Promise<Browser> {
    logger.debug('BrowserManager.getBrowser() called');
    
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    // Avoid a race where multiple concurrent callers each try to launch.
    if (this.launching) {
      return this.launching;
    }

    this.launching = chromiumExtra.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    }) as unknown as Promise<Browser>;

    try {
      this.browser = await this.launching;

      this.browser.on('disconnected', () => {
        logger.warn('Browser process disconnected unexpectedly');
        this.browser = null;
      });

      return this.browser;
    } finally {
      this.launching = null;
    }
  }

  /**
   * Opens a fresh, isolated context and injects cookies into it.
   * Cookies live in memory only for the lifetime of this context and are
   * never written to disk. Caller is responsible for calling
   * context.close() when the job is done.
   */
  async newContext(cookies: WorkerCookie[] = []): Promise<BrowserContext> {
    const browser = await this.getBrowser();

    const context = await browser.newContext({
      userAgent: pickRandom(USER_AGENTS),
      viewport: pickRandom(VIEWPORTS),
      locale: 'en-US',
    });

    if (cookies.length > 0) {
      const playwrightCookies = cookies.map(c => {
        let sameSite: 'Strict' | 'Lax' | 'None' | undefined = undefined;
        if (c.sameSite) {
          const s = c.sameSite.toLowerCase();
          if (s === 'strict') sameSite = 'Strict';
          else if (s === 'lax') sameSite = 'Lax';
          else if (s === 'none' || s === 'no_restriction' || s === 'unspecified') sameSite = 'None';
        }
        return {
          name: c.name,
          value: c.value,
          url: c.url as string | undefined,
          domain: c.domain,
          path: c.path,
          expires: c.expires,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite
        };
      });
      await context.addCookies(playwrightCookies);
    }

    return context;
  }

  /** Health check used by GET /api/worker/health. */
  isHealthy(): boolean {
    return !!this.browser?.isConnected();
  }

  /** Force-restarts the browser process. Used when health check fails. */
  async restart(): Promise<void> {
    logger.warn('Restarting browser manager');
    try {
      if (this.launching) {
        const browser = await this.launching;
        await browser.close();
      } else if (this.browser) {
        await this.browser.close();
      }
    } catch (err) {
      logger.warn({ err }, 'Error closing stale browser during restart (ignored)');
    }
    this.browser = null;
    this.launching = null;
    await this.getBrowser();
    logger.info('Browser manager restarted successfully');
  }

  async shutdown(): Promise<void> {
    try {
      if (this.launching) {
        logger.info('Closing launching browser manager');
        const browser = await this.launching;
        await browser.close();
      } else if (this.browser) {
        logger.info('Closing browser manager');
        await this.browser.close();
      }
    } catch (err) {
      logger.warn({ err }, 'Error closing browser during shutdown');
    } finally {
      this.browser = null;
      this.launching = null;
    }
  }
}

export const browserManager = new BrowserManager();
