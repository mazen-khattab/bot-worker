import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { browserManager } from '../browser/browserManager';
import { enqueueJob, getQueueStats, getJobStatus } from '../queue/jobQueue';
import { runMessagingJob } from '../services/messengerEngine';
import { logger } from '../utils/logger';
import type { StartJobPayload } from '../types';

const router = Router();

const jobIdSchema = z.coerce.number().int().positive();

const cookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string(),
  expires: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(['Strict', 'Lax', 'None', 'no_restriction', 'lax', 'strict', 'none', 'unspecified']).optional(),
}).passthrough();

const startJobSchema = z.object({
  jobId: z.number().min(1),
  userId: z.string().min(1),
  botId: z.number().min(1),
  accountId: z.number().min(1),
  correlationId: z.string().optional(),
  cookies: z.array(cookieSchema),
  leads: z.array(
    z.object({
      id: z.number().min(1),
      profileUrl: z.string().url(),
      profileName: z.string(),
      aiMessage: z.string().min(1),
      status: z.string().min(1),
    }),
  ),
});

/**
 * GET /api/worker/health
 * Reports process + browser health. If the browser process has died,
 * transparently attempts to restart it before answering.
 */
router.get('/health', async (_req, res) => {
  logger.info('Health check requested');

  if (!browserManager.isHealthy()) {
    logger.warn('Health check found browser disconnected — attempting restart');
    try {
      await browserManager.restart();
    } catch (err) {
      logger.error({ err }, 'Browser restart failed during health check');
      res.status(503).json({ status: 'unhealthy', browser: 'down', queue: getQueueStats() });
      return;
    }
  }

  res.status(200).json({ status: 'ok', browser: 'connected', queue: getQueueStats() });
});

/**
 * POST /api/worker/start
 * Validates the payload, de-duplicates by jobId, enqueues the job for
 * background execution (respecting MAX_CONCURRENT_SESSIONS), and returns
 * immediately — mirroring a fire-and-forget Task.Run in C#.
 */
router.post('/dispatch-messaging', (req, res) => {
  logger.info('Received job dispatch request in routes/index.ts');

  const parsedCookies = JSON.parse(req.body.cookies);
  logger.info('Parsed cookies from request body');

  req.body.cookies = parsedCookies;
  const parsed = startJobSchema.safeParse(req.body);

  if (!parsed.success) {
    logger.warn({ error: parsed.error.flatten() }, 'Invalid job dispatch request');
    res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    return;
  }

  logger.info({ jobId: parsed.data.jobId }, 'Enqueuing job for background execution');

  const payload: StartJobPayload = parsed.data;
  const correlationId = payload.correlationId ?? crypto.randomUUID();

  const result = enqueueJob(payload, correlationId, runMessagingJob);

  if (result === 'duplicate') {
    logger.info({ jobId: payload.jobId }, 'Ignored duplicate job submission (idempotency)');
    res.status(200).json({ status: 'duplicate_ignored', jobId: payload.jobId, correlationId });
    return;
  }

  res.status(200).json({ status: 'queued', jobId: payload.jobId, correlationId });
});


/**
 * GET /api/worker/jobs/:jobId/status
 * Returns the current status of a job.
 */
router.get('/jobs/:jobId/status', (req, res) => {
  const parsed = jobIdSchema.safeParse(req.params.jobId);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid jobId', details: parsed.error.flatten() });
    return;
  }

  const jobId = parsed.data;
  const result = getJobStatus(jobId);

  if (result.found) {
    res.status(200).json(result);
  } else {
    res.status(404).json(result);
  }
});

export default router;
