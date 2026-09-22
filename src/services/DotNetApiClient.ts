import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import https from 'https';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { dlqStorageService } from './DlqStorageService';
import type { LeadStatusUpdate, JobStatusUpdate, ActivityLogEntry, AccountStatusUpdate, DlqEntry, HttpMethod, IDotNetApiClient } from '../types';

export class DotNetApiClient implements IDotNetApiClient {
  private readonly http: AxiosInstance;

  constructor(private readonly dlq = dlqStorageService) {
    this.http = axios.create({
      baseURL: env.DOTNET_API_URL,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      }),
      timeout: 5_000,
      headers: {
        'X-Worker-Api-Key': env.DOTNET_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    axiosRetry(this.http, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) =>
        axiosRetry.isNetworkOrIdempotentRequestError(error) ||
        (error.response?.status ?? 0) >= 500,
    });
  }

  async updateLeadStatus(id: number, update: LeadStatusUpdate): Promise<void> {
    await this.sendOrQueue('PUT', `/api/v1/worker/leads/${id}/status`, update);
  }

  async updateJobStatus(id: number, update: JobStatusUpdate): Promise<void> {
    await this.sendOrQueue('PUT', `/api/v1/worker/jobs/${id}/status`, update);
  }

  async updateAccountStatus(id: number, update: AccountStatusUpdate): Promise<void> {
    await this.sendOrQueue('PUT', `/api/v1/worker/accounts/${id}/status`, update);
  }

  async logActivity(entry: ActivityLogEntry): Promise<void> {
    await this.sendOrQueue('POST', `/api/v1/worker/activity-log`, entry);
  }

  async trySendRaw(entry: Pick<DlqEntry, 'method' | 'url' | 'payload'>): Promise<boolean> {
    logger.info({ method: entry.method, url: entry.url, payload: entry.payload }, 'Retrying DLQ entry');
    
    try {
      await this.http.request({
        method: entry.method,
        url: entry.url,
        data: entry.payload,
      });
      return true;
    } catch (err) {
      logger.warn({ err: (err as any)?.response?.data ?? err, url: entry.url }, 'DLQ retry attempt failed, will retry later');
      return false;
    }
  }

  private async sendOrQueue(method: HttpMethod, url: string, payload: unknown): Promise<void> {
    logger.info({ method, url, payload }, 'Sending request to .NET API');
    try {
      await this.http.request({
        method,
        url,
        data: payload,
      });
    } catch (err) {
      logger.error(
        { err: (err as any)?.response?.data ?? err, url: url, payload },
        'Failed to reach .NET API after retries, saving to Dead Letter Queue',
      );
      await this.dlq.append({ method, url, payload });
    }
  }
}

export const dotNetApiClient = new DotNetApiClient();