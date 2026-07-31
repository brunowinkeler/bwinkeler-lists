import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ListDetailDto, ListSnapshot } from '@bwinkeler-lists/shared';
import { realtime } from '../lib/ws-client';

export function mergeSnapshot(
  previous: ListDetailDto | undefined,
  snapshot: ListSnapshot,
): ListDetailDto | undefined {
  if (!previous) return previous;
  return {
    ...previous,
    list: {
      ...previous.list,
      name: snapshot.name,
      kind: snapshot.kind,
      ownerId: snapshot.ownerId,
      version: snapshot.version,
    },
    members: snapshot.members,
    categories: snapshot.categories,
    items: snapshot.items,
  };
}

export function RealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    realtime.start();
    const off = realtime.addListener((message) => {
      if (message.type === 'snapshot') {
        queryClient.setQueryData<ListDetailDto>(['list', message.snapshot.listId], (previous) =>
          mergeSnapshot(previous, message.snapshot),
        );
      } else if (message.type === 'deleted' || message.type === 'revoked') {
        queryClient.removeQueries({ queryKey: ['list', message.listId] });
        void queryClient.invalidateQueries({ queryKey: ['lists'] });
      }
    });
    return () => {
      off();
      realtime.stop();
    };
  }, [queryClient]);

  return null;
}
