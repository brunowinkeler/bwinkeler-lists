import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase, waitForDatabase } from './db/client.js';

async function start(): Promise<void> {
  const config = loadConfig();
  const { pool, db } = createDatabase(config);
  await waitForDatabase(pool);
  const app = await buildApp(config, db);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutting down');
    try {
      await app.close();
      await pool.end();
      process.exit(0);
    } catch (error) {
      app.log.error(error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  await app.listen({ host: config.HOST, port: config.PORT });
}

start().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
