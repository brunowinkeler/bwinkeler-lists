import { and, asc, eq, sql } from 'drizzle-orm';
import type {
  CategoryDto,
  InvitationDto,
  ItemDto,
  ListDetailDto,
  ListSummaryDto,
  MemberDto,
  MemberRole,
} from '@bwinkeler-lists/shared';
import type { Database } from '../../db/client.js';
import { categories, items, listInvitations, listMembers, lists, users } from '../../db/schema.js';

export function toItemDto(row: typeof items.$inferSelect): ItemDto {
  return {
    id: row.id,
    listId: row.listId,
    categoryId: row.categoryId,
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

export function toCategoryDto(row: typeof categories.$inferSelect): CategoryDto {
  return {
    id: row.id,
    listId: row.listId,
    name: row.name,
    color: row.color,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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

  const categoryRows = await db
    .select()
    .from(categories)
    .where(eq(categories.listId, listId))
    .orderBy(asc(categories.position));

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
    categories: categoryRows.map(toCategoryDto),
    items: itemRows.map(toItemDto),
    invitations,
  };
}

export interface DuplicateOptions {
  name?: string | undefined;
  includeCompleted: boolean;
  resetCompleted: boolean;
}

/** Creates a copy of a list owned by `ownerId`, cloning its categories and
 * (optionally filtered) items. Category references are remapped to the new
 * category rows; assignees are cleared because the copy starts with only the
 * owner as a member. */
export async function duplicateList(
  db: Database,
  sourceListId: string,
  ownerId: string,
  opts: DuplicateOptions,
): Promise<ListSummaryDto | null> {
  const source = await getListById(db, sourceListId);
  if (!source) return null;

  return db.transaction(async (tx) => {
    const listRows = await tx
      .insert(lists)
      .values({ ownerId, name: opts.name ?? `${source.name} (copy)`, kind: source.kind })
      .returning();
    const newList = listRows[0];
    if (!newList) throw new Error('Failed to create list copy');

    await tx.insert(listMembers).values({ listId: newList.id, userId: ownerId, role: 'owner' });

    const sourceCategories = await tx
      .select()
      .from(categories)
      .where(eq(categories.listId, sourceListId))
      .orderBy(asc(categories.position));

    const categoryIdMap = new Map<string, string>();
    for (const category of sourceCategories) {
      const rows = await tx
        .insert(categories)
        .values({
          listId: newList.id,
          name: category.name,
          color: category.color,
          position: category.position,
        })
        .returning({ id: categories.id });
      const newId = rows[0]?.id;
      if (newId) categoryIdMap.set(category.id, newId);
    }

    const sourceItems = await tx
      .select()
      .from(items)
      .where(
        opts.includeCompleted
          ? eq(items.listId, sourceListId)
          : and(eq(items.listId, sourceListId), eq(items.status, 'open')),
      )
      .orderBy(asc(items.position));

    if (sourceItems.length > 0) {
      await tx.insert(items).values(
        sourceItems.map((item) => ({
          listId: newList.id,
          categoryId: item.categoryId ? (categoryIdMap.get(item.categoryId) ?? null) : null,
          title: item.title,
          status: opts.resetCompleted ? ('open' as const) : item.status,
          position: item.position,
          notes: item.notes,
          dueDate: item.dueDate,
          assigneeId: null,
          createdBy: ownerId,
        })),
      );
    }

    return toListSummary(newList, 'owner');
  });
}
