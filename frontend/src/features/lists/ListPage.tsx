import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { DuplicateListInput, ItemDto, ListDetailDto } from '@bwinkeler-lists/shared';
import { realtime } from '../../lib/ws-client';
import {
  createCategory,
  createItem,
  deleteCategory,
  deleteList,
  duplicateList,
  fetchListDetail,
  listKey,
  listsKey,
  renameCategory,
  renameList,
  reorderItem,
} from './api';
import { CategoryPanel } from './CategoryPanel';
import { DuplicateDialog } from './DuplicateDialog';
import { SharingPanel } from '../sharing/SharingPanel';
import { CopyIcon, PlusIcon } from '../../components/icons';

const UNCATEGORIZED = 'uncategorized';

interface Column {
  id: string;
  categoryId: string | null;
  name: string;
}

type Board = Record<string, ItemDto[]>;

function buildBoard(detail: ListDetailDto): { columns: Column[]; board: Board } {
  const columns: Column[] = [
    { id: UNCATEGORIZED, categoryId: null, name: 'Uncategorized' },
    ...detail.categories.map((category) => ({
      id: category.id,
      categoryId: category.id,
      name: category.name,
    })),
  ];
  const columnIds = new Set(columns.map((column) => column.id));
  const board: Board = {};
  for (const column of columns) board[column.id] = [];
  for (const item of detail.items) {
    const key = item.categoryId && columnIds.has(item.categoryId) ? item.categoryId : UNCATEGORIZED;
    board[key]?.push(item);
  }
  return { columns, board };
}

