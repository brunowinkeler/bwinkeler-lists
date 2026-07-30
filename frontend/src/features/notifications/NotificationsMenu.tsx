import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationDto } from '@bwinkeler-lists/shared';
import { apiGet, apiSend } from '../../lib/api';

function describe(notification: NotificationDto): string {
  const payload = notification.payload as { listName?: string; itemTitle?: string };
  if (notification.type === 'list_invitation') {
    return `Invited to “${payload.listName ?? 'a list'}”`;
  }
  if (notification.type === 'task_assignment') {
    return `Assigned “${payload.itemTitle ?? 'a task'}”`;
  }
  return 'Notification';
}

export function NotificationsMenu() {
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiGet<{ notifications: NotificationDto[] }>('/notifications'),
    refetchInterval: 30_000,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => apiSend<void>('POST', `/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const items = notifications.data?.notifications ?? [];
  const unread = items.filter((notification) => !notification.readAt).length;

  return (
    <details>
      <summary aria-label={`Notifications, ${unread} unread`}>Notifications ({unread})</summary>
      <div
        className="card"
        style={{
          position: 'absolute',
          right: '1rem',
          marginTop: '0.5rem',
          minWidth: 260,
          zIndex: 10,
        }}
      >
        {items.length === 0 ? (
          <p className="muted">No notifications</p>
        ) : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {items.map((notification) => (
              <li
                key={notification.id}
                className="row"
                style={{ justifyContent: 'space-between', gap: '0.75rem' }}
              >
                <span style={{ fontWeight: notification.readAt ? 400 : 600 }}>
                  {describe(notification)}
                </span>
                {!notification.readAt && (
                  <button onClick={() => markRead.mutate(notification.id)}>Mark read</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
