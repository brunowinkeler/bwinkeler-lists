import { useEffect, useState } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ItemDto, ListKind, MemberDto } from '@bwinkeler-lists/shared';
import { ItemRow } from './ItemRow';
import { GripIcon, TrashIcon } from '../../components/icons';

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
  onRename,
  onDelete,
}: CategoryPanelProps) {
  const isUncategorized = categoryId === null;
  const { setNodeRef, attributes, listeners, transform, transition, isOver, isDragging } =
    useSortable({
      id: columnId,
      data: { type: 'category' },
      // Uncategorized stays pinned (not draggable) but still accepts item drops.
      disabled: isUncategorized ? { draggable: true, droppable: false } : false,
    });
  const style = { transform: CSS.Transform.toString(transform), transition };

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
      ref={setNodeRef}
      style={style}
      className={`panel${isUncategorized ? ' panel--uncategorized' : ''}${isDragging ? ' is-dragging' : ''}`}
    >
      <header className="panel__header">
        <span className="panel__title">
          {!isUncategorized && (
            <button
              type="button"
              className="drag-handle"
              aria-label={`Reorder category “${name}”`}
              {...attributes}
              {...listeners}
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
        {!isUncategorized && onDelete && (
          <button
            type="button"
            className="icon-btn danger"
            aria-label={`Delete category “${name}”`}
            onClick={onDelete}
          >
            <TrashIcon />
          </button>
        )}
      </header>
      <div className={`panel__body${isOver && itemDragActive ? ' is-over' : ''}`}>
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
