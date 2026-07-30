import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { realtime } from '../../lib/ws-client';
import { createItem, deleteList, fetchListDetail, listKey, listsKey, renameList } from './api';
import { ItemRow } from './ItemRow';
import { SharingPanel } from '../sharing/SharingPanel';

export function ListPage() {
  const params = useParams();
  const listId = params.id ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: listKey(listId),
    queryFn: () => fetchListDetail(listId),
    enabled: listId.length > 0,
  });

  useEffect(() => {
    if (!listId) return;
    realtime.subscribe(listId);
    return () => {
      realtime.unsubscribe(listId);
    };
  }, [listId]);

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: listKey(listId) });

  const [title, setTitle] = useState('');
  const addItem = useMutation({
    mutationFn: () => createItem(listId, { title: title.trim() }),
    onSuccess: () => {
      setTitle('');
      void invalidate();
    },
  });

  const [name, setName] = useState('');
  const rename = useMutation({
    mutationFn: () => renameList(listId, name.trim()),
    onSuccess: () => {
      void invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteList(listId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listsKey });
      navigate('/');
    },
  });

  if (detail.isLoading) {
    return (
      <main className="container">
        <p className="muted">Loading…</p>
      </main>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <main className="container">
        <p className="error">List not found.</p>
      </main>
    );
  }

  const data = detail.data;
  const isOwner = data.list.role === 'owner';

  function onAddItem(event: FormEvent): void {
    event.preventDefault();
    if (title.trim().length > 0) addItem.mutate();
  }
  function onRename(event: FormEvent): void {
    event.preventDefault();
    if (name.trim().length > 0) rename.mutate();
  }

  return (
    <main className="container stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 0 }}>{data.list.name}</h1>
          <span className="muted">
            {data.list.kind} list · your role: {data.list.role}
          </span>
        </div>
        {isOwner && (
          <button
            className="danger"
            onClick={() => {
              if (window.confirm('Delete this list and all its items?')) remove.mutate();
            }}
          >
            Delete list
          </button>
        )}
      </div>

      <form className="row" onSubmit={onRename}>
        <input
          aria-label="Rename list"
          placeholder={data.list.name}
          value={name}
          onChange={(event) => setName(event.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={rename.isPending || name.trim().length === 0}>
          Rename
        </button>
      </form>

      <section className="stack">
        <h2>Items</h2>
        <form className="card row" onSubmit={onAddItem}>
          <input
            aria-label="New item title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Add an item…"
            style={{ flex: 1 }}
            required
          />
          <button className="primary" type="submit" disabled={addItem.isPending}>
            Add
          </button>
        </form>
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {data.items.map((item, index) => (
            <ItemRow
              key={item.id}
              listId={listId}
              item={item}
              kind={data.list.kind}
              members={data.members}
              index={index}
              items={data.items}
            />
          ))}
          {data.items.length === 0 && <li className="muted">No items yet.</li>}
        </ul>
      </section>

      {isOwner && (
        <SharingPanel listId={listId} members={data.members} invitations={data.invitations} />
      )}
    </main>
  );
}
