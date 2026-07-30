import { and, eq } from 'drizzle-orm';
import type { MemberRole } from '@bwinkeler-lists/shared';
import type { Database } from './db/client.js';
import { listMembers } from './db/schema.js';

export async function getListRole(
  db: Database,
  listId: string,
  userId: string,
): Promise<MemberRole | null> {
  const rows = await db
    .select({ role: listMembers.role })
    .from(listMembers)
    .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, userId)))
    .limit(1);
  return rows[0]?.role ?? null;
}
