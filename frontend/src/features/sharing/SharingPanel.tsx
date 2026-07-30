import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InvitationDto, MemberDto } from '@bwinkeler-lists/shared';
import { ApiError, apiSend } from '../../lib/api';
import { listKey } from '../lists/api';

interface SharingPanelProps {
  listId: string;
  members: MemberDto[];
  invitations: InvitationDto[];
}

export function SharingPanel({ listId, members, invitations }: SharingPanelProps) {
  const queryClient = useQueryClient();
  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: listKey(listId) });

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () =>
      apiSend<{ invitation: InvitationDto }>('POST', `/lists/${listId}/invitations`, {
        email: email.trim(),
      }),
    onSuccess: () => {
      setEmail('');
      setError(null);
      void invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Invite failed'),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => apiSend<void>('DELETE', `/invitations/${id}`),
    onSuccess: invalidate,
  });
  const removeMember = useMutation({
    mutationFn: (userId: string) => apiSend<void>('DELETE', `/lists/${listId}/members/${userId}`),
    onSuccess: invalidate,
  });

  function onInvite(event: FormEvent): void {
    event.preventDefault();
    if (email.trim().length > 0) invite.mutate();
  }

  return (
    <section className="card stack" aria-label="Sharing">
      <h2>Sharing</h2>
      <form className="row" onSubmit={onInvite} style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="invite-email">Invite by email</label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <button className="primary" type="submit" disabled={invite.isPending}>
          Invite
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <h3>Members</h3>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {members.map((member) => (
          <li key={member.userId} className="row" style={{ justifyContent: 'space-between' }}>
            <span>
              {member.displayName} <span className="muted">({member.role})</span>
            </span>
            {member.role !== 'owner' && (
              <button className="danger" onClick={() => removeMember.mutate(member.userId)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {invitations.length > 0 && (
        <>
          <h3>Pending invitations</h3>
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {invitations.map((invitation) => (
              <li key={invitation.id} className="row" style={{ justifyContent: 'space-between' }}>
                <span>{invitation.invitedEmail}</span>
                <button onClick={() => cancel.mutate(invitation.id)}>Cancel</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
