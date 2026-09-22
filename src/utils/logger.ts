import pino from 'pino';
import { env } from '../config/env';

/**
 * Base logger.
 * - Pretty, colorized output in development.
 * - Plain JSON in production (so it can be ingested by log collectors).
 */
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG',
  transport:
    env.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
});

/**
 * Returns a child logger that automatically stamps every log line with the
 * given correlationId, so a job's whole lifecycle (queue -> browser -> .NET
 * callbacks) can be traced with a single grep/query.
 */
export function createChildLogger(correlationId: string) {
  return logger.child({ correlationId });
}

export type AppLogger = ReturnType<typeof createChildLogger>;
