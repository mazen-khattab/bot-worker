/** A single lead/target profile to message. */
export interface Lead {
  id: number;
  profileUrl: string;
  profileName: string;
  aiMessage: string;
  status: string;
}

/** Cookie shape Playwright's context.addCookies() expects. */
export interface WorkerCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None' | 'no_restriction' | 'lax' | 'strict' | 'none' | 'unspecified';
  [key: string]: unknown;
}

/** Payload the .NET backend sends to POST /api/worker/dispatch-messaging */
export interface StartJobPayload {
  jobId: number;
  userId: string;
  accountId: number;
  botId: number;
  correlationId?: string;
  cookies: WorkerCookie[];
  leads: Lead[];
}

export type LeadStatus = 'Pending' | 'Completed' | 'Failed';
export type JobStatus = 'Pending' | 'Processing' | 'Completed' | 'Failed';

export interface JobStatusResult {
  jobId: number;
  status: JobStatus | 'not_found';
  found: boolean;
  message?: string;
}

export type AccountStatus = 'Active' | 'Busy' | 'CoolingDown' | 'AccountFlagged' | 'Banned';
export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

/** Body sent back to the .NET backend for per-lead progress. */
export interface LeadStatusUpdate {
  status: LeadStatus;
}

/** Body sent back to the .NET backend for overall job progress. */
export interface JobStatusUpdate {
  status: JobStatus;
}

/** Body sent back to the .NET backend for free-form activity logs. */
export interface ActivityLogEntry {
  correlationId: string;
  userId: string;
  botId: number;
  logLevel: LogLevel;
  message: string;
  stackTrace?: string;
}

/** Body sent back to the .NET backend for account status. */
export interface AccountStatusUpdate {
  status: AccountStatus;
}

export type HttpMethod = 'POST' | 'PUT';

export interface DlqEntry {
  id: string;
  url: string;
  method: HttpMethod;
  payload: unknown;
  failedAt: string;
}

export interface IDotNetApiClient {
  updateLeadStatus(id: number, update: LeadStatusUpdate): Promise<void>;
  updateJobStatus(id: number, update: JobStatusUpdate): Promise<void>;
  updateAccountStatus(id: number, update: AccountStatusUpdate): Promise<void>;
  logActivity(entry: ActivityLogEntry): Promise<void>;
  trySendRaw(entry: Pick<DlqEntry, 'method' | 'url' | 'payload'>): Promise<boolean>;
}
