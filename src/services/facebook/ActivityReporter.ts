import { logger } from '../../utils/logger';
import { dotNetApiClient } from '../DotNetApiClient';
import type { LogLevel } from '../../types';

// ...existing code...
export class ActivityReporter {
  constructor(private readonly correlationId: string) { }

  async report(userId: string, logLevel: LogLevel, message: string, stackTrace?: string): Promise<void> {
    const loggerLevel = logLevel.toLowerCase() as Lowercase<LogLevel>;

    logger[loggerLevel]({ correlationId: this.correlationId, stackTrace }, message);

    await dotNetApiClient.logActivity({
      correlationId: this.correlationId,
      userId,
      logLevel,
      message,
      stackTrace,
    });
  }
}
