import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health/live', async () => ({ status: 'live' }));

  app.get('/health/ready', async (_request, reply) => {
    try {
      await app.db.execute(sql`select 1`);
      return await reply.send({ status: 'ready' });
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
}
