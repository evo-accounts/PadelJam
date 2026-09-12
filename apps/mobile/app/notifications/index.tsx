import {
  CTA_TYPES,
  useClearAll,
  useCompleteNotificationCta,
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  usePartnerRequestSummary,
  type NotificationRow,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { notificationRoute } from '@padel/utils';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGoBack } from '@/lib/useGoBack';
import { colors } from '../../theme';
import { Button, EmptyState, emptyIcon, ListRow, Text, TopBar, useActionSheet } from '../../components/ui';

function targetHref(n: NotificationRow): string | null {
  return notificationRoute(n);
}

function ctaLabel(t: (k: string) => string, type: string): string {
  return type === 'waitlist_spot' ? t('confirmSpot') : t('join');
}
function ctaDoneLabel(t: (k: string) => string, type: string): string {
  return type === 'waitlist_spot' ? t('spotConfirmed') : t('joined');
}

export default function NotificationsScreen() {
  const { t } = useT('notifications');
  const router = useRouter();
  const goBack = useGoBack();
  const list = useNotifications();
  const summary = usePartnerRequestSummary();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const clearAll = useClearAll();
  const completeCta = useCompleteNotificationCta();
  const show = useActionSheet();
  const [ctaError, setCtaError] = useState<{ id: string; code: string } | null>(null);

  const rows = list.data?.pages.flat() ?? [];
  const pending = summary.data ?? 0;

  const onRowPress = (n: NotificationRow) => {
    if (!n.read_at) markRead.mutate(n.id);
    const href = targetHref(n);
    if (href) router.push(href as never);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar
        title={t('title')}
        onBack={goBack}
        actions={[
          {
            icon: '•••',
            label: t('more'),
            onPress: async () => {
              const key = await show({
                actions: [
                  { key: 'markAllRead', label: t('markAllRead') },
                  {
                    key: 'clearAll',
                    label: t('clearAll'),
                    destructive: true,
                    confirm: { title: t('clearAllTitle'), body: t('clearAllBody'), confirmLabel: t('clearAll') },
                  },
                ],
              });
              if (key === 'markAllRead') markAllRead.mutate();
              if (key === 'clearAll') clearAll.mutate();
            },
          },
        ]}
      />

      {pending > 0 && (
        <ListRow
          variant="card"
          title={t('partnerRequests')}
          trailing={
            <Text variant="hint" tone="muted">{t('pendingCount', { count: pending })}</Text>
          }
          trailingLabel={t('pendingCount', { count: pending })}
          onPress={() => router.push('/notifications/partner-requests' as never)}
        />
      )}

      {list.isLoading ? (
        <ActivityIndicator color={colors.foreground} style={{ marginTop: 32 }} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(n) => n.id}
          onEndReached={() => list.hasNextPage && list.fetchNextPage()}
          ListEmptyComponent={
            list.isError ? (
              <EmptyState
                tone="error"
                title={t('loadError', { ns: 'common' })}
                action={{ label: t('retry', { ns: 'common' }), onPress: () => list.refetch() }}
                testID="empty-notifications"
              />
            ) : (
              <EmptyState
                icon={emptyIcon('bell')}
                title={t('empty')}
                body={t('notificationsEmptyBody')}
                testID="empty-notifications"
              />
            )
          }
          renderItem={({ item }) => (
            <ListRow
              variant="card"
              title={t(item.type, { actor: item.actor_name ?? '', entity: item.entity_name ?? '' })}
              subtitle={ctaError?.id === item.id ? t(ctaError.code, { defaultValue: t('respondError') }) : undefined}
              subtitleTone={ctaError?.id === item.id ? 'destructive' : 'muted'}
              highlighted={!item.read_at}
              trailing={
                CTA_TYPES.has(item.type) ? (
                  item.cta_done ? (
                    <Text variant="hint" tone="success">{ctaDoneLabel(t, item.type)}</Text>
                  ) : (
                    <Button
                      label={ctaLabel(t, item.type)}
                      size="sm"
                      loading={completeCta.isPending && completeCta.variables?.id === item.id}
                      disabled={completeCta.isPending}
                      onPress={() => {
                        setCtaError(null);
                        completeCta.mutate(item, {
                          onError: (e) => setCtaError({ id: item.id, code: e instanceof Error ? e.message : 'unknown_error' }),
                        });
                      }}
                    />
                  )
                ) : null
              }
              // Only the static "joined"/"confirmed" state needs describing. The
              // CTA button carries its own label; repeating it here would announce
              // the word twice on a row that already reads as one element.
              trailingLabel={
                CTA_TYPES.has(item.type) && item.cta_done ? ctaDoneLabel(t, item.type) : undefined
              }
              onPress={() => onRowPress(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
