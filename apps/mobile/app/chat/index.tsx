import { useStreamToken } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Channel } from 'stream-chat';
import { ChannelList } from 'stream-chat-expo';

import { ChannelRow } from '@/components/chat/ChannelRow';
import { useGoBack } from '@/lib/useGoBack';
import { colors, palette } from '../../theme';
import { Button, Chip, EmptyState, TopBar } from '../../components/ui';

type Tab = 'active' | 'archived';

function ChatEmptyState() {
  const { t } = useT('chat');
  const router = useRouter();
  return (
    <View style={styles.emptyWrap}>
      <EmptyState
        icon={
          <SymbolView
            name={{ ios: 'bubble.left.and.bubble.right.fill', android: 'chat', web: 'chat' }}
            size={40}
            tintColor={colors.mutedForeground}
            accessibilityElementsHidden
          />
        }
        title={t('noChats')}
        action={{ label: t('emptyStartCta'), onPress: () => router.push('/chat/new' as never) }}
      />
    </View>
  );
}

export default function ChatListScreen() {
  const { t } = useT('chat');
  const router = useRouter();
  const goBack = useGoBack();
  const uid = useSession().session?.user.id;
  const tokenQ = useStreamToken();
  const [tab, setTab] = useState<Tab>('active');

  if (!uid) return null;

  // stream-chat-expo 9.3.1 has no `Preview` prop; the row is overridden via the underlying
  // FlatList's renderItem (additionalFlatListProps). It still just needs the channel + current tab.
  const Preview = ({ item }: { item: Channel }) => <ChannelRow channel={item} tab={tab} />;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar
        title={t('title')}
        onBack={goBack}
        actions={[
          {
            icon: (
              <SymbolView
                name={{ ios: 'square.and.pencil', android: 'edit', web: 'edit' }}
                tintColor={colors.primary}
                size={22}
              />
            ),
            label: t('newChat'),
            onPress: () => router.push('/chat/new' as never),
          },
        ]}
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
          <Button label={t('retry')} variant="tertiary" size="sm" onPress={() => tokenQ.refetch()} />
        </View>
      ) : null}
      <ChannelList
        key={tab}
        filters={{ members: { $in: [uid] }, archived: tab === 'archived' }}
        sort={{ last_message_at: -1 }}
        additionalFlatListProps={{ renderItem: Preview, ListEmptyComponent: ChatEmptyState }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  tabs: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.muted },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: palette.yellow[100], paddingHorizontal: 16, paddingVertical: 10 },
  bannerText: { color: palette.yellow[900], fontSize: 13, flex: 1 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
});
