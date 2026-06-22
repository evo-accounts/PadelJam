'use client';
import { type PropsWithChildren, useEffect } from 'react';
import { Chat } from 'stream-chat-react';
import { useMyProfile, useStreamToken } from '@padel/api';
import { useSession } from '@padel/auth';
import { streamClient } from '@/lib/streamClient';
import 'stream-chat-react/dist/css/index.css';

export function WebChatProvider({ children }: PropsWithChildren) {
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
        /* connect failed; the chat surface shows its own error/retry */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, tokenQ.data, profile.data?.full_name, profile.data?.avatar_url]);

  if (!uid) return <>{children}</>;
  return <Chat client={streamClient}>{children}</Chat>;
}
