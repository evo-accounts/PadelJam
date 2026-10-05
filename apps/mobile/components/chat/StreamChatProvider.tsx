import { useMyProfile, useStreamToken } from '@padel/api';
import { useSession } from '@padel/auth';
import { type PropsWithChildren, useEffect } from 'react';
import { Chat, OverlayProvider } from 'stream-chat-expo';

import { streamClient, streamEnabled } from '@/lib/streamClient';

import { chatTheme } from './chatTheme';

export function StreamChatProvider({ children }: PropsWithChildren) {
  const uid = useSession().session?.user.id;
  const tokenQ = useStreamToken();
  const profile = useMyProfile();

  useEffect(() => {
    const data = tokenQ.data;
    // Signed out (or no token yet): ensure the shared client isn't left connected as a prior user.
    if (!uid || !data) {
      if (streamClient.userID) void streamClient.disconnectUser();
      return;
    }
    let cancelled = false;
    // Serialize connect/disconnect on the singleton: skip if already connected as this user
    // (so a profile name/avatar edit doesn't churn the connection), and switch users cleanly.
    void (async () => {
      try {
        if (streamClient.userID === data.userId) return;
        if (streamClient.userID) await streamClient.disconnectUser();
        if (cancelled) return;
        await streamClient.connectUser(
          { id: data.userId, name: profile.data?.full_name ?? 'Player', image: profile.data?.avatar_url ?? undefined },
          data.token,
        );
      } catch {
        /* connect failed; Stream's UI handles its own offline/retry state */
      }
    })();
    return () => {
      cancelled = true;
    };
    // name/image are read at connect time only; identity/token changes (incl. user switch) drive reconnect.
  }, [uid, tokenQ.data, profile.data?.full_name, profile.data?.avatar_url]);

  // No API key (local/E2E): chat is off for the whole process — shape never changes.
  if (!streamEnabled) return <>{children}</>;

  // The wrapper must NOT depend on auth state: swapping the element type here
  // (fragment ⇄ OverlayProvider/Chat) remounts the entire child subtree — the
  // navigator and the Boot splash-routing effect included — which re-ran boot
  // routing right after sign-in and could bounce the user back to sign-in.
  // Chat tolerates a disconnected client; the connect effect above only
  // connects once a uid and token exist, and token fetches are gated on uid.
  return (
    <OverlayProvider value={{ style: chatTheme }}>
      <Chat client={streamClient}>{children}</Chat>
    </OverlayProvider>
  );
}
