import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { ListDetailDto } from '@bwinkeler-lists/shared';
import { realtime } from '../../lib/ws-client';
import {
  createItem,
  deleteList,
  fetchListDetail,
  listKey,
  listsKey,
  renameList,
  reorderItem,
} from './api';
import { ItemRow } from './ItemRow';
import { SharingPanel } from '../sharing/SharingPanel';
import { PlusIcon } from '../../components/icons';

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
      setName('');
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

  const reorder = useMutation({
    mutationFn: (vars: { id: string; previousId: string | null; nextId: string | null }) =>
      reorderItem(vars.id, { previousId: vars.previousId, nextId: vars.nextId }),
    onSettled: () => void invalidate(),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
        <p className="alert error">List not found.</p>
      </main>
    );
  }

  const data = detail.data;
  const isOwner = data.list.role === 'owner';
  const itemIds = data.items.map((item) => item.id);

  function onAddItem(event: FormEvent): void {
    event.preventDefault();
    if (title.trim().length > 0) addItem.mutate();
  }
  function onRename(event: FormEvent): void {
    event.preventDefault();
    if (name.trim().length > 0) rename.mutate();
  }

  function onDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const current = data.items;
    const oldIndex = current.findIndex((item) => item.id === active.id);
    const newIndex = current.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(current, oldIndex, newIndex);
    // Optimistically reflect the new order so the drop feels instant.
    queryClient.setQueryData<ListDetailDto>(listKey(listId), (prev) =>
      prev ? { ...prev, items: reordered } : prev,
    );

    const position = reordered.findIndex((item) => item.id === active.id);
    reorder.mutate({
      id: String(active.id),
      previousId: reordered[position - 1]?.id ?? null,
      nextId: reordered[position + 1]?.id ?? null,
    });
  }

  return (
    <main className="container page">
      <div className="page-header">
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <button
            className="ghost btn-sm"
            onClick={() => navigate('/')}
            style={{ alignSelf: 'flex-start' }}
          >
            ← All lists
          </button>
          <h1>{data.list.name}</h1>
          <div className="row">
            <span className="badge accent">{data.list.kind}</span>
            <span className="badge">{data.list.role}</span>
          </div>
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

      <section className="stack-lg">
        <div className="section-title">
          <h2>Items</h2>
          <span className="subtle">{data.items.length} total</span>
        </div>

        <form className="row" onSubmit={onAddItem}>
          <input
            className="grow"
            aria-label="New item title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Add an item…"
            required
          />
          <button className="primary" type="submit" disabled={addItem.isPending}>
            <PlusIcon />
            <span>Add</span>
          </button>
        </form>

        {data.items.length === 0 ? (
          <div className="empty">
            <p>No items yet.</p>
            <p className="subtle">Add your first item above.</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
              <ul className="items">
                {data.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    listId={listId}
                    item={item}
                    kind={data.list.kind}
                    members={data.members}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </section>

      <details className="card">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>List settings</summary>
        <form className="row" onSubmit={onRename} style={{ marginTop: 'var(--space-4)' }}>
          <input
            className="grow"
            aria-label="Rename list"
            placeholder={data.list.name}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" disabled={rename.isPending || name.trim().length === 0}>
            Rename
          </button>
        </form>
      </details>

      {isOwner && (
        <SharingPanel listId={listId} members={data.members} invitations={data.invitations} />
      )}
    </main>
  );
}
