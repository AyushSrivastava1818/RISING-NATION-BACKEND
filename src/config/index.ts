import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_SECRET: z.string().min(1, 'SESSION_SECRET is required'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  S3_ENDPOINT: z.string().optional().default('https://s3.amazonaws.com'),
  S3_BUCKET: z.string().optional().default('risingnation-media'),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  YOUTUBE_API_KEY: z.string().optional().default(''),
  EMAIL_PROVIDER_API_KEY: z.string().optional().default(''),
  ADMIN_NOTIFICATION_EMAIL: z.string().email().optional().default('team@risingnation.org'),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional().default('admin@risingnation.org'),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12).optional().default('BootstrapAdminPassword123!'),
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
    console.error('Invalid environment configuration:', parsed.error.format());
    throw new Error('Environment variable validation failed');
  }

  return parsed.data;
}

export const config = loadConfig();
