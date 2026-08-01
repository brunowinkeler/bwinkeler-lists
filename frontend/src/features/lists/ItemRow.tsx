import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ItemDto, ListKind, MemberDto } from '@bwinkeler-lists/shared';
import { listKey, updateItem } from './api';
import { GripIcon } from '../../components/icons';

interface ItemRowProps {
  listId: string;
  item: ItemDto;
  kind: ListKind;
  members: MemberDto[];
}

export function ItemRow({ listId, item, kind, members }: ItemRowProps) {
  const queryClient = useQueryClient();
  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: listKey(listId) });

  const update = useMutation({
    mutationFn: (input: Parameters<typeof updateItem>[1]) => updateItem(item.id, input),
    onSuccess: invalidate,
  });

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const [title, setTitle] = useState(item.title);
  const titleRef = useRef<HTMLInputElement>(null);
  // Keep the local draft in sync with realtime updates, but never clobber the
  // value while the user is actively editing this field.
  useEffect(() => {
    if (document.activeElement !== titleRef.current) {
      setTitle(item.title);
    }
  }, [item.title]);

  function commitTitle(): void {
    const next = title.trim();
    if (next.length === 0) {
      setTitle(item.title);
      return;
    }
    if (next !== item.title) {
      update.mutate({ title: next });
    }
  }

  const isDone = item.status === 'done';

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`item${isDone ? ' is-done' : ''}${isDragging ? ' is-dragging' : ''}`}
    >
      <div className="item__main">
        <button
          type="button"
          className="drag-handle"
          aria-label="Drag to reorder"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
        >
          <GripIcon />
        </button>
        <input
          type="checkbox"
          className="checkbox"
          checked={isDone}
          aria-label={`Mark “${item.title}” as done`}
          onChange={(event) => update.mutate({ status: event.target.checked ? 'done' : 'open' })}
        />
        <input
          ref={titleRef}
          className={`item__title${isDone ? ' is-done' : ''}`}
          aria-label="Item title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </div>

      {kind === 'task' && (
        <div className="item__meta">
          <div className="field">
            <label>Due date</label>
            <input
              type="date"
              value={item.dueDate ?? ''}
              onChange={(event) => update.mutate({ dueDate: event.target.value || null })}
            />
          </div>
          <div className="field">
            <label>Assignee</label>
            <select
              value={item.assigneeId ?? ''}
              onChange={(event) => update.mutate({ assigneeId: event.target.value || null })}
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Notes</label>
            <input
              aria-label="Notes"
              defaultValue={item.notes ?? ''}
              placeholder="Add notes…"
              onBlur={(event) => {
                const value = event.target.value;
                if (value !== (item.notes ?? '')) {
                  update.mutate({ notes: value || null });
                }
              }}
            />
          </div>
        </div>
      )}
    </li>
  );
}
