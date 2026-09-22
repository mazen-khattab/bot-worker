import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

/**
 * Verifies the X-Worker-Api-Key header against WORKER_API_KEY using a
 * timing-safe comparison, to avoid leaking key information via response
 * timing (a naive `===` comparison short-circuits on the first mismatched
 * byte, which is measurable over many requests).
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const provided = req.header('x-worker-api-key') ?? '';
  const expected = env.WORKER_API_KEY;

  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);

  // Buffers must be equal length for timingSafeEqual; pad/compare length first
  // in a way that still avoids a fast reject on obviously-wrong input length
  // being informative (length mismatch alone isn't very sensitive here).
  const isValid =
    providedBuf.length === expectedBuf.length &&
    crypto.timingSafeEqual(providedBuf, expectedBuf);

  if (!isValid) {
    res.status(401).json({ error: 'Unauthorized: invalid or missing x-worker-api-key' });
    return;
  }

  next();
}
