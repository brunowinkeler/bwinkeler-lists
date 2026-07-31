import { useEffect, useMemo, useRef, useState, type FocusEvent, type FormEvent } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ItemDto, ListKind, MemberDto } from '@bwinkeler-lists/shared';
import { useDetailsOutsideClose } from '../../lib/useDetailsOutsideClose';
import { ItemRow } from './ItemRow';
import { GripIcon, PlusIcon, TrashIcon } from '../../components/icons';

const CATEGORY_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

interface CategoryPanelProps {
  columnId: string;
  name: string;
  /** null identifies the special "Uncategorized" bucket. */
  categoryId: string | null;
  listId: string;
  kind: ListKind;
  members: MemberDto[];
  items: ItemDto[];
  /** True while an item (not a category) is being dragged, so the drop
   * highlight does not flash while categories are being reordered. */
  itemDragActive: boolean;
  addItemPending: boolean;
  onAddItem: (title: string) => Promise<void>;
  color?: string | null;
  onRecolor?: (color: string | null) => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
}

export function CategoryPanel({
  columnId,
  name,
  categoryId,
  listId,
  kind,
  members,
  items,
  itemDragActive,
  addItemPending,
  onAddItem,
  color,
  onRecolor,
  onRename,
  onDelete,
}: CategoryPanelProps) {
  const isUncategorized = categoryId === null;
  // The full panel is the sortable/draggable node so sibling panels make room
  // by its real height. A separate header target gives category collision
  // detection a compact 50% threshold even when this panel contains many items.
  const sortable = useSortable({
    id: `cat-${columnId}`,
    data: { type: 'category', columnId },
    disabled: isUncategorized,
  });
  const categoryTarget = useDroppable({
    id: `cat-target-${columnId}`,
    disabled: isUncategorized,
  });
  const drop = useDroppable({ id: columnId });
  // Keep the SortableContext identity stable while drag-context state changes.
  // Recreating this array makes dnd-kit briefly disable transitions, which made
  // item displacement animate in one direction but snap in the other.
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const colorRef = useRef<HTMLDetailsElement>(null);
  useDetailsOutsideClose(colorRef);

  const accent = color ?? undefined;
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    ...(accent ? { borderLeftColor: accent, borderLeftWidth: '4px' } : {}),
  };
  const headerStyle = accent
    ? { background: `color-mix(in srgb, ${accent} 14%, var(--surface-2))` }
    : undefined;

  function pickColor(next: string | null): void {
    onRecolor?.(next);
    if (colorRef.current) colorRef.current.open = false;
  }

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [addingItem, setAddingItem] = useState(false);
  const [itemDraft, setItemDraft] = useState('');
  useEffect(() => {
    setDraftName(name);
  }, [name]);

  function commitRename(): void {
    setEditing(false);
    const next = draftName.trim();
    if (next.length > 0 && next !== name && onRename) {
      onRename(next);
    } else {
      setDraftName(name);
    }
  }

  async function submitItem(event: FormEvent): Promise<void> {
    event.preventDefault();
    const next = itemDraft.trim();
    if (next.length === 0) return;
    try {
      await onAddItem(next);
      setItemDraft('');
    } catch {
      // Keep the draft visible so the user can retry after a request failure.
    }
  }

  function cancelItem(): void {
    setItemDraft('');
    setAddingItem(false);
  }

  function handleItemFormBlur(event: FocusEvent<HTMLFormElement>): void {
    // Keep the form open when focus moves to its Add/Cancel buttons; close it
    // only when the user clicks or tabs completely outside the quick-add UI.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      cancelItem();
    }
  }

  return (
    <section
      ref={sortable.setNodeRef}
      style={style}
      className={`panel${isUncategorized ? ' panel--uncategorized' : ''}${sortable.isDragging ? ' is-dragging' : ''}`}
    >
      <header ref={categoryTarget.setNodeRef} className="panel__header" style={headerStyle}>
        <span className="panel__title">
          {!isUncategorized && (
            <button
              type="button"
              className="drag-handle"
              aria-label={`Reorder category “${name}”`}
              ref={sortable.setActivatorNodeRef}
              {...sortable.attributes}
              {...sortable.listeners}
            >
              <GripIcon />
            </button>
          )}
          {isUncategorized ? (
            <span>{name}</span>
          ) : editing ? (
            <input
              className="panel__title-input"
              value={draftName}
              autoFocus
              aria-label="Category name"
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                  setDraftName(name);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <button type="button" className="ghost btn-sm" onClick={() => setEditing(true)}>
              {name}
            </button>
          )}
          <span className="panel__count">{items.length}</span>
        </span>
        {!isUncategorized && (onRecolor || onDelete) && (
          <div className="panel__actions">
            {onRecolor && (
              <details ref={colorRef} className="popover color-picker">
                <summary
                  className="icon-btn"
                  aria-label={`Change color of category “${name}”`}
                  title="Category color"
                >
                  <span
                    className="color-dot"
                    style={color ? { background: color, borderColor: 'transparent' } : undefined}
                  />
                </summary>
                <div className="popover__panel color-picker__panel">
                  {CATEGORY_COLORS.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      className="color-swatch"
                      style={{ background: swatch }}
                      aria-label={`Set color ${swatch}`}
                      aria-pressed={color === swatch}
                      onClick={() => pickColor(swatch)}
                    />
                  ))}
                  <button
                    type="button"
                    className="color-swatch color-swatch--none"
                    aria-label="Clear color"
                    aria-pressed={!color}
                    onClick={() => pickColor(null)}
                  />
                </div>
              </details>
            )}
            {onDelete && (
              <button
                type="button"
                className="icon-btn danger"
                aria-label={`Delete category “${name}”`}
                onClick={onDelete}
              >
                <TrashIcon />
              </button>
            )}
          </div>
        )}
      </header>
      <div
        ref={drop.setNodeRef}
        className={`panel__body${drop.isOver && itemDragActive ? ' is-over' : ''}`}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <ItemRow key={item.id} listId={listId} item={item} kind={kind} members={members} />
          ))}
        </SortableContext>
        {items.length === 0 && <div className="panel__empty">Drop items here</div>}
        {addingItem ? (
          <form className="panel__quick-add" onSubmit={submitItem} onBlur={handleItemFormBlur}>
            <input
              className="grow"
              value={itemDraft}
              autoFocus
              aria-label={`New item for “${name}”`}
              placeholder={`Add to ${name}…`}
              onChange={(event) => setItemDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') cancelItem();
              }}
            />
            <button
              type="submit"
              className="primary btn-sm"
              disabled={addItemPending || itemDraft.trim().length === 0}
            >
              Add
            </button>
            <button type="button" className="ghost btn-sm" onClick={cancelItem}>
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="ghost btn-sm panel__quick-add-trigger"
            aria-label={`Add item to “${name}”`}
            onClick={() => setAddingItem(true)}
          >
            <PlusIcon />
            <span>Add item</span>
          </button>
        )}
      </div>
    </section>
  );
}
