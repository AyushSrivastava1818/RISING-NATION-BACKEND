import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * Matches ENGINEERING.md §6.9 exactly. "Required: Yes" columns have no
 * fallback default here — a missing value must fail validation, not silently
 * substitute a default that masks a misconfigured deployment. Only the two
 * variables the table itself marks non-`Yes` get a default:
 *   - RATE_LIMIT_* ("No (sane default)")
 *   - SENTRY_DSN ("Recommended", not required)
 * `ADMIN_BOOTSTRAP_EMAIL`/`ADMIN_BOOTSTRAP_PASSWORD` are "First deploy only" —
 * required for the seed script's own run (enforced in
 * scripts/admin-bootstrap.ts), not for every server boot, since §6.9 also
 * says these should be rotated/removed after first use.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production'], {
    errorMap: () => ({ message: 'NODE_ENV is required and must be one of development|test|production' }),
  }),
  PORT: z.coerce.number({ required_error: 'PORT is required' }).int().positive(),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_SECRET: z.string().min(1, 'SESSION_SECRET is required'),
  FRONTEND_URL: z.string().min(1, 'FRONTEND_URL is required'),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required'),
  S3_ENDPOINT: z.string().min(1, 'S3_ENDPOINT is required'),
  S3_REGION: z.string().optional().default('us-east-1'),
  S3_BUCKET: z.string().min(1, 'S3_BUCKET is required'),
  S3_ACCESS_KEY_ID: z.string().min(1, 'S3_ACCESS_KEY_ID is required'),
  S3_SECRET_ACCESS_KEY: z.string().min(1, 'S3_SECRET_ACCESS_KEY is required'),
  YOUTUBE_API_KEY: z.string().min(1, 'YOUTUBE_API_KEY is required'),
  EMAIL_PROVIDER_API_KEY: z.string().min(1, 'EMAIL_PROVIDER_API_KEY is required'),
  ADMIN_NOTIFICATION_EMAIL: z.string().email('ADMIN_NOTIFICATION_EMAIL is required and must be a valid email'),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12).optional(),
  RATE_LIMIT_PUBLIC_SUBMISSION_MAX: z.coerce.number().default(10),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().default(5),
  SENTRY_DSN: z.string().optional().default(''),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(overrides: Partial<Record<keyof Config, string>> = {}): Config {
  const rawEnv = {
    ...process.env,
    ...overrides,
  };

  const parsed = envSchema.safeParse(rawEnv);

  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    console.error('Invalid environment configuration (ENGINEERING.md §6.9):');
    for (const line of missing) console.error(`  - ${line}`);
    throw new Error('Environment variable validation failed — see errors above');
  }

  return parsed.data;
}

// Evaluated at module import time (before the HTTP server starts listening)
// so a misconfigured environment fails startup immediately — never on the
// first request/job that happens to touch the missing variable.
export const config = loadConfig();
