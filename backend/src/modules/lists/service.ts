import { and, asc, eq, sql } from 'drizzle-orm';
import type {
  InvitationDto,
  ItemDto,
  ListDetailDto,
  ListSummaryDto,
  MemberDto,
  MemberRole,
} from '@bwinkeler-lists/shared';
import type { Database } from '../../db/client.js';
import { items, listInvitations, listMembers, lists, users } from '../../db/schema.js';

export function toItemDto(row: typeof items.$inferSelect): ItemDto {
  return {
    id: row.id,
    listId: row.listId,
    title: row.title,
    status: row.status,
    position: row.position,
    notes: row.notes,
    dueDate: row.dueDate,
    assigneeId: row.assigneeId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

export function toListSummary(row: typeof lists.$inferSelect, role: MemberRole): ListSummaryDto {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    role,
    ownerId: row.ownerId,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getListById(
  db: Database,
  listId: string,
): Promise<typeof lists.$inferSelect | null> {
  const rows = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
  return rows[0] ?? null;
}

export async function touchList(db: Database, listId: string): Promise<number> {
  const rows = await db
    .update(lists)
    .set({ version: sql`${lists.version} + 1`, updatedAt: new Date() })
    .where(eq(lists.id, listId))
    .returning({ version: lists.version });
  return rows[0]?.version ?? 0;
}

export async function loadListDetail(
  db: Database,
  listId: string,
  role: MemberRole,
): Promise<ListDetailDto | null> {
  const list = await getListById(db, listId);
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
  const members: MemberDto[] = memberRows.map((member) => ({
    userId: member.userId,
    role: member.role,
    displayName: member.displayName,
    email: member.email,
  }));

  const itemRows = await db
    .select()
    .from(items)
    .where(eq(items.listId, listId))
    .orderBy(asc(items.position));

  let invitations: InvitationDto[] = [];
  if (role === 'owner') {
    const invitationRows = await db
      .select({
        id: listInvitations.id,
        invitedUserId: listInvitations.invitedUserId,
        status: listInvitations.status,
        createdAt: listInvitations.createdAt,
        invitedEmail: users.email,
      })
      .from(listInvitations)
      .innerJoin(users, eq(users.id, listInvitations.invitedUserId))
      .where(and(eq(listInvitations.listId, listId), eq(listInvitations.status, 'pending')));
    invitations = invitationRows.map((invitation) => ({
      id: invitation.id,
      listId,
      listName: list.name,
      invitedUserId: invitation.invitedUserId,
      invitedEmail: invitation.invitedEmail,
      status: invitation.status,
      createdAt: invitation.createdAt.toISOString(),
    }));
  }

  return {
    list: toListSummary(list, role),
    members,
    items: itemRows.map(toItemDto),
    invitations,
  };
}