function findColumnIn(board: Board, id: string): string | undefined {
  if (id in board) return id;
  return Object.keys(board).find((column) => board[column]?.some((item) => item.id === id));
}

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

  // Local board mirrors the server data but can be mutated during a drag so the
  // interaction feels instant; it re-syncs from the query whenever we are idle.
  const [columns, setColumns] = useState<Column[]>([]);
  const [board, setBoard] = useState<Board>({});
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!detail.data || draggingRef.current) return;
    const built = buildBoard(detail.data);
    setColumns(built.columns);
    setBoard(built.board);
  }, [detail.data]);

  const [title, setTitle] = useState('');
  const addItem = useMutation({
    mutationFn: () => createItem(listId, { title: title.trim() }),
    onSuccess: () => {
      setTitle('');
      void invalidate();
    },
  });

  const [newCategory, setNewCategory] = useState('');
  const categoryCreate = useMutation({
    mutationFn: (categoryName: string) => createCategory(listId, categoryName),
    onSuccess: () => {
      setNewCategory('');
      void invalidate();
    },
  });
  const categoryRename = useMutation({
    mutationFn: (vars: { id: string; name: string }) => renameCategory(vars.id, vars.name),
    onSuccess: () => void invalidate(),
  });
  const categoryDelete = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => void invalidate(),
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
    mutationFn: (vars: {
      id: string;
      categoryId: string | null;
      previousId: string | null;
      nextId: string | null;
    }) =>
      reorderItem(vars.id, {
        categoryId: vars.categoryId,
        previousId: vars.previousId,
        nextId: vars.nextId,
      }),
    onSettled: () => void invalidate(),
  });

  const [showDuplicate, setShowDuplicate] = useState(false);
  const duplicate = useMutation({
    mutationFn: (options: DuplicateListInput) => duplicateList(listId, options),
    onSuccess: async (result) => {
      setShowDuplicate(false);
      await queryClient.invalidateQueries({ queryKey: listsKey });
      navigate(`/lists/${result.list.id}`);
    },
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

  function onAddItem(event: FormEvent): void {
    event.preventDefault();
    if (title.trim().length > 0) addItem.mutate();
  }
  function onRename(event: FormEvent): void {
    event.preventDefault();
    if (name.trim().length > 0) rename.mutate();
  }
  function onAddCategory(event: FormEvent): void {
    event.preventDefault();
    if (newCategory.trim().length > 0) categoryCreate.mutate(newCategory.trim());
  }

  function resync(): void {
    if (detail.data) {
      const built = buildBoard(detail.data);
      setColumns(built.columns);
      setBoard(built.board);
    }
  }

  function onDragStart(): void {
    draggingRef.current = true;
  }

  function onDragOver(event: DragOverEvent): void {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    setBoard((prev) => {
      const from = findColumnIn(prev, activeId);
      const to = findColumnIn(prev, overId);
      if (!from || !to || from === to) return prev;
      const fromItems = prev[from] ?? [];
      const toItems = prev[to] ?? [];
      const moving = fromItems.find((item) => item.id === activeId);
      if (!moving) return prev;
      const overIndex = toItems.findIndex((item) => item.id === overId);
      const insertAt =
        overId in prev ? toItems.length : overIndex >= 0 ? overIndex : toItems.length;
      return {
        ...prev,
        [from]: fromItems.filter((item) => item.id !== activeId),
        [to]: [...toItems.slice(0, insertAt), moving, ...toItems.slice(insertAt)],
      };
    });
  }

  function onDragEnd(event: DragEndEvent): void {
    draggingRef.current = false;
    const { active, over } = event;
    if (!over) {
      resync();
      return;
    }
    const activeId = String(active.id);
    const overId = String(over.id);

    let targetColumn: string | undefined;
    let finalItems: ItemDto[] = [];
    setBoard((prev) => {
      const from = findColumnIn(prev, activeId);
      const to = findColumnIn(prev, overId);
      if (!from || !to) return prev;
      let next = prev;
      if (from === to) {
        const items = prev[to] ?? [];
        const oldIndex = items.findIndex((item) => item.id === activeId);
        const newIndex =
          overId in prev ? items.length - 1 : items.findIndex((item) => item.id === overId);
        if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
          next = { ...prev, [to]: arrayMove(items, oldIndex, newIndex) };
        }
      }
      targetColumn = to;
      finalItems = next[to] ?? [];
      return next;
    });

    if (!targetColumn) {
      resync();
      return;
    }
    const index = finalItems.findIndex((item) => item.id === activeId);
    reorder.mutate({
      id: activeId,
      categoryId: targetColumn === UNCATEGORIZED ? null : targetColumn,
      previousId: finalItems[index - 1]?.id ?? null,
      nextId: finalItems[index + 1]?.id ?? null,
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
        <div className="row">
          <button onClick={() => setShowDuplicate(true)}>
            <CopyIcon />
            <span>Duplicate</span>
          </button>
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

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <div className="board">
            {columns.map((column) => (
              <CategoryPanel
                key={column.id}
                columnId={column.id}
                name={column.name}
                categoryId={column.categoryId}
                listId={listId}
                kind={data.list.kind}
                members={data.members}
                items={board[column.id] ?? []}
                onRename={
                  column.categoryId
                    ? (nextName) =>
                        categoryRename.mutate({ id: column.categoryId as string, name: nextName })
                    : undefined
                }
                onDelete={
                  column.categoryId
                    ? () => {
                        if (
                          window.confirm(
                            `Delete category “${column.name}”? Its items move back to Uncategorized.`,
                          )
                        ) {
                          categoryDelete.mutate(column.categoryId as string);
                        }
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </DndContext>

        <form className="add-category" onSubmit={onAddCategory}>
          <input
            className="grow"
            aria-label="New category name"
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            placeholder="New category (e.g. Produce)"
          />
          <button
            type="submit"
            disabled={categoryCreate.isPending || newCategory.trim().length === 0}
          >
            <PlusIcon />
            <span>Add category</span>
          </button>
        </form>
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

      {showDuplicate && (
        <DuplicateDialog
          defaultName={data.list.name}
          pending={duplicate.isPending}
          onCancel={() => setShowDuplicate(false)}
          onConfirm={(options) => duplicate.mutate(options)}
        />
      )}
    </main>
  );
}
