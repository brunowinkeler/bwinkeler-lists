import { and, desc, eq, isNull } from 'drizzle-orm';
import { generateKeyBetween } from 'fractional-indexing';
import type { Database } from '../../db/client.js';
import { items } from '../../db/schema.js';

/** Highest position among the items in a given category bucket (null = the
 * uncategorized bucket). Ordering is per-bucket, so positions only ever need to
 * be compared within the same category. */
export async function lastItemPosition(
  db: Database,
  listId: string,
  categoryId: string | null,
): Promise<string | null> {
  const rows = await db
    .select({ position: items.position })
    .from(items)
    .where(
      and(
        eq(items.listId, listId),
        categoryId === null ? isNull(items.categoryId) : eq(items.categoryId, categoryId),
      ),
    )
    .orderBy(desc(items.position))
    .limit(1);
  return rows[0]?.position ?? null;
}

export async function itemPositionById(
  db: Database,
  listId: string,
  itemId: string,
): Promise<string | null> {
  const rows = await db
    .select({ position: items.position })
    .from(items)
    .where(and(eq(items.listId, listId), eq(items.id, itemId)))
    .limit(1);
  return rows[0]?.position ?? null;
}

export function keyBetween(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b);
}
