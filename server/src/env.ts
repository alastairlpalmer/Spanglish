import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  APP_PASSCODE: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  DAILY_TOKEN_BUDGET: z.coerce.number().int().positive().default(2_000_000),
  AI_MOCK: z.string().optional(),
  PORT: z.coerce.number().int().default(3000),
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  /** Mock AI when explicitly requested or when no key exists. */
  aiMock: parsed.AI_MOCK === '1' || !parsed.ANTHROPIC_API_KEY,
  /** Dev auth (Bearer dev) allowed only when no passcode is configured. */
  devAuth: !parsed.APP_PASSCODE || !parsed.AUTH_SECRET,
  hasDb: Boolean(parsed.DATABASE_URL),
};

export const APP_USER_ID = '00000000-0000-4000-8000-000000000001';
