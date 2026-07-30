import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.PGHOST ?? '127.0.0.1',
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? 'lists_dev',
    user: process.env.PGUSER ?? 'lists_dev',
    password: process.env.PGPASSWORD ?? 'change-me-in-dev',
    ssl: false,
  },
  strict: true,
  verbose: true,
});
