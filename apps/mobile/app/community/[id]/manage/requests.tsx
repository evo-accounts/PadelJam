import {
  useAcceptJoinRequest,
  useCommunityRequests,
  useDeclineJoinRequest,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/community-images';
import { colors } from '../../../../theme';
import {
  EmptyState,
  emptyIcon,
  listEmptyContent,
  TopBar,
  useBanner,
  useConfirm,
} from '../../../../components/ui';

type JoinRequest = {
  id: string;
  community_id: string;
  user_id: string;
  status: string;
  created_at: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
};

export default function ManageRequestsScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: requests, isLoading, isError, refetch } = useCommunityRequests(id);
  const accept = useAcceptJoinRequest(id);
  const decline = useDeclineJoinRequest(id);
  const confirm = useConfirm();
  const banner = useBanner();

  const busy = accept.isPending || decline.isPending;

  const err = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    banner.show(t(code, { defaultValue: t('unknown_error') }));
  };

  const onAccept = async (requestId: string) => {
    try {
      await accept.mutateAsync(requestId);
    } catch (e) {
      err(e);
    }
  };

  const onDecline = async (requestId: string) => {
    const ok = await confirm({
      title: t('declineRequestTitle'),
      body: t('declineRequestBody'),
      confirmLabel: t('decline'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await decline.mutateAsync(requestId);
    } catch (e) {
      err(e);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('manageRequests')} onBack={() => router.back()} backLabel={t('back')} />
      <FlashList
        data={(requests ?? []) as JoinRequest[]}
        keyExtractor={(r) => r.id}
        contentContainerStyle={listEmptyContent}
        ListEmptyComponent={
          isError ? (
            <EmptyState
              fill
              tone="error"
              title={t('loadError', { ns: 'common' })}
              action={{ label: t('retry', { ns: 'common' }), onPress: () => refetch() }}
              testID="empty-requests"
            />
          ) : (
            <EmptyState
              fill
              icon={emptyIcon('person.badge.clock')}
              title={t('noRequests')}
              body={t('manageRequestsEmptyBody')}
              testID="empty-requests"
            />
          )
        }
        renderItem={({ item }) => {
          const name = item.profiles?.full_name ?? '—';
          const url = avatarUrl(item.profiles?.avatar_url);
          return (
            <View style={styles.row}>
              {url ? (
                <Image source={{ uri: url }} style={styles.avatar} contentFit="cover" transition={120} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitial}>{(name.charAt(0) || '?').toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <View style={styles.actions}>
                <Pressable
                  style={[styles.btn, styles.decline]}
                  onPress={() => onDecline(item.id)}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <Text style={styles.declineText}>{t('decline')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.accept]}
                  onPress={() => onAccept(item.id)}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <Text style={styles.acceptText}>{t('accept')}</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.muted },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  avatarInitial: { color: colors.card, fontSize: 16, fontWeight: '700' },
  name: { flex: 1, fontSize: 16, color: colors.foreground, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  accept: { backgroundColor: colors.primary },
  acceptText: { color: colors.card, fontWeight: '700', fontSize: 14 },
  decline: { backgroundColor: colors.accent },
  declineText: { color: colors.mutedForeground, fontWeight: '700', fontSize: 14 },
});
