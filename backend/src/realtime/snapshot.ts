import { eq, sql } from 'drizzle-orm';
import type { ListActivityKind, ListSnapshot } from '@bwinkeler-lists/shared';
import type { Database } from '../db/client.js';
import { categories, items, listMembers, lists, users } from '../db/schema.js';
import { activityActorName, toCategoryDto, toItemDto } from '../modules/lists/service.js';

export async function loadListSnapshot(db: Database, listId: string): Promise<ListSnapshot | null> {
  const listRows = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
  const list = listRows[0];
  if (!list) {
    return null;
  }

  const memberRows = await db
    .select({
      userId: listMembers.userId,
      role: listMembers.role,
      displayName: users.displayName,
      email: users.email,
    })
    .from(listMembers)
    .innerJoin(users, eq(users.id, listMembers.userId))
    .where(eq(listMembers.listId, listId));

  const itemRows = await db
    .select()
    .from(items)
    .where(eq(items.listId, listId))
    .orderBy(sql`${items.position} COLLATE "C" ASC`);

  const categoryRows = await db
    .select()
    .from(categories)
    .where(eq(categories.listId, listId))
    .orderBy(sql`${categories.position} COLLATE "C" ASC`);

  return {
    listId: list.id,
    version: list.version,
    name: list.name,
    kind: list.kind,
    ownerId: list.ownerId,
    updatedAt: list.updatedAt.toISOString(),
    lastActivity: list.lastActivityKind
      ? {
          kind: list.lastActivityKind as ListActivityKind,
          detail: list.lastActivityDetail,
          actorId: list.lastActivityBy,
          actorName: await activityActorName(db, list.lastActivityBy),
        }
      : null,
    members: memberRows.map((member) => ({
      userId: member.userId,
      role: member.role,
      displayName: member.displayName,
      email: member.email,
    })),
    categories: categoryRows.map(toCategoryDto),
    items: itemRows.map(toItemDto),
  };
}
