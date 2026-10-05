'use client';
import { useEffect } from 'react';
import { useMyProfile, useStreamToken } from '@padel/api';
import { useSession } from '@padel/auth';
import { streamClient } from '@/lib/streamClient';

/**
 * Connects the shared Stream client for the signed-in user, and disconnects it on sign-out.
 * Mounted once in the app layout — not only under /app/chat — because chat is opened from other
 * pages too (the event page's "Chat" with the organizer creates a 1:1 channel, which needs a
 * connected client). It renders nothing and imports no chat UI or CSS; `WebChatProvider` under
 * /app/chat only adds the stream-chat-react context on top of this connection.
 *
 * Exactly one place connects, so there is no double connect: the effect is idempotent for the
 * same user and swaps users by disconnecting first.
 */
export function StreamConnection() {
  const uid = useSession().session?.user.id;
  const tokenQ = useStreamToken();
  const profile = useMyProfile();

  useEffect(() => {
    const data = tokenQ.data;
    if (!uid || !data) {
      if (streamClient.userID) void streamClient.disconnectUser();
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        if (streamClient.userID === data.userId) return;
        if (streamClient.userID) await streamClient.disconnectUser();
        if (cancelled) return;
        await streamClient.connectUser(
          {
            id: data.userId,
            name: profile.data?.full_name ?? 'Player',
            image: profile.data?.avatar_url ?? undefined,
          },
          data.token,
        );
      } catch {
        /* connect failed; the chat surfaces show their own error/retry */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, tokenQ.data, profile.data?.full_name, profile.data?.avatar_url]);

  return null;
}
