import { asc, eq } from 'drizzle-orm';
import type { ListSnapshot } from '@bwinkeler-lists/shared';
import type { Database } from '../db/client.js';
import { items, listMembers, lists, users } from '../db/schema.js';
import { toItemDto } from '../modules/lists/service.js';

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
    .orderBy(asc(items.position));

  return {
    listId: list.id,
    version: list.version,
    name: list.name,
    kind: list.kind,
    ownerId: list.ownerId,
    members: memberRows.map((member) => ({
      userId: member.userId,
      role: member.role,
      displayName: member.displayName,
      email: member.email,
    })),
    items: itemRows.map(toItemDto),
  };
}
