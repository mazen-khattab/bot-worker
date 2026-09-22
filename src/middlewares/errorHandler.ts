import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled request error');

  if (res.headersSent) {
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}
