import { desc, eq } from 'drizzle-orm';
import type { NotificationDto, NotificationType } from '@bwinkeler-lists/shared';
import type { Database } from '../../db/client.js';
import { notifications } from '../../db/schema.js';

export function toNotificationDto(row: typeof notifications.$inferSelect): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    payload: row.payload,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createNotification(
  db: Database,
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.insert(notifications).values({ userId, type, payload });
}

export async function listNotifications(db: Database, userId: string): Promise<NotificationDto[]> {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(100);
  return rows.map(toNotificationDto);
}
