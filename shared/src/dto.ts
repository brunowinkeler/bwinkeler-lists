import { z } from 'zod';
import type {
  InvitationStatus,
  ItemStatus,
  ListKind,
  MemberRole,
  NotificationType,
} from './enums.js';
import { ITEM_STATUSES, LIST_KINDS } from './enums.js';

export const emailSchema = z.email().transform((value) => value.toLowerCase());

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const publicUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  isAdmin: z.boolean(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const createListInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(LIST_KINDS),
});
export type CreateListInput = z.infer<typeof createListInputSchema>;

export const renameListInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
});
export type RenameListInput = z.infer<typeof renameListInputSchema>;

const titleSchema = z.string().trim().min(1).max(500);
const notesSchema = z.string().max(5000);
const dueDateSchema = z.iso.date();

export const createItemInputSchema = z.object({
  title: titleSchema,
  notes: notesSchema.nullable().optional(),
  dueDate: dueDateSchema.nullable().optional(),
  assigneeId: z.uuid().nullable().optional(),
});
export type CreateItemInput = z.infer<typeof createItemInputSchema>;

export const updateItemInputSchema = z
  .object({
    title: titleSchema.optional(),
    status: z.enum(ITEM_STATUSES).optional(),
    notes: notesSchema.nullable().optional(),
    dueDate: dueDateSchema.nullable().optional(),
    assigneeId: z.uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No fields to update' });
export type UpdateItemInput = z.infer<typeof updateItemInputSchema>;

export const reorderItemInputSchema = z.object({
  previousId: z.uuid().nullable().optional(),
  nextId: z.uuid().nullable().optional(),
});
export type ReorderItemInput = z.infer<typeof reorderItemInputSchema>;

export const inviteInputSchema = z.object({
  email: emailSchema,
});
export type InviteInput = z.infer<typeof inviteInputSchema>;

export interface ListSummaryDto {
  id: string;
  name: string;
  kind: ListKind;
  role: MemberRole;
  ownerId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MemberDto {
  userId: string;
  role: MemberRole;
  displayName: string;
  email: string;
}

export interface ItemDto {
  id: string;
  listId: string;
  title: string;
  status: ItemStatus;
  position: string;
  notes: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface InvitationDto {
  id: string;
  listId: string;
  listName: string;
  invitedUserId: string;
  invitedEmail: string;
  status: InvitationStatus;
  createdAt: string;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
}

export interface ListDetailDto {
  list: ListSummaryDto;
  members: MemberDto[];
  items: ItemDto[];
  invitations: InvitationDto[];
}
