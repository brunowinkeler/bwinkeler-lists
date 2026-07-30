import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InvitationDto } from '@bwinkeler-lists/shared';
import { apiGet, apiSend } from '../../lib/api';
import { listsKey } from '../lists/api';

export function InvitationsInbox() {
  const queryClient = useQueryClient();
  const invitations = useQuery({
    queryKey: ['invitations'],
    queryFn: () => apiGet<{ invitations: InvitationDto[] }>('/invitations'),
  });

  const respond = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'decline' }) =>
      apiSend<void>('POST', `/invitations/${id}/${action}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invitations'] });
      void queryClient.invalidateQueries({ queryKey: listsKey });
    },
  });

  const items = invitations.data?.invitations ?? [];
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="card stack" aria-label="Pending invitations">
      <h2>Invitations</h2>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((invitation) => (
          <li
            key={invitation.id}
            className="row"
            style={{ justifyContent: 'space-between', gap: '0.75rem' }}
          >
            <span>“{invitation.listName}”</span>
            <span className="row">
              <button
                className="primary"
                onClick={() => respond.mutate({ id: invitation.id, action: 'accept' })}
              >
                Accept
              </button>
              <button onClick={() => respond.mutate({ id: invitation.id, action: 'decline' })}>
                Decline
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
