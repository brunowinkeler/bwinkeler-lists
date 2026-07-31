import { describe, expect, it } from 'vitest';
import type { CategoryDto, ListDetailDto, ListSnapshot } from '@bwinkeler-lists/shared';
import { mergeSnapshot } from './RealtimeSync';

const oldCategory: CategoryDto = {
  id: 'old-category',
  listId: 'list-1',
  name: 'Old category',
  color: null,
  position: 'a0',
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:00:00.000Z',
};

const reorderedCategory: CategoryDto = {
  ...oldCategory,
  name: 'Reordered category',
  color: '#3b82f6',
  position: 'z0',
};

const previous: ListDetailDto = {
  list: {
    id: 'list-1',
    name: 'Before',
    kind: 'task',
    role: 'owner',
    ownerId: 'owner-1',
    pinned: false,
    version: 1,
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  },
  members: [],
  categories: [oldCategory],
  items: [],
  invitations: [],
};

const snapshot: ListSnapshot = {
  listId: 'list-1',
  version: 2,
  name: 'After',
  kind: 'task',
  ownerId: 'owner-1',
  members: [],
  categories: [reorderedCategory],
  items: [],
};

describe('mergeSnapshot', () => {
  it('applies realtime category order, names, and colors', () => {
    const merged = mergeSnapshot(previous, snapshot);

    expect(merged?.categories).toEqual(snapshot.categories);
    expect(merged?.list.version).toBe(2);
    expect(merged?.invitations).toBe(previous.invitations);
  });

  it('does not create list detail before the query is loaded', () => {
    expect(mergeSnapshot(undefined, snapshot)).toBeUndefined();
  });
});
