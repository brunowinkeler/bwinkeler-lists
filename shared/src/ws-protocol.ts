import { z } from 'zod';
import type { CategoryDto, ItemDto, MemberDto } from './dto.js';
import type { ListKind } from './enums.js';

export interface ListSnapshot {
  listId: string;
  version: number;
  name: string;
  kind: ListKind;
  ownerId: string;
  members: MemberDto[];
  categories: CategoryDto[];
  items: ItemDto[];
}

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), listId: z.uuid() }),
  z.object({ type: z.literal('unsubscribe'), listId: z.uuid() }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ServerMessage =
  | { type: 'snapshot'; snapshot: ListSnapshot }
  | { type: 'revoked'; listId: string }
  | { type: 'deleted'; listId: string }
  | { type: 'error'; message: string }
  | { type: 'pong' };
