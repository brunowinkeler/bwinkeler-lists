import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadConfig } from '../config.js';
import { createDatabase, waitForDatabase } from './client.js';

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

async function main(): Promise<void> {
  const config = loadConfig();
  const { pool, db } = createDatabase(config);
  await waitForDatabase(pool);
  await migrate(db, { migrationsFolder });
  await pool.end();
  console.log('Migrations applied.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
