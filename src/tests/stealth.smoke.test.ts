import { describe, it, expect } from 'vitest';
import { browserManager } from '../browser/browserManager';

/**
 * This test actually launches a real browser, so it's slower and is meant
 * to be run occasionally / in CI, not on every save. It's a basic
 * regression check: if a Playwright or stealth-plugin upgrade breaks the
 * evasion, this will catch the most obvious symptom.
 *
 * Run explicitly with: npm run test:browser
 */
describe('stealth evasion smoke check', () => {
  it('hides navigator.webdriver', async () => {
    await browserManager.initialize();
    const context = await browserManager.newContext();
    const page = await context.newPage();

    await page.goto('about:blank');
    const webdriver = await page.evaluate(() => (navigator as unknown as { webdriver?: boolean }).webdriver);

    expect(webdriver).toBeFalsy();

    await context.close();
    await browserManager.shutdown();
  }, 30_000);
});
