import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  createCategoryInputSchema,
  reorderCategoryInputSchema,
  updateCategoryInputSchema,
} from '@bwinkeler-lists/shared';
import { getSessionUser } from '../../auth/guards.js';
import { getListRole } from '../../authz.js';
import { categories } from '../../db/schema.js';
import { keyBetween } from '../items/service.js';
import { toCategoryDto, touchList } from '../lists/service.js';
import { categoryPositionById, lastCategoryPosition } from './service.js';

export async function registerCategoryRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;

  app.post<{ Params: { listId: string } }>('/lists/:listId/categories', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const { listId } = request.params;
    if (!(await getListRole(db, listId, user.id))) {
      return reply.code(404).send({ error: 'List not found' });
    }

    const parsed = createCategoryInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid request' });

    const position = keyBetween(await lastCategoryPosition(db, listId), null);
    const rows = await db
      .insert(categories)
      .values({ listId, name: parsed.data.name, position })
      .returning();
    const category = rows[0];
    if (!category) return reply.code(500).send({ error: 'Failed to create category' });
    await touchList(db, listId);
    await app.hub.publishSnapshot(listId);
    return reply.code(201).send({ category: toCategoryDto(category) });
  });

  app.patch<{ Params: { id: string } }>('/categories/:id', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const { id } = request.params;

    const parsed = updateCategoryInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid request' });

    const existing = (await db.select().from(categories).where(eq(categories.id, id)).limit(1))[0];
    if (!existing) return reply.code(404).send({ error: 'Category not found' });
    if (!(await getListRole(db, existing.listId, user.id))) {
      return reply.code(404).send({ error: 'Category not found' });
    }

    const updates: { name?: string; color?: string | null; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.color !== undefined) updates.color = parsed.data.color;

    const rows = await db.update(categories).set(updates).where(eq(categories.id, id)).returning();
    const category = rows[0];
    if (!category) return reply.code(404).send({ error: 'Category not found' });
    await touchList(db, existing.listId);
    await app.hub.publishSnapshot(existing.listId);
    return reply.send({ category: toCategoryDto(category) });
  });

  app.delete<{ Params: { id: string } }>('/categories/:id', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const { id } = request.params;

    const existing = (
      await db
        .select({ listId: categories.listId })
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1)
    )[0];
    if (!existing) return reply.code(404).send({ error: 'Category not found' });
    if (!(await getListRole(db, existing.listId, user.id))) {
      return reply.code(404).send({ error: 'Category not found' });
    }

    // Items keep existing but become uncategorized via the FK's ON DELETE SET NULL.
    await db.delete(categories).where(eq(categories.id, id));
    await touchList(db, existing.listId);
    await app.hub.publishSnapshot(existing.listId);
    return reply.code(204).send();
  });

  app.patch<{ Params: { id: string } }>('/categories/:id/position', async (request, reply) => {
    const user = getSessionUser(request, reply);
    if (!user) return;
    const { id } = request.params;

    const parsed = reorderCategoryInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid request' });
    const { previousId, nextId } = parsed.data;

    const existing = (await db.select().from(categories).where(eq(categories.id, id)).limit(1))[0];
    if (!existing) return reply.code(404).send({ error: 'Category not found' });
    if (!(await getListRole(db, existing.listId, user.id))) {
      return reply.code(404).send({ error: 'Category not found' });
    }

    const previousPosition = previousId
      ? await categoryPositionById(db, existing.listId, previousId)
      : null;
    const nextPosition = nextId ? await categoryPositionById(db, existing.listId, nextId) : null;

    let position: string;
    try {
      position = keyBetween(previousPosition, nextPosition);
    } catch {
      return reply.code(400).send({ error: 'Invalid reorder request' });
    }

    const rows = await db
      .update(categories)
      .set({ position, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning();
    const category = rows[0];
    if (!category) return reply.code(404).send({ error: 'Category not found' });
    await touchList(db, existing.listId);
    await app.hub.publishSnapshot(existing.listId);
    return reply.send({ category: toCategoryDto(category) });
  });
}
