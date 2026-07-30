import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationDto } from '@bwinkeler-lists/shared';
import { apiGet, apiSend } from '../../lib/api';
import { BellIcon } from '../../components/icons';

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
    <details className="popover">
      <summary
        className="icon-btn notif-trigger"
        aria-label={`Notifications, ${unread} unread`}
        title="Notifications"
      >
        <BellIcon />
        {unread > 0 && <span className="badge-count">{unread}</span>}
      </summary>
      <div className="popover__panel">
        {items.length === 0 ? (
          <p className="muted" style={{ padding: 'var(--space-3)' }}>
            No notifications
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {items.map((notification) => (
              <li
                key={notification.id}
                className={`notification${notification.readAt ? '' : ' is-unread'}`}
              >
                <div className="row-between">
                  <span style={{ fontWeight: notification.readAt ? 400 : 600 }}>
                    {describe(notification)}
                  </span>
                  {!notification.readAt && (
                    <button
                      className="ghost btn-sm"
                      onClick={() => markRead.mutate(notification.id)}
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
