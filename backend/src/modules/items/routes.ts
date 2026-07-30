import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  createItemInputSchema,
  reorderItemInputSchema,
  updateItemInputSchema,
} from '@bwinkeler-lists/shared';
import { getSessionUser } from '../../auth/guards.js';
import { getListRole } from '../../authz.js';
import { items } from '../../db/schema.js';
import { getListById, toItemDto, touchList } from '../lists/service.js';
import { createNotification } from '../notifications/service.js';
import { itemPositionById, keyBetween, lastItemPosition } from './service.js';

export async function registerItemRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;

  app.post<{ Params: { listId: string } }>('/lists/:listId/items', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const { listId } = request.params;
    const role = await getListRole(db, listId, user.id);
    if (!role) return reply.code(404).send({ error: 'List not found' });

    const parsed = createItemInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid request' });
    const input = parsed.data;

    const list = await getListById(db, listId);
    if (!list) return reply.code(404).send({ error: 'List not found' });
    if (
      list.kind === 'simple' &&
      (input.notes != null || input.dueDate != null || input.assigneeId != null)
    ) {
      return reply.code(400).send({ error: 'Simple lists do not support task fields' });
    }
    if (input.assigneeId && !(await getListRole(db, listId, input.assigneeId))) {
      return reply.code(400).send({ error: 'Assignee is not a member of the list' });
    }

    const position = keyBetween(await lastItemPosition(db, listId), null);
    const rows = await db
      .insert(items)
      .values({
        listId,
        title: input.title,
        position,
        notes: input.notes ?? null,
        dueDate: input.dueDate ?? null,
        assigneeId: input.assigneeId ?? null,
        createdBy: user.id,
      })
      .returning();
    const item = rows[0];
    if (!item) return reply.code(500).send({ error: 'Failed to create item' });
    await touchList(db, listId);
    await app.hub.publishSnapshot(listId);

    if (item.assigneeId && item.assigneeId !== user.id) {
      await createNotification(db, item.assigneeId, 'task_assignment', {
        listId,
        listName: list.name,
        itemId: item.id,
        itemTitle: item.title,
      });
    }
    return reply.code(201).send({ item: toItemDto(item) });
  });

  app.patch<{ Params: { id: string } }>('/items/:id', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const { id } = request.params;

    const parsed = updateItemInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid request' });
    const input = parsed.data;

    const existingRows = await db.select().from(items).where(eq(items.id, id)).limit(1);
    const existing = existingRows[0];
    if (!existing) return reply.code(404).send({ error: 'Item not found' });
    if (!(await getListRole(db, existing.listId, user.id))) {
      return reply.code(404).send({ error: 'Item not found' });
    }
    const list = await getListById(db, existing.listId);
    if (!list) return reply.code(404).send({ error: 'Item not found' });

    const usesTaskFields =
      input.notes !== undefined || input.dueDate !== undefined || input.assigneeId !== undefined;
    if (list.kind === 'simple' && usesTaskFields) {
      return reply.code(400).send({ error: 'Simple lists do not support task fields' });
    }
    if (input.assigneeId && !(await getListRole(db, existing.listId, input.assigneeId))) {
      return reply.code(400).send({ error: 'Assignee is not a member of the list' });
    }

    const updates: Partial<typeof items.$inferInsert> = { updatedAt: new Date() };
    if (input.title !== undefined) updates.title = input.title;
    if (input.status !== undefined) updates.status = input.status;
    if (input.notes !== undefined) updates.notes = input.notes;
    if (input.dueDate !== undefined) updates.dueDate = input.dueDate;
    if (input.assigneeId !== undefined) updates.assigneeId = input.assigneeId;

    const rows = await db.update(items).set(updates).where(eq(items.id, id)).returning();
    const item = rows[0];
    if (!item) return reply.code(404).send({ error: 'Item not found' });
    await touchList(db, existing.listId);
    await app.hub.publishSnapshot(existing.listId);

    if (
      input.assigneeId &&
      input.assigneeId !== existing.assigneeId &&
      input.assigneeId !== user.id
    ) {
      await createNotification(db, input.assigneeId, 'task_assignment', {
        listId: existing.listId,
        listName: list.name,
        itemId: item.id,
        itemTitle: item.title,
      });
    }
    return reply.send({ item: toItemDto(item) });
  });

  app.patch<{ Params: { id: string } }>('/items/:id/position', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const { id } = request.params;

    const parsed = reorderItemInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid request' });
    const { previousId, nextId } = parsed.data;

    const existingRows = await db.select().from(items).where(eq(items.id, id)).limit(1);
    const existing = existingRows[0];
    if (!existing) return reply.code(404).send({ error: 'Item not found' });
    if (!(await getListRole(db, existing.listId, user.id))) {
      return reply.code(404).send({ error: 'Item not found' });
    }

    const previousPosition = previousId
      ? await itemPositionById(db, existing.listId, previousId)
      : null;
    const nextPosition = nextId ? await itemPositionById(db, existing.listId, nextId) : null;

    let position: string;
    try {
      position = keyBetween(previousPosition, nextPosition);
    } catch {
      return reply.code(400).send({ error: 'Invalid reorder request' });
    }

    const rows = await db
      .update(items)
      .set({ position, updatedAt: new Date() })
      .where(eq(items.id, id))
      .returning();
    const item = rows[0];
    if (!item) return reply.code(404).send({ error: 'Item not found' });
    await touchList(db, existing.listId);
    await app.hub.publishSnapshot(existing.listId);
    return reply.send({ item: toItemDto(item) });
  });

  app.delete<{ Params: { id: string } }>('/items/:id', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const { id } = request.params;
    const existingRows = await db
      .select({ listId: items.listId })
      .from(items)
      .where(eq(items.id, id))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) return reply.code(404).send({ error: 'Item not found' });
    if (!(await getListRole(db, existing.listId, user.id))) {
      return reply.code(404).send({ error: 'Item not found' });
    }
    await db.delete(items).where(eq(items.id, id));
    await touchList(db, existing.listId);
    await app.hub.publishSnapshot(existing.listId);
    return reply.code(204).send();
  });
}
