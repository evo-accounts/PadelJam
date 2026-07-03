import { useStreamToken } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Channel } from 'stream-chat';
import { ChannelList } from 'stream-chat-expo';

import { ChannelRow } from '@/components/chat/ChannelRow';

type Tab = 'active' | 'archived';

export default function ChatListScreen() {
  const { t } = useT('chat');
  const router = useRouter();
  const uid = useSession().session?.user.id;
  const tokenQ = useStreamToken();
  const [tab, setTab] = useState<Tab>('active');

  if (!uid) return null;

  // stream-chat-expo 9.3.1 has no `Preview` prop; the row is overridden via the underlying
  // FlatList's renderItem (additionalFlatListProps). It still just needs the channel + current tab.
  const Preview = ({ item }: { item: Channel }) => <ChannelRow channel={item} tab={tab} />;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('title'),
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/chat/new' as never)}
              accessibilityRole="button"
              accessibilityLabel={t('newChat')}
              hitSlop={12}
              style={{ paddingHorizontal: 8 }}
            >
              <SymbolView
                name={{ ios: 'square.and.pencil', android: 'edit', web: 'edit' }}
                tintColor="#0B7BFF"
                size={22}
              />
            </Pressable>
          ),
        }}
      />
      <View style={styles.tabs}>
        {(['active', 'archived'] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && styles.tabActive]} accessibilityRole="button">
            <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>{t(k === 'active' ? 'tabActive' : 'tabArchived')}</Text>
          </Pressable>
        ))}
      </View>
      {tokenQ.isError ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{t('connectError')}</Text>
          <Pressable onPress={() => tokenQ.refetch()} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.bannerRetry}>{t('retry')}</Text>
          </Pressable>
        </View>
      ) : null}
      <ChannelList
        key={tab}
        filters={{ members: { $in: [uid] }, archived: tab === 'archived' }}
        sort={{ last_message_at: -1 }}
        additionalFlatListProps={{ renderItem: Preview }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#0B7BFF' },
  tabText: { fontSize: 15, color: '#6B7685', fontWeight: '600' },
  tabTextActive: { color: '#0B7BFF', fontWeight: '700' },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF4E5', paddingHorizontal: 16, paddingVertical: 10 },
  bannerText: { color: '#8A5A00', fontSize: 13, flex: 1 },
  bannerRetry: { color: '#0B7BFF', fontWeight: '700', fontSize: 13, paddingLeft: 12 },
});
