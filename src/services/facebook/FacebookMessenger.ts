import type { Page, Locator } from 'playwright';
import { randomDelayMs, sleep } from '../../utils/humanTiming';
import { facebookSelectors } from './facebookSelectors';
import { ActivityReporter } from './ActivityReporter';
import { logger } from '../../utils/logger';

export class ChatboxIdentityMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatboxIdentityMismatchError';
  }
}

export class AccountBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountBlockedError';
  }
}

export class FacebookMessenger {
  constructor(
    private readonly page: Page,
    private readonly reporter: ActivityReporter,
    private readonly userId: string,
  ) { }

  async detectFacebookBlock(page: Page): Promise<boolean> {
    logger.debug('FacebookMessenger.detectFacebookBlock() called');
    const currentUrl = page.url();

    // 1. URL Check
    if (currentUrl.includes('checkpoint') || currentUrl.includes('/help/contact')) {
      logger.warn('Facebook block detected via URL check');
      return true;
    }

    // 2. Text Check (Searching for specific keywords)
    const pageText = await page.locator('body').innerText();

    for (const keyword of facebookSelectors.blockKeywords) {
      if (pageText.includes(keyword)) {
        logger.warn(`Facebook block detected via keyword match: ${keyword}`);
        return true;
      }
    }

    // 3. Captcha Check
    const captchaVisible = await page.locator('iframe[src*="recaptcha"], iframe[src*="captcha"]').count();
    if (captchaVisible > 0) {
      logger.warn('Facebook block detected via captcha check');
      return true;
    }

    return false;
  }

  async sendMessageTo(profileUrl: string, profileName: string, messageText: string): Promise<void> {
    logger.debug({ profileUrl, profileName }, 'FacebookMessenger.sendMessageTo() called');
    logger.info({ profileUrl, profileName }, `Sending message to ${profileName} at ${profileUrl}`);
    
    await this.navigateToProfile(profileUrl);
    await this.humanInteraction();
    const chatbox = await this.openVerifiedChatbox(profileName);
    await this.typeMessageHumanLike(chatbox, messageText);
    await this.submitMessage();
    await this.closeChatWindow();
  }

  private async navigateToProfile(profileUrl: string): Promise<void> {
    logger.debug({ profileUrl }, 'FacebookMessenger.navigateToProfile() called');
    await this.reporter.report(this.userId, 'INFO', `Navigating to profile: ${profileUrl}`);
    await this.page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }

  private async humanInteraction() {
    logger.debug('FacebookMessenger.humanInteraction() called');
    await this.page.mouse.wheel(0, Math.floor(Math.random() * 400) + 100);
    await sleep(randomDelayMs(1000, 2000));

    await this.page.mouse.move(
      Math.floor(Math.random() * 500) + 100,
      Math.floor(Math.random() * 500) + 100
    );
  }

  private async openVerifiedChatbox(profileName: string): Promise<Locator> {
    logger.debug({ profileName }, 'FacebookMessenger.openVerifiedChatbox() called');
    const messageButton = this.page.locator(facebookSelectors.messageButton).first();
    await messageButton.waitFor({ state: 'visible', timeout: 15000 });

    let clickAttempts = 0;
    while (clickAttempts < 4) {
      clickAttempts++;
      await this.clickWithEscalatingForce(messageButton, clickAttempts);
      await sleep(randomDelayMs(3000, 4000));

      const chatbox = await this.findChatboxForProfile(profileName);
      if (chatbox) {
        logger.info({ profileName }, `${profileName}'s messenger box has opened successfully`);
        await this.reporter.report(this.userId, 'INFO', `${profileName}'s messenger box has opened successfully`);
        return chatbox;
      } else {
        logger.warn({ profileName }, 'Detected a hanging chatbox from a previous profile or wrong user. Cleaning up...');
        await this.reporter.report(this.userId, 'WARN', 'Detected a hanging chatbox from a previous profile or wrong user. Cleaning up...');
        const closeButton = this.page.locator(facebookSelectors.chatCloseButton).first();
        if (await closeButton.isVisible()) {
          await closeButton.click();
          await sleep(2000);
        }
      }
    }

    logger.error({ profileName }, `Could not isolate the correct chatbox for "${profileName}".`);
    throw new ChatboxIdentityMismatchError(`Could not isolate the correct chatbox for "${profileName}".`);
  }

  private async clickWithEscalatingForce(button: Locator, attempt: number): Promise<void> {
    logger.debug({ attempt }, 'FacebookMessenger.clickWithEscalatingForce() called');
    await this.reporter.report(this.userId, 'INFO', `Pressing message button... (Attempt: ${attempt})`);
    if (attempt === 1) {
      await button.click();
    } else if (attempt === 2) {
      await button.click({ force: true });
    } else {
      await button.evaluate((el: HTMLElement) => el.click());
    }
  }

  private async findChatboxForProfile(profileName: string): Promise<Locator | null> {
    logger.debug({ profileName }, 'FacebookMessenger.findChatboxForProfile() called');
    const boxes = this.page.locator(facebookSelectors.textboxRole);
    const count = await boxes.count();

    for (let i = 0; i < count; i++) {
      const box = boxes.nth(i);
      const ariaLabel = (await box.getAttribute('aria-label')) || '';

      const isTargetMatch = ariaLabel.toLowerCase().includes(profileName.toLowerCase());
      const hasCorrectPrefix = facebookSelectors.composeBoxPrefixes.some(prefix => ariaLabel.startsWith(prefix));

      if (isTargetMatch && hasCorrectPrefix) {
        logger.debug({ profileName, ariaLabel }, 'Chatbox match found');
        return box;
      }
    }
    logger.debug({ profileName }, 'No chatbox match found');
    return null;
  }

  private async typeMessageHumanLike(chatbox: Locator, text: string): Promise<void> {
    logger.debug('FacebookMessenger.typeMessageHumanLike() called');
    await chatbox.focus();
    await this.reporter.report(this.userId, 'INFO', 'Writing human-like message...');
    for (const char of text) {
      await this.page.keyboard.type(char);
      await sleep(randomDelayMs(80, 200));
    }
  }

  private async submitMessage(): Promise<void> {
    logger.debug('FacebookMessenger.submitMessage() called');
    await this.page.keyboard.press('Enter');
    await sleep(randomDelayMs(8000, 10000));
  }

  private async closeChatWindow(): Promise<void> {
    logger.debug('FacebookMessenger.closeChatWindow() called');
    await this.reporter.report(this.userId, 'INFO', 'Starting strict cleanup to close the chat window...');
    const closeButton = this.page.locator(facebookSelectors.chatCloseButton).first();

    try {
      await closeButton.waitFor({ state: 'visible', timeout: 5000 });
      await closeButton.evaluate((el: HTMLElement) => el.click());
      logger.info('Chat window successfully closed and cleaned from DOM.');
      await this.reporter.report(this.userId, 'INFO', 'Chat window successfully closed and cleaned from DOM.');
      await sleep(2000);
    } catch {
      logger.warn("Close button didn't appear within 5s. Executing fallback page reload...");
      await this.reporter.report(this.userId, 'WARN', "Close button didn't appear within 5s. Executing fallback page reload...");
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      logger.info('Page reloaded successfully to clear any hanging chat windows.');
      await this.reporter.report(this.userId, 'INFO', 'Page reloaded successfully to clear any hanging chat windows.');
      await sleep(3000);
    }
  }
}
