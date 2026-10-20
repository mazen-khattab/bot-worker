import 'dotenv/config';
import { z } from 'zod';

/**
 * Schema for every environment variable this service needs.
 * If anything is missing or malformed, the process fails fast at startup
 * instead of crashing later, mid-job, in a much harder-to-debug place.
 */
const envSchema = z.object({
  // Nginx connects locally. Containers override this with 0.0.0.0.
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  WORKER_API_KEY: z.string().min(16, 'WORKER_API_KEY must be at least 16 characters'),

  DOTNET_API_URL: z.string().url(),
  DOTNET_API_KEY: z.string().min(1),

  MAX_CONCURRENT_SESSIONS: z.coerce.number().int().positive().default(3),

  IDEMPOTENCY_TTL_HOURS: z.coerce.number().positive().default(24),

  DLQ_FILE_PATH: z.string().default('./data/dlq.json'),
  DLQ_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),

  SCREENSHOT_DIR: z.string().default('./screenshots'),
  SCREENSHOT_RETENTION_DAYS: z.coerce.number().positive().default(7),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    // Intentionally use console here: the logger depends on env being valid,
    // so we can't rely on it yet.
    // eslint-disable-next-line no-console
    console.error('❌ Invalid environment configuration:');
    // eslint-disable-next-line no-console
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
