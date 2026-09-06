import type { ListActivityDto, ListActivityKind } from '@bwinkeler-lists/shared';

const PHRASES: Record<ListActivityKind, { withDetail: (detail: string) => string; plain: string }> =
  {
    item_added: { withDetail: (detail) => `added “${detail}”`, plain: 'added an item' },
    item_renamed: {
      withDetail: (detail) => `renamed an item to “${detail}”`,
      plain: 'renamed an item',
    },
    item_completed: { withDetail: (detail) => `completed “${detail}”`, plain: 'completed an item' },
    item_reopened: { withDetail: (detail) => `reopened “${detail}”`, plain: 'reopened an item' },
    item_updated: { withDetail: (detail) => `edited “${detail}”`, plain: 'edited an item' },
    item_moved: { withDetail: (detail) => `moved “${detail}”`, plain: 'moved an item' },
    item_removed: { withDetail: (detail) => `removed “${detail}”`, plain: 'removed an item' },
    items_cleared: {
      withDetail: (detail) => {
        const count = Number(detail);
        return Number.isFinite(count) && count > 0
          ? `cleared ${count} completed ${count === 1 ? 'item' : 'items'}`
          : 'cleared the completed items';
      },
      plain: 'cleared the completed items',
    },
    category_added: {
      withDetail: (detail) => `added the category “${detail}”`,
      plain: 'added a category',
    },
    category_renamed: {
      withDetail: (detail) => `renamed a category to “${detail}”`,
      plain: 'renamed a category',
    },
    category_updated: {
      withDetail: (detail) => `updated the category “${detail}”`,
      plain: 'updated a category',
    },
    category_moved: {
      withDetail: (detail) => `moved the category “${detail}”`,
      plain: 'moved a category',
    },
    category_removed: {
      withDetail: (detail) => `removed the category “${detail}”`,
      plain: 'removed a category',
    },
    list_renamed: {
      withDetail: (detail) => `renamed the list to “${detail}”`,
      plain: 'renamed the list',
    },
  };

/** Human-readable sentence for the single last change recorded on a list. */
export function describeActivity(activity: ListActivityDto | null | undefined): string | null {
  if (!activity) return null;
  const phrase = PHRASES[activity.kind];
  if (!phrase) return null;
  const text = activity.detail ? phrase.withDetail(activity.detail) : phrase.plain;
  if (activity.actorName) return `${activity.actorName} ${text}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const absoluteFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return '';
  const elapsed = now - timestamp;
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return relativeFormat.format(-Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return relativeFormat.format(-Math.floor(elapsed / HOUR), 'hour');
  if (elapsed < 30 * DAY) return relativeFormat.format(-Math.floor(elapsed / DAY), 'day');
  return absoluteFormat.format(timestamp);
}

export function formatAbsoluteTime(iso: string): string {
  const timestamp = Date.parse(iso);
  return Number.isNaN(timestamp) ? '' : absoluteFormat.format(timestamp);
}
