import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { getSessionUser } from '../../auth/guards.js';
import { notifications } from '../../db/schema.js';
import { listNotifications } from './service.js';

export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;

  app.get('/notifications', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    return reply.send({ notifications: await listNotifications(db, user.id) });
  });

  app.post<{ Params: { id: string } }>('/notifications/:id/read', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, request.params.id), eq(notifications.userId, user.id)));
    return reply.code(204).send();
  });
}
