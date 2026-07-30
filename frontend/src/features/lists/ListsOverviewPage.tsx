import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ListKind } from '@bwinkeler-lists/shared';
import { createList, fetchLists, listsKey } from './api';
import { InvitationsInbox } from '../sharing/InvitationsInbox';

export function ListsOverviewPage() {
  const queryClient = useQueryClient();
  const lists = useQuery({ queryKey: listsKey, queryFn: fetchLists });
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ListKind>('task');

  const create = useMutation({
    mutationFn: () => createList({ name: name.trim(), kind }),
    onSuccess: () => {
      setName('');
      void queryClient.invalidateQueries({ queryKey: listsKey });
    },
  });

  function onCreate(event: FormEvent): void {
    event.preventDefault();
    if (name.trim().length > 0) {
      create.mutate();
    }
  }

  return (
    <main className="container stack">
      <InvitationsInbox />
      <section className="stack">
        <h2>Your lists</h2>
        <form className="card row" onSubmit={onCreate} style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="list-name">New list name</label>
            <input
              id="list-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label htmlFor="list-kind">Kind</label>
            <select
              id="list-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as ListKind)}
            >
              <option value="task">Task list</option>
              <option value="simple">Simple list</option>
            </select>
          </div>
          <button className="primary" type="submit" disabled={create.isPending}>
            Create
          </button>
        </form>
        {lists.isLoading && <p className="muted">Loading…</p>}
        {lists.data && (
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {lists.data.lists.map((list) => (
              <li
                key={list.id}
                className="card row"
                style={{ justifyContent: 'space-between', gap: '0.75rem' }}
              >
                <Link to={`/lists/${list.id}`} style={{ fontWeight: 600 }}>
                  {list.name}
                </Link>
                <span className="muted">
                  {list.kind} · {list.role}
                </span>
              </li>
            ))}
            {lists.data.lists.length === 0 && <li className="muted">No lists yet.</li>}
          </ul>
        )}
      </section>
    </main>
  );
}
