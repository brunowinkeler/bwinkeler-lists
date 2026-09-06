import { describe, expect, it } from 'vitest';
import { describeActivity, formatRelativeTime } from './activity';

describe('describeActivity', () => {
  it('names the actor and the affected item', () => {
    expect(
      describeActivity({
        kind: 'item_added',
        detail: 'Milk',
        actorId: 'user-1',
        actorName: 'Bruno',
      }),
    ).toBe('Bruno added “Milk”');
  });

  it('pluralizes the bulk removal of completed items', () => {
    expect(
      describeActivity({ kind: 'items_cleared', detail: '3', actorId: null, actorName: 'Raquel' }),
    ).toBe('Raquel cleared 3 completed items');
    expect(
      describeActivity({ kind: 'items_cleared', detail: '1', actorId: null, actorName: 'Raquel' }),
    ).toBe('Raquel cleared 1 completed item');
  });

  it('falls back to a generic phrase without actor or detail', () => {
    expect(
      describeActivity({ kind: 'item_completed', detail: null, actorId: null, actorName: null }),
    ).toBe('Completed an item');
  });

  it('returns nothing for a list that was never changed', () => {
    expect(describeActivity(null)).toBeNull();
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-09-06T12:00:00.000Z');

  it('reports recent changes as just now', () => {
    expect(formatRelativeTime('2026-09-06T11:59:30.000Z', now)).toBe('just now');
  });

  it('reports minutes, hours, and days', () => {
    expect(formatRelativeTime('2026-09-06T11:45:00.000Z', now)).toBe('15 minutes ago');
    expect(formatRelativeTime('2026-09-06T09:00:00.000Z', now)).toBe('3 hours ago');
    expect(formatRelativeTime('2026-09-05T09:00:00.000Z', now)).toBe('yesterday');
  });

  it('falls back to an absolute date beyond a month', () => {
    expect(formatRelativeTime('2026-06-01T09:00:00.000Z', now)).toMatch(/Jun 1, 2026/);
  });
});
