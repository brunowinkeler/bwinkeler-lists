import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export interface DbConnectionConfig {
  PGHOST: string;
  PGPORT: number;
  PGDATABASE: string;
  PGUSER: string;
  PGPASSWORD: string;
}

export type Database = ReturnType<typeof createDatabase>['db'];

export function createPool(config: DbConnectionConfig): pg.Pool {
  return new pg.Pool({
    host: config.PGHOST,
    port: config.PGPORT,
    database: config.PGDATABASE,
    user: config.PGUSER,
    password: config.PGPASSWORD,
    max: 10,
  });
}

export function createDatabase(config: DbConnectionConfig) {
  const pool = createPool(config);
  const db = drizzle(pool, { schema });
  return { pool, db };
}

/**
 * Waits for the database to accept connections, retrying with capped
 * exponential backoff so startup tolerates a briefly unavailable PostgreSQL.
 */
export async function waitForDatabase(
  pool: pg.Pool,
  options: { retries?: number; baseDelayMs?: number } = {},
): Promise<void> {
  const retries = options.retries ?? 10;
  const baseDelayMs = options.baseDelayMs ?? 500;
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await pool.query('select 1');
      return;
    } catch (error) {
      lastError = error;
      const delay = Math.min(baseDelayMs * 2 ** attempt, 10_000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(`Database not reachable after ${retries} attempts: ${String(lastError)}`);
}
