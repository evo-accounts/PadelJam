import { useMyProfile, useStreamToken } from '@padel/api';
import { useSession } from '@padel/auth';
import { type PropsWithChildren, useEffect } from 'react';
import { Chat, OverlayProvider } from 'stream-chat-expo';

import { streamClient } from '@/lib/streamClient';

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

  // Not authed (e.g. on the auth screens): don't gate the app on chat.
  if (!uid) return <>{children}</>;

  // Always mount the Stream provider tree once authed — even if the token fetch errored — so the rest of
  // the app stays usable and chat context exists. A token error is surfaced (with Retry) inside the chat
  // tab, not as an app-wide block. The connect effect above no-ops until a token is available.
  return (
    <OverlayProvider>
      <Chat client={streamClient}>{children}</Chat>
    </OverlayProvider>
  );
}
