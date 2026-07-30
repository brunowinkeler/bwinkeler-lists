import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  INVITATION_STATUSES,
  ITEM_STATUSES,
  LIST_KINDS,
  MEMBER_ROLES,
  NOTIFICATION_TYPES,
} from '@bwinkeler-lists/shared';

export const listKind = pgEnum('list_kind', LIST_KINDS);
export const memberRole = pgEnum('member_role', MEMBER_ROLES);
export const itemStatus = pgEnum('item_status', ITEM_STATUSES);
export const invitationStatus = pgEnum('invitation_status', INVITATION_STATUSES);
export const notificationType = pgEnum('notification_type', NOTIFICATION_TYPES);

const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    isAdmin: boolean('is_admin').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_user_idx').on(table.userId),
  ],
);

export const lists = pgTable(
  'lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: listKind('kind').notNull(),
    version: bigint('version', { mode: 'number' }).notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('lists_owner_idx').on(table.ownerId)],
);

export const listMembers = pgTable(
  'list_members',
  {
    listId: uuid('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull(),
    pinned: boolean('pinned').notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.listId, table.userId] }),
    index('list_members_user_idx').on(table.userId),
  ],
);

export const listInvitations = pgTable(
  'list_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listId: uuid('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    invitedUserId: uuid('invited_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: invitationStatus('status').notNull().default('pending'),
    createdAt: createdAt(),
    respondedAt: timestamp('responded_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('list_invitations_pending_unique')
      .on(table.listId, table.invitedUserId)
      .where(sql`${table.status} = 'pending'`),
    index('list_invitations_invited_user_idx').on(table.invitedUserId),
  ],
);

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listId: uuid('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    position: text('position').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('categories_list_position_idx').on(table.listId, table.position)],
);

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listId: uuid('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    status: itemStatus('status').notNull().default('open'),
    position: text('position').notNull(),
    notes: text('notes'),
    dueDate: date('due_date'),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: bigint('version', { mode: 'number' }).notNull().default(0),
  },
  (table) => [
    index('items_list_position_idx').on(table.listId, table.position),
    index('items_category_idx').on(table.categoryId),
    index('items_assignee_idx').on(table.assigneeId),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationType('type').notNull(),
    payload: jsonb('payload').notNull(),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
  },
  (table) => [index('notifications_user_idx').on(table.userId, table.createdAt)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    metadata: jsonb('metadata'),
    createdAt: createdAt(),
  },
  (table) => [index('audit_log_created_idx').on(table.createdAt)],
);
