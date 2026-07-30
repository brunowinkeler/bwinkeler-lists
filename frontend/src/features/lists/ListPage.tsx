import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
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
  recolorCategory,
  renameCategory,
  renameList,
  reorderCategory,
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
  color: string | null;
}

type Board = Record<string, ItemDto[]>;

function buildBoard(detail: ListDetailDto): { columns: Column[]; board: Board } {
  const columns: Column[] = [
    { id: UNCATEGORIZED, categoryId: null, name: 'Uncategorized', color: null },
    ...detail.categories.map((category) => ({
      id: category.id,
      categoryId: category.id,
      name: category.name,
      color: category.color,
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
  const [activeType, setActiveType] = useState<'item' | 'category' | null>(null);
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
  const categoryRecolor = useMutation({
    mutationFn: (vars: { id: string; color: string | null }) =>
      recolorCategory(vars.id, vars.color),
    onSuccess: () => void invalidate(),
  });
  const categoryDelete = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => void invalidate(),
  });

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const rename = useMutation({
    mutationFn: () => renameList(listId, nameDraft.trim()),
    onSuccess: () => {
      setEditingName(false);
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

  const categoryReorder = useMutation({
    mutationFn: (vars: { id: string; previousId: string | null; nextId: string | null }) =>
      reorderCategory(vars.id, { previousId: vars.previousId, nextId: vars.nextId }),
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

  // Multi-container collision detection: categories collide only with other
  // categories; items use the pointer and resolve container hits to the closest
  // item inside, so both cross-category moves and in-category reordering work.
  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const activeId = String(args.active.id);
      // Category drag: collide only with the other category headers.
      if (activeId.startsWith('cat-')) {
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((c) =>
            String(c.id).startsWith('cat-'),
          ),
        });
      }
      // Item drag: ignore category headers and the item being dragged; use the
      // pointer and resolve a bucket hit to the closest item inside it.
      const itemArgs = {
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (c) => String(c.id) !== activeId && !String(c.id).startsWith('cat-'),
        ),
      };
      const pointerCollisions = pointerWithin(itemArgs);
      const intersections =
        pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(itemArgs);
      const overId = getFirstCollision(intersections, 'id');
      if (overId == null) return [];
      const overIdStr = String(overId);
      if (overIdStr in board) {
        const itemIds = new Set((board[overIdStr] ?? []).map((item) => item.id));
        if (itemIds.size > 0) {
          const closest = closestCenter({
            ...itemArgs,
            droppableContainers: itemArgs.droppableContainers.filter(
              (c) => String(c.id) !== overIdStr && itemIds.has(String(c.id)),
            ),
          });
          if (closest.length > 0) return closest;
        }
      }
      return [{ id: overId }];
    },
    [board],
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
  function onRenameSubmit(event: FormEvent): void {
    event.preventDefault();
    const next = nameDraft.trim();
    if (next.length > 0 && next !== data.list.name) rename.mutate();
    else setEditingName(false);
  }
  function startRename(): void {
    setNameDraft(data.list.name);
    setEditingName(true);
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

  function onDragStart(event: DragStartEvent): void {
    draggingRef.current = true;
    setActiveType(String(event.active.id).startsWith('cat-') ? 'category' : 'item');
  }

  function onDragCancel(): void {
    draggingRef.current = false;
    setActiveType(null);
    resync();
  }

  function handleCategoryDragEnd(activeCatId: string, overCatId: string): void {
    const activeColumnId = activeCatId.slice(4);
    const order = columns.filter((column) => column.categoryId).map((column) => column.id);
    const oldIndex = order.indexOf(activeColumnId);
    if (oldIndex < 0) {
      resync();
      return;
    }
    const overColumnId = overCatId.startsWith('cat-') ? overCatId.slice(4) : overCatId;
    const newIndex =
      overColumnId && overColumnId !== UNCATEGORIZED ? order.indexOf(overColumnId) : 0;
    if (newIndex < 0) {
      resync();
      return;
    }
    const newOrder = arrayMove(order, oldIndex, newIndex);
    setColumns((prev) => {
      const byId = new Map(prev.map((column) => [column.id, column]));
      const uncategorized = prev.find((column) => column.categoryId === null);
      const rebuilt: Column[] = uncategorized ? [uncategorized] : [];
      for (const id of newOrder) {
        const column = byId.get(id);
        if (column) rebuilt.push(column);
      }
      return rebuilt;
    });
    const pos = newOrder.indexOf(activeColumnId);
    categoryReorder.mutate({
      id: activeColumnId,
      previousId: newOrder[pos - 1] ?? null,
      nextId: newOrder[pos + 1] ?? null,
    });
  }

  function onDragOver(event: DragOverEvent): void {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId.startsWith('cat-')) return;
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
    setActiveType(null);
    const { active, over } = event;
    if (!over) {
      resync();
      return;
    }
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith('cat-')) {
      handleCategoryDragEnd(activeId, overId);
      return;
    }

    // Compute the placement from the current board (already reflecting any
    // cross-bucket move applied during onDragOver). Reading values out of a
    // setState updater would be stale because React defers it.
    const from = findColumnIn(board, activeId);
    const to = findColumnIn(board, overId);
    if (!from || !to) {
      resync();
      return;
    }
    let targetItems = board[to] ?? [];
    if (from === to) {
      const oldIndex = targetItems.findIndex((item) => item.id === activeId);
      const newIndex =
        overId in board
          ? targetItems.length - 1
          : targetItems.findIndex((item) => item.id === overId);
      if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
        targetItems = arrayMove(targetItems, oldIndex, newIndex);
        setBoard((prev) => ({ ...prev, [to]: targetItems }));
      }
    }
    const index = targetItems.findIndex((item) => item.id === activeId);
    reorder.mutate({
      id: activeId,
      categoryId: to === UNCATEGORIZED ? null : to,
      previousId: targetItems[index - 1]?.id ?? null,
      nextId: targetItems[index + 1]?.id ?? null,
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
          {editingName ? (
            <form className="row" onSubmit={onRenameSubmit}>
              <input
                className="title-input grow"
                aria-label="List name"
                value={nameDraft}
                autoFocus
                onChange={(event) => setNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setEditingName(false);
                }}
              />
              <button className="primary" type="submit" disabled={rename.isPending}>
                Rename
              </button>
              <button type="button" className="ghost" onClick={() => setEditingName(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <h1 className="editable-title" title="Click to rename" onClick={startRename}>
              {data.list.name}
            </h1>
          )}
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
          collisionDetection={collisionDetection}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <div className="board">
            <SortableContext
              items={columns.map((column) => `cat-${column.id}`)}
              strategy={verticalListSortingStrategy}
            >
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
                  itemDragActive={activeType === 'item'}
                  color={column.color}
                  onRecolor={
                    column.categoryId
                      ? (nextColor) =>
                          categoryRecolor.mutate({
                            id: column.categoryId as string,
                            color: nextColor,
                          })
                      : undefined
                  }
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
            </SortableContext>
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
