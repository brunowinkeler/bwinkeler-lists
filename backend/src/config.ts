import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(8080),
  PUBLIC_ORIGIN: z.url(),
  PGHOST: z.string().min(1),
  PGPORT: z.coerce.number().int().positive().default(5432),
  PGDATABASE: z.string().min(1),
  PGUSER: z.string().min(1),
  PGPASSWORD: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().min(1).default('lists_sid'),
  CSRF_COOKIE_NAME: z.string().min(1).default('lists_csrf'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
  SESSION_SECRET: z.string().min(16),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

export type AppConfig = z.infer<typeof EnvSchema>;

/**
 * Loads and validates configuration from the environment. Never logs values;
 * on failure it reports only the offending variable names.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration. Check these variables: ${keys}`);
  }
  return parsed.data;
}

const DbEnvSchema = z.object({
  PGHOST: z.string().min(1),
  PGPORT: z.coerce.number().int().positive().default(5432),
  PGDATABASE: z.string().min(1),
  PGUSER: z.string().min(1),
  PGPASSWORD: z.string().min(1),
});

export type DbConfig = z.infer<typeof DbEnvSchema>;

/** Loads only the database connection variables (used by CLI/DB scripts). */
export function loadDbConfig(env: NodeJS.ProcessEnv = process.env): DbConfig {
  const parsed = DbEnvSchema.safeParse(env);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid database configuration. Check these variables: ${keys}`);
  }
  return parsed.data;
}
