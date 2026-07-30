import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { categories } from '../../db/schema.js';

/** Highest category position within a list, for appending new categories. */
export async function lastCategoryPosition(db: Database, listId: string): Promise<string | null> {
  const rows = await db
    .select({ position: categories.position })
    .from(categories)
    .where(eq(categories.listId, listId))
    .orderBy(desc(categories.position))
    .limit(1);
  return rows[0]?.position ?? null;
}

export async function categoryPositionById(
  db: Database,
  listId: string,
  categoryId: string,
): Promise<string | null> {
  const rows = await db
    .select({ position: categories.position })
    .from(categories)
    .where(and(eq(categories.listId, listId), eq(categories.id, categoryId)))
    .limit(1);
  return rows[0]?.position ?? null;
}

export async function categoryBelongsToList(
  db: Database,
  listId: string,
  categoryId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.listId, listId), eq(categories.id, categoryId)))
    .limit(1);
  return rows.length > 0;
}
