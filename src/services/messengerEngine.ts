import { browserManager } from '../browser/browserManager';
import { dotNetApiClient } from './DotNetApiClient';
import { saveErrorScreenshot } from './screenshotService';
import { ActivityReporter } from './facebook/ActivityReporter';
import { FacebookMessenger, ChatboxIdentityMismatchError, AccountBlockedError, } from './facebook/FacebookMessenger';
import { randomDelayMs, sleep } from '../utils/humanTiming';
import type { StartJobPayload } from '../types';
import { logger } from '../utils/logger';

const MAX_RETRIES = 3;

export async function runMessagingJob(payload: StartJobPayload, correlationId: string): Promise<void> {
  logger.info({ jobId: payload.jobId, correlationId }, 'Starting runMessagingJob() in messengerEngine.ts');

  logger.info({ jobId: payload.jobId }, "Creating ActivityReporter for jobId: " + payload.jobId);
  const reporter = new ActivityReporter(correlationId);
  const { jobId, cookies, leads, accountId, botId } = payload;

  await reporter.report(payload.userId, botId, 'INFO', `Starting messaging job ${jobId} with ${leads.length} leads`);
  await dotNetApiClient.updateJobStatus(jobId, { status: 'Processing' });

  const context = await browserManager.newContext(cookies);
  let page;
  try {
    logger.info({ jobId: payload.jobId }, "Creating new page for jobId: " + payload.jobId);
    page = await context.newPage();
    const messenger = new FacebookMessenger(page, reporter, payload.userId);

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      let attempt = 0;
      let success = false;

      logger.info({ jobId: payload.jobId, leadId: lead.id }, `Processing lead ${lead.id} (${i + 1}/${leads.length})`);
      const isBlocked = await messenger.detectFacebookBlock(page);
      if (isBlocked) {
        logger.error({ jobId: payload.jobId, leadId: lead.id }, 'Account was flagged by Facebook. Aborting job.');
        await dotNetApiClient.updateAccountStatus(accountId, { status: 'AccountFlagged' });
        throw new AccountBlockedError('Account was flagged by Facebook. Job aborted.');
      }

      if (lead.status != 'Pending') continue;

      logger.info({ jobId: payload.jobId, leadId: lead.id }, `Attempting to send message to lead ${lead.id}`);
      while (attempt < MAX_RETRIES && !success) {
        attempt++;
        await reporter.report(payload.userId, botId, 'INFO', `[Attempt ${attempt}/${MAX_RETRIES}] Processing lead: ${lead.id}`);

        try {
          logger.info({ jobId: payload.jobId, leadId: lead.id }, `Sending message to lead ${lead.id} on attempt ${attempt}`);
          await messenger.sendMessageTo(lead.profileUrl, lead.profileName, lead.aiMessage, botId);

          logger.info({ jobId: payload.jobId, leadId: lead.id }, `Successfully sent message to lead ${lead.id} on attempt ${attempt}`);
          await dotNetApiClient.updateLeadStatus(lead.id, { status: 'Completed' });
          await reporter.report(payload.userId, botId, 'INFO', `Successfully sent message to lead ${lead.id}`);
          success = true;
        } catch (err) {
          logger.error({ jobId: payload.jobId, leadId: lead.id, err }, `Error sending message to lead ${lead.id} on attempt ${attempt}`);
          const error = err as Error;
          await reporter.report(payload.userId, botId, 'ERROR', `Error messaging lead ${lead.id} on attempt ${attempt}: ${error.message}`, error.stack);

          if (error instanceof ChatboxIdentityMismatchError) {
            logger.error({ jobId: payload.jobId, leadId: lead.id }, 'Chatbox identity mismatch detected. Aborting retries for this lead.');
            await reporter.report(payload.userId, botId, 'ERROR', `Identity mismatch for lead ${lead.id}, aborting retries for this lead.`);
            break;
          }

          if (attempt < MAX_RETRIES) {
            logger.info({ jobId: payload.jobId, leadId: lead.id }, `Waiting 15 seconds before retrying lead ${lead.id}...`);
            await reporter.report(payload.userId, botId, 'WARN', 'Waiting 15 seconds before retrying...');
            await sleep(15000);
          }
        }
      }

      if (!success) {
        logger.error({ jobId: payload.jobId, leadId: lead.id }, `All attempts failed for lead ${lead.id}. Marking as FAILED.`);

        const screenshotPath = await saveErrorScreenshot(page, jobId, lead.id);
        const errorMsg = `All attempts failed for lead ${lead.id}.`;
        await dotNetApiClient.updateLeadStatus(lead.id, { status: 'Failed' });
        await reporter.report(payload.userId, botId, 'ERROR', `${errorMsg}${screenshotPath ? ` (Screenshot: ${screenshotPath})` : ''}`);
      }

      if (i < leads.length - 1) {
        logger.info({ jobId: payload.jobId, leadId: lead.id }, `Waiting before processing next lead...`);
        const sleepTime = randomDelayMs(45000, 60000);
        await reporter.report(payload.userId, botId, 'INFO', `Waiting ${(sleepTime / 1000).toFixed(1)}s before next lead...`);
        await sleep(sleepTime);
      }
    }

    logger.info({ jobId: payload.jobId }, 'All leads processed. Marking job as COMPLETED.');
    await dotNetApiClient.updateJobStatus(jobId, { status: 'Completed' });
    await reporter.report(payload.userId, botId, 'INFO', 'Messaging job completed successfully');

  } catch (err) {
    logger.error({ jobId: payload.jobId, err }, 'Unhandled error in runMessagingJob()');
    const error = err as Error;
    await reporter.report(payload.userId, botId, 'ERROR', `Messaging job failed: ${error.message}`, error.stack);
    await dotNetApiClient.updateJobStatus(jobId, { status: 'Failed' });
  } finally {
    logger.info({ jobId: payload.jobId }, 'Cleaning up resources for runMessagingJob()');
    if (page) await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}
