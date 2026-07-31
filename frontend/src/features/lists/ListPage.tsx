import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
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
import { CopyIcon, GripIcon, PlusIcon } from '../../components/icons';

const UNCATEGORIZED = 'uncategorized';
const CATEGORY_TARGET_PREFIX = 'cat-target-';

interface Column {
  id: string;
  categoryId: string | null;
  name: string;
  color: string | null;
}

type Board = Record<string, ItemDto[]>;

function buildBoard(detail: ListDetailDto): { columns: Column[]; board: Board } {
  const columns: Column[] = [
    ...detail.categories.map((category) => ({
      id: category.id,
      categoryId: category.id,
      name: category.name,
      color: category.color,
    })),
    // Uncategorized always sits at the bottom; new categories appear above it.
    { id: UNCATEGORIZED, categoryId: null, name: 'Uncategorized', color: null },
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const draggingRef = useRef(false);
  // The item's bucket + index when the drag started, used to detect a drop back
  // in the same place (so we don't reorder when nothing actually changed).
  const dragOriginRef = useRef<{ bucket: string; index: number } | null>(null);

  useEffect(() => {
    if (!detail.data || draggingRef.current) return;
    const built = buildBoard(detail.data);
    setColumns(built.columns);
    setBoard(built.board);
  }, [detail.data]);

  const [title, setTitle] = useState('');
  const addItem = useMutation({
    mutationFn: (input: { title: string; categoryId: string | null }) => createItem(listId, input),
    onSuccess: () => void invalidate(),
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
  const categorySortableIds = useMemo(
    () => columns.filter((column) => column.categoryId).map((column) => `cat-${column.id}`),
    [columns],
  );

  // Multi-container collision detection with an explicit 50% threshold. The
  // insertion slot advances only after the POINTER crosses a target's vertical
  // midpoint. closestCenter compares distances between rectangles, which can
  // switch much earlier than 50% when the active row itself is a candidate.
  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const activeDragId = String(args.active.id);
      if (activeDragId.startsWith('cat-')) {
        const categoryContainers = args.droppableContainers.filter((container) =>
          categorySortableIds.includes(String(container.id)),
        );
        if (!args.pointerCoordinates) {
          return closestCenter({ ...args, droppableContainers: categoryContainers });
        }

        const order = categorySortableIds;
        const activeIndex = order.indexOf(activeDragId);
        if (activeIndex < 0) return [];

        const remaining = order.filter((id) => id !== activeDragId);
        const insertionIndex = remaining.reduce((index, id) => {
          const columnId = id.slice(4);
          const rect =
            args.droppableRects.get(`${CATEGORY_TARGET_PREFIX}${columnId}`) ??
            args.droppableRects.get(id);
          return rect && args.pointerCoordinates!.y > rect.top + rect.height / 2
            ? index + 1
            : index;
        }, 0);
        const newIndex = Math.min(insertionIndex, order.length - 1);
        return [{ id: newIndex === activeIndex ? activeDragId : order[newIndex]! }];
      }

      const containers = args.droppableContainers.filter((c) => !String(c.id).startsWith('cat-'));
      // Find the bucket under the pointer, ignoring the dragged item itself: its
      // rect follows the cursor and would otherwise always capture the pointer.
      const probe = containers.filter((c) => String(c.id) !== activeDragId);
      const pointer = pointerWithin({ ...args, droppableContainers: probe });
      const hit = getFirstCollision(
        pointer.length > 0 ? pointer : rectIntersection({ ...args, droppableContainers: probe }),
        'id',
      );
      if (hit == null) return [];
      const bucketId =
        String(hit) in board ? String(hit) : (findColumnIn(board, String(hit)) ?? String(hit));
      const bucketItems = board[bucketId] ?? [];
      if (bucketItems.length === 0) return [{ id: bucketId }];
      const itemContainers = containers.filter((c) =>
        bucketItems.some((item) => item.id === String(c.id)),
      );
      if (!args.pointerCoordinates) {
        const closest = closestCenter({ ...args, droppableContainers: itemContainers });
        return closest.length > 0 ? closest : [{ id: bucketId }];
      }

      const order = bucketItems.map((item) => item.id);
      const activeIndex = order.indexOf(activeDragId);
      const remaining = order.filter((id) => id !== activeDragId);
      const insertionIndex = remaining.reduce((index, id) => {
        const rect = args.droppableRects.get(id);
        return rect && args.pointerCoordinates!.y > rect.top + rect.height / 2 ? index + 1 : index;
      }, 0);

      // The item has just entered another bucket: onDragOver inserts before the
      // returned item (or appends when the pointer is below every midpoint).
      if (activeIndex < 0) {
        return [{ id: remaining[insertionIndex] ?? bucketId }];
      }

      const newIndex = Math.min(insertionIndex, order.length - 1);
      return [{ id: newIndex === activeIndex ? activeDragId : order[newIndex]! }];
    },
    [board, categorySortableIds],
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

  async function onAddItem(event: FormEvent): Promise<void> {
    event.preventDefault();
    const nextTitle = title.trim();
    if (nextTitle.length === 0) return;
    try {
      await addItem.mutateAsync({ title: nextTitle, categoryId: null });
      setTitle('');
    } catch {
      // The mutation exposes its error state; keep the draft so the user can retry.
    }
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
    const id = String(event.active.id);
    setActiveType(id.startsWith('cat-') ? 'category' : 'item');
    setActiveId(id);
    if (id.startsWith('cat-')) {
      dragOriginRef.current = null;
    } else {
      const bucket = findColumnIn(board, id);
      dragOriginRef.current = bucket
        ? { bucket, index: (board[bucket] ?? []).findIndex((item) => item.id === id) }
        : null;
    }
  }

  function onDragCancel(): void {
    draggingRef.current = false;
    setActiveType(null);
    setActiveId(null);
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
      !overColumnId || overColumnId === UNCATEGORIZED
        ? order.length - 1
        : order.indexOf(overColumnId);
    if (newIndex < 0) {
      resync();
      return;
    }
    if (oldIndex === newIndex) {
      // Dropped in the same position — nothing to reorder.
      resync();
      return;
    }
    const newOrder = arrayMove(order, oldIndex, newIndex);
    setColumns((prev) => {
      const byId = new Map(prev.map((column) => [column.id, column]));
      const uncategorized = prev.find((column) => column.categoryId === null);
      const rebuilt: Column[] = [];
      for (const id of newOrder) {
        const column = byId.get(id);
        if (column) rebuilt.push(column);
      }
      // Uncategorized always stays at the bottom.
      if (uncategorized) rebuilt.push(uncategorized);
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
    setActiveId(null);
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
    const origin = dragOriginRef.current;
    if (origin && origin.bucket === to && origin.index === index) {
      // Dropped back where it started — revert transient drag state, no reorder.
      resync();
      return;
    }
    reorder.mutate({
      id: activeId,
      categoryId: to === UNCATEGORIZED ? null : to,
      previousId: targetItems[index - 1]?.id ?? null,
      nextId: targetItems[index + 1]?.id ?? null,
    });
  }

  const realCategories = columns.filter((column) => column.categoryId);
  const uncategorizedColumn = columns.find((column) => column.categoryId === null);
  const activeItem =
    activeType === 'item' && activeId
      ? (Object.values(board)
          .flat()
          .find((item) => item.id === activeId) ?? null)
      : null;
  const activeColumn =
    activeType === 'category' && activeId
      ? (columns.find((column) => `cat-${column.id}` === activeId) ?? null)
      : null;

  function renderPanel(column: Column) {
    return (
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
        addItemPending={addItem.isPending}
        onAddItem={async (itemTitle) => {
          await addItem.mutateAsync({ title: itemTitle, categoryId: column.categoryId });
        }}
        color={column.color}
        onRecolor={
          column.categoryId
            ? (nextColor) =>
                categoryRecolor.mutate({ id: column.categoryId as string, color: nextColor })
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
    );
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
          measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <div className="board">
            <SortableContext items={categorySortableIds} strategy={verticalListSortingStrategy}>
              {realCategories.map(renderPanel)}
            </SortableContext>
            {uncategorizedColumn && renderPanel(uncategorizedColumn)}
          </div>
          <DragOverlay>
            {activeItem ? (
              <div className="item drag-overlay">
                <div className="item__main">
                  <span className="drag-handle" aria-hidden="true">
                    <GripIcon />
                  </span>
                  <span className="item__title">{activeItem.title}</span>
                </div>
              </div>
            ) : activeColumn ? (
              <div
                className="panel drag-overlay"
                style={
                  activeColumn.color
                    ? { borderLeftColor: activeColumn.color, borderLeftWidth: '4px' }
                    : undefined
                }
              >
                <div
                  className="panel__header"
                  style={
                    activeColumn.color
                      ? {
                          background: `color-mix(in srgb, ${activeColumn.color} 14%, var(--surface-2))`,
                        }
                      : undefined
                  }
                >
                  <span className="panel__title">
                    <span className="drag-handle" aria-hidden="true">
                      <GripIcon />
                    </span>
                    <span>{activeColumn.name}</span>
                    <span className="panel__count">{(board[activeColumn.id] ?? []).length}</span>
                  </span>
                </div>
                <div className="panel__body">
                  {(board[activeColumn.id] ?? []).map((item) => (
                    <div key={item.id} className="item">
                      <div className="item__main">
                        <span className="drag-handle" aria-hidden="true">
                          <GripIcon />
                        </span>
                        <span className="item__title">{item.title}</span>
                      </div>
                    </div>
                  ))}
                  {(board[activeColumn.id] ?? []).length === 0 && (
                    <div className="panel__empty">Drop items here</div>
                  )}
                </div>
              </div>
            ) : null}
          </DragOverlay>
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
