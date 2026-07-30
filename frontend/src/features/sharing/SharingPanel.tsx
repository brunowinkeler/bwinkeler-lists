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
    <section className="card stack-lg" aria-label="Sharing">
      <div className="section-title">
        <h2>Sharing</h2>
      </div>
      <form className="row" onSubmit={onInvite} style={{ alignItems: 'flex-end' }}>
        <div className="field grow">
          <label htmlFor="invite-email">Invite by email</label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
          />
        </div>
        <button className="primary" type="submit" disabled={invite.isPending}>
          Invite
        </button>
      </form>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}

      <div className="stack">
        <h3>Members</h3>
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {members.map((member) => (
            <li key={member.userId} className="row-between">
              <span className="row">
                <span className="avatar" aria-hidden="true">
                  {member.displayName.charAt(0).toUpperCase()}
                </span>
                <span>{member.displayName}</span>
                <span className="badge">{member.role}</span>
              </span>
              {member.role !== 'owner' && (
                <button
                  className="danger btn-sm"
                  onClick={() => removeMember.mutate(member.userId)}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {invitations.length > 0 && (
        <div className="stack">
          <h3>Pending invitations</h3>
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {invitations.map((invitation) => (
              <li key={invitation.id} className="row-between">
                <span className="muted">{invitation.invitedEmail}</span>
                <button className="btn-sm" onClick={() => cancel.mutate(invitation.id)}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
