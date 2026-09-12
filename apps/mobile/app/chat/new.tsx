import { useFollowing } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/community-images';
import { streamClient } from '@/lib/streamClient';
import { colors } from '../../theme';
import { Avatar, EmptyState, emptyIcon, listEmptyContent, TopBar } from '../../components/ui';

type Person = { id: string; full_name: string | null; avatar_url: string | null };

export default function NewChatScreen() {
  const { t } = useT('chat');
  const router = useRouter();
  const uid = useSession().session?.user.id;
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const following = useFollowing(uid, search);
  const rows = (following.data?.pages.flat() ?? []) as Person[];

  const openChat = async (other: Person) => {
    if (busy || !uid) return;
    setBusy(true);
    setError(null);
    try {
      const channel = streamClient.channel('messaging', { members: [uid, other.id] });
      await channel.watch();
      router.replace(('/chat/' + channel.cid) as never);
    } catch {
      setError(t('startError'));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('newChat')} onBack={() => router.back()} />
      <TextInput
        style={styles.search}
        placeholder={t('searchPeople')}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {following.isLoading ? (
        <ActivityIndicator color={colors.foreground} style={{ marginTop: 32 }} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(p) => p.id}
          contentContainerStyle={listEmptyContent}
          ListEmptyComponent={
            <EmptyState
              fill
              icon={emptyIcon('bubble.left.and.bubble.right')}
              title={t('noFollows')}
              body={t('chatNewEmptyBody')}
              action={{
                label: t('chatNewEmptyCta'),
                onPress: () => router.push('/(tabs)/explore?tab=players' as never),
              }}
              testID="empty-chat-new"
            />
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => openChat(item)} disabled={busy} accessibilityRole="button">
              <Avatar
                uri={avatarUrl(item.avatar_url)}
                name={item.full_name}
                colourKey={item.id}
                size="md"
              />
              <Text style={styles.name}>{item.full_name ?? '—'}</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  search: { backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, margin: 12, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, marginHorizontal: 12, marginBottom: 6, borderRadius: 12, padding: 12 },
  name: { fontSize: 15, fontWeight: '600', color: colors.foreground },
  error: { color: colors.destructive, fontSize: 13, marginHorizontal: 12, marginBottom: 4 },
});
