import { useEffect, useState } from 'react';

import { streamClient } from '@/lib/streamClient';

// Global Stream unread count for the current user. Reads total_unread_count and re-reads on any
// client event that can change it. Returns 0 when not connected.
export function useStreamUnread(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const read = () =>
      setCount(
        (streamClient.user as { total_unread_count?: number } | undefined)?.total_unread_count ?? 0,
      );
    read();
    const sub = streamClient.on((event) => {
      if (
        typeof event.total_unread_count === 'number' ||
        event.type === 'message.new' ||
        event.type === 'message.read' ||
        event.type.startsWith('notification.')
      ) {
        read();
      }
    });
    return () => sub.unsubscribe();
  }, []);
  return count;
}
