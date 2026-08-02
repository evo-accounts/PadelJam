import { useStreamToken } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Channel } from 'stream-chat';
import { ChannelList } from 'stream-chat-expo';

import { ChannelRow } from '@/components/chat/ChannelRow';
import { colors, palette } from '../../theme';
import { Button, Chip, IconButton } from '../../components/ui';

type Tab = 'active' | 'archived';

function ChatEmptyState() {
  const { t } = useT('chat');
  const router = useRouter();
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyCard}>
        <Text style={styles.emptyText}>{t('noChats')}</Text>
        <Button
          label={t('emptyStartCta')}
          variant="outline"
          onPress={() => router.push('/chat/new' as never)}
        />
      </View>
    </View>
  );
}

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
            <IconButton
              icon={
                <SymbolView
                  name={{ ios: 'square.and.pencil', android: 'edit', web: 'edit' }}
                  tintColor={colors.primary}
                  size={22}
                />
              }
              accessibilityLabel={t('newChat')}
              onPress={() => router.push('/chat/new' as never)}
            />
          ),
        }}
      />
      <View style={styles.tabs}>
        {(['active', 'archived'] as const).map((k) => (
          <Chip
            key={k}
            label={t(k === 'active' ? 'tabActive' : 'tabArchived')}
            selected={tab === k}
            onPress={() => setTab(k)}
          />
        ))}
      </View>
      {tokenQ.isError ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{t('connectError')}</Text>
          <Button label={t('retry')} variant="ghost" size="sm" onPress={() => tokenQ.refetch()} />
        </View>
      ) : null}
      <ChannelList
        key={tab}
        filters={{ members: { $in: [uid] }, archived: tab === 'archived' }}
        sort={{ last_message_at: -1 }}
        additionalFlatListProps={{ renderItem: Preview, ListEmptyComponent: ChatEmptyState }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  tabs: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.muted },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: palette.yellow[100], paddingHorizontal: 16, paddingVertical: 10 },
  bannerText: { color: palette.yellow[900], fontSize: 13, flex: 1 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyCard: {
    backgroundColor: colors.card, borderRadius: 16, padding: 24,
    alignItems: 'center', gap: 14, width: '100%',
  },
  emptyText: { fontSize: 15, color: colors.mutedForeground, textAlign: 'center' },
});
