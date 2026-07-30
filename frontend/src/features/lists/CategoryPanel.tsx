import { useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ItemDto, ListKind, MemberDto } from '@bwinkeler-lists/shared';
import { useDetailsOutsideClose } from '../../lib/useDetailsOutsideClose';
import { ItemRow } from './ItemRow';
import { GripIcon, TrashIcon } from '../../components/icons';

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
  color,
  onRecolor,
  onRename,
  onDelete,
}: CategoryPanelProps) {
  const isUncategorized = categoryId === null;
  // The header is the sortable node used for category reordering; the body is a
  // separate droppable that receives items. Keeping items OUT of the sortable
  // node avoids nesting draggables (which stops item dragging from working).
  const sortable = useSortable({
    id: `cat-${columnId}`,
    data: { type: 'category', columnId },
    disabled: isUncategorized,
    animateLayoutChanges: () => false,
  });
  const drop = useDroppable({ id: columnId });
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

  return (
    <section
      style={style}
      className={`panel${isUncategorized ? ' panel--uncategorized' : ''}${sortable.isDragging ? ' is-dragging' : ''}`}
    >
      <header ref={sortable.setNodeRef} className="panel__header" style={headerStyle}>
        <span className="panel__title">
          {!isUncategorized && (
            <button
              type="button"
              className="drag-handle"
              aria-label={`Reorder category “${name}”`}
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
        <SortableContext
          items={items.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item) => (
            <ItemRow key={item.id} listId={listId} item={item} kind={kind} members={members} />
          ))}
        </SortableContext>
        {items.length === 0 && <div className="panel__empty">Drop items here</div>}
      </div>
    </section>
  );
}
