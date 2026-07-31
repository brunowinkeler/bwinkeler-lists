import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { ListKind, ListSummaryDto } from '@bwinkeler-lists/shared';
import { createList, fetchLists, listsKey, setListPinned } from './api';
import { InvitationsInbox } from '../sharing/InvitationsInbox';
import { PinIcon, PlusIcon } from '../../components/icons';

export function ListsOverviewPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const lists = useQuery({ queryKey: listsKey, queryFn: fetchLists });
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ListKind>('simple');

  const create = useMutation({
    mutationFn: () => createList({ name: name.trim(), kind }),
    onSuccess: async (result) => {
      setName('');
      await queryClient.invalidateQueries({ queryKey: listsKey });
      navigate(`/lists/${result.list.id}`);
    },
  });

  const pin = useMutation({
    mutationFn: (vars: { id: string; pinned: boolean }) => setListPinned(vars.id, vars.pinned),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listsKey }),
  });

  function onCreate(event: FormEvent): void {
    event.preventDefault();
    if (name.trim().length > 0) {
      create.mutate();
    }
  }

  const allLists = lists.data?.lists ?? [];
  const pinnedLists = allLists.filter((list) => list.pinned);
  const otherLists = allLists.filter((list) => !list.pinned);

  function renderTile(list: ListSummaryDto) {
    return (
      <li key={list.id} className="list-tile-wrap">
        <Link to={`/lists/${list.id}`} className="list-tile">
          <span className="list-tile__name">{list.name}</span>
          <span className="row">
            <span className="badge accent">{list.kind}</span>
            <span className="badge">{list.role}</span>
          </span>
        </Link>
        <button
          type="button"
          className={`icon-btn list-tile__pin${list.pinned ? ' is-pinned' : ''}`}
          aria-label={list.pinned ? `Unpin “${list.name}”` : `Pin “${list.name}” to top`}
          aria-pressed={list.pinned}
          title={list.pinned ? 'Unpin' : 'Pin to top'}
          onClick={() => pin.mutate({ id: list.id, pinned: !list.pinned })}
        >
          <PinIcon />
        </button>
      </li>
    );
  }

  return (
    <main className="container page">
      <InvitationsInbox />
      <section className="stack-lg">
        <div className="page-header">
          <div>
            <p className="eyebrow">Your workspace</p>
            <h1>Your lists</h1>
          </div>
        </div>

        <form className="card" onSubmit={onCreate}>
          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <div className="field grow">
              <label htmlFor="list-name">New list name</label>
              <input
                id="list-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Weekend groceries"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="list-kind">Kind</label>
              <select
                id="list-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as ListKind)}
              >
                <option value="simple">Simple list</option>
                <option value="task">Task list</option>
              </select>
            </div>
            <button className="primary" type="submit" disabled={create.isPending}>
              <PlusIcon />
              <span>Create</span>
            </button>
          </div>
        </form>

        {lists.isLoading && <p className="muted">Loading…</p>}
        {lists.data && lists.data.lists.length === 0 && (
          <div className="empty">
            <p>No lists yet.</p>
            <p className="subtle">Create your first list above to get started.</p>
          </div>
        )}
        {pinnedLists.length > 0 && (
          <section className="stack">
            <h2 className="lists-section__title">Pinned</h2>
            <ul className="list-grid">{pinnedLists.map(renderTile)}</ul>
          </section>
        )}
        {otherLists.length > 0 && (
          <section className="stack">
            {pinnedLists.length > 0 && <h2 className="lists-section__title">All lists</h2>}
            <ul className="list-grid">{otherLists.map(renderTile)}</ul>
          </section>
        )}
      </section>
    </main>
  );
}
