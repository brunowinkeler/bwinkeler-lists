import type { ListSummaryDto } from '@bwinkeler-lists/shared';
import { describeActivity, formatAbsoluteTime, formatRelativeTime } from './activity';

interface LastUpdatedProps {
  list: ListSummaryDto;
  className?: string;
}

export function LastUpdated({ list, className = 'list-activity' }: LastUpdatedProps) {
  const summary = describeActivity(list.lastActivity);
  return (
    <span className={className}>
      <time dateTime={list.updatedAt} title={formatAbsoluteTime(list.updatedAt)}>
        Updated {formatRelativeTime(list.updatedAt)}
      </time>
      {summary && <span className="list-activity__summary"> · {summary}</span>}
    </span>
  );
}
