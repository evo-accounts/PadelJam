import {
  useIncomingPartnerRequests,
  useRespondToRequest,
  type IncomingPartnerRequest,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { avatarUrl } from '@/lib/community-images';
import { useGoBack } from '@/lib/useGoBack';
import { colors } from '../../theme';
import {
  Avatar,
  EmptyState,
  emptyIcon,
  listEmptyContent,
  TopBar,
  useBanner,
  useConfirm,
} from '../../components/ui';

export default function PartnerRequestsScreen() {
  const { t } = useT('notifications');
  const goBack = useGoBack();
  const list = useIncomingPartnerRequests();
  const respond = useRespondToRequest();
  const confirm = useConfirm();
  const banner = useBanner();
  const rows = list.data ?? [];

  const act = async (item: IncomingPartnerRequest, action: 'accept' | 'decline') => {
    if (action === 'decline') {
      const ok = await confirm({
        title: t('declineTitle'),
        body: t('declineBody'),
        confirmLabel: t('decline'),
        destructive: true,
      });
      if (!ok) return;
    }
    respond.mutate(
      { kind: item.kind, requestId: item.request_id, action },
      { onError: () => banner.show(t('respondError')) },
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('partnerRequests')} onBack={goBack} />
      {list.isLoading ? (
        <ActivityIndicator color={colors.foreground} style={{ marginTop: 32 }} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(r) => r.request_id}
          contentContainerStyle={listEmptyContent}
          ListEmptyComponent={
            list.isError ? (
              <EmptyState
                fill
                tone="error"
                title={t('requestsError')}
                action={{ label: t('retry', { ns: 'common' }), onPress: () => list.refetch() }}
                testID="empty-partner-requests"
              />
            ) : (
              <EmptyState
                fill
                icon={emptyIcon('person.badge.clock')}
                title={t('requestsEmpty')}
                body={t('partnerRequestsEmptyBody')}
                testID="empty-partner-requests"
              />
            )
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Avatar
                uri={avatarUrl(item.requester_avatar)}
                name={item.requester_name}
                colourKey={item.requester_id}
                size="md"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.requester_name ?? '—'}</Text>
                <Text style={styles.context}>
                  {item.kind === 'community'
                    ? t('joinRequestLabel', { entity: item.entity_name })
                    : t('partnerRequestLabel', { entity: item.entity_name })}
                </Text>
              </View>
              <Pressable
                style={styles.decline}
                onPress={() => act(item, 'decline')}
                disabled={respond.isPending}
                accessibilityRole="button"
              >
                <Text style={styles.declineText}>{t('decline')}</Text>
              </Pressable>
              <Pressable
                style={styles.accept}
                onPress={() => act(item, 'accept')}
                disabled={respond.isPending}
                accessibilityRole="button"
              >
                <Text style={styles.acceptText}>{t('accept')}</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, marginHorizontal: 12, marginTop: 8, borderRadius: 12, padding: 12,
  },
  name: { fontSize: 15, fontWeight: '700', color: colors.foreground },
  context: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  decline: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.accent },
  declineText: { color: colors.foreground, fontWeight: '600', fontSize: 13 },
  accept: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary },
  acceptText: { color: colors.card, fontWeight: '700', fontSize: 13 },
});
