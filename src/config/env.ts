import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('4000'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CORS_ORIGIN: z.string().default('*'),
  EVOLUTION_API_BASE_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().min(1).optional(),
  // SMTP (opcional no boot; validado em runtime na rota de forgot-password)
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.string().default('587'),
  SMTP_SECURE: z.string().default('false'),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(1).optional(),
  // App (opcional no boot; validado em runtime na rota de forgot-password)
  APP_URL: z.string().url().optional(),
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  CORS_ORIGINS:
    parsedEnv.CORS_ORIGIN === '*'
      ? '*'
      : parsedEnv.CORS_ORIGIN
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
};

export function isForgotPasswordEmailConfigured() {
  return Boolean(
    env.SMTP_HOST
    && env.SMTP_USER
    && env.SMTP_PASS
    && env.SMTP_FROM
    && env.APP_URL,
  );
}
