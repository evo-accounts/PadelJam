import { lastMessagePreview, type MsgLike } from '@padel/utils';
import { useEffect, useState } from 'react';
import type { Channel as ChannelType } from 'stream-chat';

/**
 * Live last-message + unread for a channel row. Subscribes to the channel's message events
 * and re-renders on each, so row content stays fresh (ChannelList only re-sorts the list).
 */
export function useChannelPreview(channel: ChannelType): { lastMessage: string; unread: number } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const events = ['message.new', 'message.read', 'message.updated', 'message.deleted'] as const;
    const subs = events.map((e) => channel.on(e, bump));
    return () => subs.forEach((s) => s.unsubscribe());
  }, [channel]);
  return {
    lastMessage: lastMessagePreview(channel.state.messages as unknown as MsgLike[]),
    unread: channel.countUnread(),
  };
}
