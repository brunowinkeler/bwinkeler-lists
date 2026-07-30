import { useEffect, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ItemDto, ListKind, MemberDto } from '@bwinkeler-lists/shared';
import { ItemRow } from './ItemRow';
import { TrashIcon } from '../../components/icons';

interface CategoryPanelProps {
  columnId: string;
  name: string;
  /** null identifies the special "Uncategorized" bucket. */
  categoryId: string | null;
  listId: string;
  kind: ListKind;
  members: MemberDto[];
  items: ItemDto[];
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
  onRename,
  onDelete,
}: CategoryPanelProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });
  const isUncategorized = categoryId === null;

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
    <section className={`panel${isUncategorized ? ' panel--uncategorized' : ''}`}>
      <header className="panel__header">
        <span className="panel__title">
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
      <div ref={setNodeRef} className={`panel__body${isOver ? ' is-over' : ''}`}>
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
