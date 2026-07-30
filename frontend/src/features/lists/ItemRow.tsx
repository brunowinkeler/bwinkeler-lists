import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ItemDto, ListKind, MemberDto } from '@bwinkeler-lists/shared';
import { deleteItem, listKey, reorderItem, updateItem } from './api';

interface ItemRowProps {
  listId: string;
  item: ItemDto;
  kind: ListKind;
  members: MemberDto[];
  index: number;
  items: ItemDto[];
}

export function ItemRow({ listId, item, kind, members, index, items }: ItemRowProps) {
  const queryClient = useQueryClient();
  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: listKey(listId) });

  const update = useMutation({
    mutationFn: (input: Parameters<typeof updateItem>[1]) => updateItem(item.id, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: () => deleteItem(item.id), onSuccess: invalidate });
  const move = useMutation({
    mutationFn: (input: Parameters<typeof reorderItem>[1]) => reorderItem(item.id, input),
    onSuccess: invalidate,
  });

  const [title, setTitle] = useState(item.title);

  function commitTitle(): void {
    const next = title.trim();
    if (next.length > 0 && next !== item.title) {
      update.mutate({ title: next });
    }
  }

  function moveUp(): void {
    if (index === 0) return;
    move.mutate({ previousId: items[index - 2]?.id ?? null, nextId: items[index - 1]?.id ?? null });
  }
  function moveDown(): void {
    if (index >= items.length - 1) return;
    move.mutate({ previousId: items[index + 1]?.id ?? null, nextId: items[index + 2]?.id ?? null });
  }

  return (
    <li className="card stack">
      <div className="row" style={{ justifyContent: 'space-between', gap: '0.5rem' }}>
        <div className="row" style={{ flex: 1 }}>
          <input
            type="checkbox"
            checked={item.status === 'done'}
            aria-label={`Mark “${item.title}” as done`}
            onChange={(event) => update.mutate({ status: event.target.checked ? 'done' : 'open' })}
          />
          <input
            aria-label="Item title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commitTitle}
            style={{
              flex: 1,
              textDecoration: item.status === 'done' ? 'line-through' : 'none',
            }}
          />
        </div>
        <div className="row">
          <button aria-label="Move up" onClick={moveUp} disabled={index === 0}>
            Up
          </button>
          <button aria-label="Move down" onClick={moveDown} disabled={index >= items.length - 1}>
            Down
          </button>
          <button
            className="danger"
            aria-label={`Delete “${item.title}”`}
            onClick={() => remove.mutate()}
          >
            Delete
          </button>
        </div>
      </div>

      {kind === 'task' && (
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <label>
            Due date
            <input
              type="date"
              value={item.dueDate ?? ''}
              onChange={(event) => update.mutate({ dueDate: event.target.value || null })}
            />
          </label>
          <label>
            Assignee
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
          </label>
          <label style={{ flex: 1, minWidth: 180 }}>
            Notes
            <input
              aria-label="Notes"
              defaultValue={item.notes ?? ''}
              onBlur={(event) => {
                const value = event.target.value;
                if (value !== (item.notes ?? '')) {
                  update.mutate({ notes: value || null });
                }
              }}
              style={{ width: '100%' }}
            />
          </label>
        </div>
      )}
    </li>
  );
}
