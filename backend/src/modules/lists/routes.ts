import type { FastifyInstance } from 'fastify';
import { and, asc, eq, sql } from 'drizzle-orm';
import {
  createListInputSchema,
  duplicateListInputSchema,
  pinListInputSchema,
  renameListInputSchema,
} from '@bwinkeler-lists/shared';
import { getSessionUser } from '../../auth/guards.js';
import { getListRole } from '../../authz.js';
import { writeAudit } from '../../audit.js';
import { listMembers, lists } from '../../db/schema.js';
import { duplicateList, loadListDetail, toListSummary } from './service.js';

export async function registerListRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;

  app.get('/lists', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const rows = await db
      .select({ list: lists, role: listMembers.role, pinned: listMembers.pinned })
      .from(listMembers)
      .innerJoin(lists, eq(lists.id, listMembers.listId))
      .where(eq(listMembers.userId, user.id))
      .orderBy(asc(lists.createdAt));
    return reply.send({
      lists: rows.map((row) => toListSummary(row.list, row.role, row.pinned)),
    });
  });

  app.post('/lists', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const parsed = createListInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid request' });
    const { name, kind } = parsed.data;
    const list = await db.transaction(async (tx) => {
      const rows = await tx.insert(lists).values({ ownerId: user.id, name, kind }).returning();
      const created = rows[0];
      if (!created) throw new Error('Failed to create list');
      await tx.insert(listMembers).values({ listId: created.id, userId: user.id, role: 'owner' });
      return created;
    });
    return reply.code(201).send({ list: toListSummary(list, 'owner') });
  });

  app.post<{ Params: { id: string } }>('/lists/:id/duplicate', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const role = await getListRole(db, request.params.id, user.id);
    if (!role) return reply.code(404).send({ error: 'List not found' });
    const parsed = duplicateListInputSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid request' });
    const summary = await duplicateList(db, request.params.id, user.id, {
      name: parsed.data.name,
      includeCompleted: parsed.data.includeCompleted,
      resetCompleted: parsed.data.resetCompleted,
    });
    if (!summary) return reply.code(404).send({ error: 'List not found' });
    await writeAudit(db, {
      actorId: user.id,
      action: 'list.duplicate',
      targetType: 'list',
      targetId: request.params.id,
    });
    return reply.code(201).send({ list: summary });
  });

  app.get<{ Params: { id: string } }>('/lists/:id', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const role = await getListRole(db, request.params.id, user.id);
    if (!role) return reply.code(404).send({ error: 'List not found' });
    const detail = await loadListDetail(db, request.params.id, role);
    if (!detail) return reply.code(404).send({ error: 'List not found' });
    return reply.send(detail);
  });

  app.patch<{ Params: { id: string } }>('/lists/:id', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const role = await getListRole(db, request.params.id, user.id);
    if (!role) return reply.code(404).send({ error: 'List not found' });
    const parsed = renameListInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid request' });
    const rows = await db
      .update(lists)
      .set({ name: parsed.data.name, updatedAt: new Date(), version: sql`${lists.version} + 1` })
      .where(eq(lists.id, request.params.id))
      .returning();
    const list = rows[0];
    if (!list) return reply.code(404).send({ error: 'List not found' });
    await app.hub.publishSnapshot(request.params.id);
    return reply.send({ list: toListSummary(list, role) });
  });

  app.patch<{ Params: { id: string } }>('/lists/:id/pin', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const role = await getListRole(db, request.params.id, user.id);
    if (!role) return reply.code(404).send({ error: 'List not found' });
    const parsed = pinListInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid request' });
    const members = await db
      .update(listMembers)
      .set({ pinned: parsed.data.pinned })
      .where(and(eq(listMembers.listId, request.params.id), eq(listMembers.userId, user.id)))
      .returning();
    const member = members[0];
    if (!member) return reply.code(404).send({ error: 'List not found' });
    const listRows = await db.select().from(lists).where(eq(lists.id, request.params.id)).limit(1);
    const list = listRows[0];
    if (!list) return reply.code(404).send({ error: 'List not found' });
    return reply.send({ list: toListSummary(list, role, member.pinned) });
  });

  app.delete<{ Params: { id: string } }>('/lists/:id', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const role = await getListRole(db, request.params.id, user.id);
    if (!role) return reply.code(404).send({ error: 'List not found' });
    if (role !== 'owner') {
      return reply.code(403).send({ error: 'Only the owner can delete the list' });
    }
    await db.delete(lists).where(eq(lists.id, request.params.id));
    app.hub.publishDeleted(request.params.id);
    await writeAudit(db, {
      actorId: user.id,
      action: 'list.delete',
      targetType: 'list',
      targetId: request.params.id,
    });
    return reply.code(204).send();
  });
}
