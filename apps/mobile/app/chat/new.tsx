import { useFollowing } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { streamClient } from '@/lib/streamClient';

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
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('newChat') }} />
      <TextInput
        style={styles.search}
        placeholder={t('searchPeople')}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {following.isLoading ? (
        <ActivityIndicator color="#0B1F3A" style={{ marginTop: 32 }} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t('noFollows')}</Text>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => openChat(item)} disabled={busy} accessibilityRole="button">
              <Image
                source={item.avatar_url ? { uri: item.avatar_url } : undefined}
                style={styles.avatar}
                contentFit="cover"
              />
              <Text style={styles.name}>{item.full_name ?? '—'}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  search: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, margin: 12, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 6, borderRadius: 12, padding: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E2E8F0' },
  name: { fontSize: 15, fontWeight: '600', color: '#0B1F3A' },
  empty: { textAlign: 'center', marginTop: 48, color: '#6B7685', fontSize: 15 },
  error: { color: '#D7263D', fontSize: 13, marginHorizontal: 12, marginBottom: 4 },
});
