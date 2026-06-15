import { useMyProfile, useStreamToken } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { type PropsWithChildren, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Chat, OverlayProvider } from 'stream-chat-expo';

import { streamClient } from '@/lib/streamClient';

export function StreamChatProvider({ children }: PropsWithChildren) {
  const { t } = useT('chat');
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

  if (tokenQ.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.msg}>{t('connectError')}</Text>
        <Pressable onPress={() => tokenQ.refetch()} accessibilityRole="button">
          <Text style={styles.retry}>{t('retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <OverlayProvider>
      <Chat client={streamClient}>{children}</Chat>
    </OverlayProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#F7F9FC' },
  msg: { color: '#6B7685', fontSize: 15 },
  retry: { color: '#0B7BFF', fontWeight: '700', fontSize: 15 },
});
