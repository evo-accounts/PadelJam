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
import { AccessibilityInfo, ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGoBack } from '@/lib/useGoBack';
import { colors, space } from '../../theme';
import {
  Button,
  EmptyState,
  emptyIcon,
  listEmptyContent,
  ListRow,
  Text,
  TopBar,
  useActionSheet,
} from '../../components/ui';

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

  const ctaErrorMessage = (code: string) => t(code, { defaultValue: t('respondError') });

  const onCtaPress = (n: NotificationRow) => {
    setCtaError(null);
    completeCta.mutate(n, {
      onError: (e) => {
        const code = e instanceof Error ? e.message : 'unknown_error';
        setCtaError({ id: n.id, code });
        // The subtitle turns destructive, but a tone change inside an element
        // that is already labelled is silent to a screen reader. Say it out
        // loud, once, when it happens.
        AccessibilityInfo.announceForAccessibility(ctaErrorMessage(code));
      },
    });
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
          // UX-JEVT-12: the pending count and a chevron — this row opens the Partner Requests list.
          trailing={
            <View style={styles.pendingTrailing}>
              <Text variant="hint" tone="muted">{t('pendingCount', { count: pending })}</Text>
              <Text variant="body" tone="muted">›</Text>
            </View>
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
          contentContainerStyle={listEmptyContent}
          ListEmptyComponent={
            list.isError ? (
              <EmptyState
                fill
                tone="error"
                title={t('loadError')}
                action={{ label: t('retry', { ns: 'common' }), onPress: () => list.refetch() }}
                testID="empty-notifications"
              />
            ) : (
              <EmptyState
                fill
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
              // An unknown type (a newer server than this build) falls back to the entity or actor
              // name instead of rendering the raw type key; the row still routes via event_id.
              title={t(item.type, {
                actor: item.actor_name ?? '',
                entity: item.entity_name ?? '',
                defaultValue: item.entity_name ?? item.actor_name ?? '',
              })}
              subtitle={ctaError?.id === item.id ? ctaErrorMessage(ctaError.code) : undefined}
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
                      onPress={() => onCtaPress(item)}
                    />
                  )
                ) : null
              }
              // A LIVE CTA is a control of its own: it has to sit BESIDE the row's
              // accessibility element, not inside it, or VoiceOver can neither
              // reach nor activate it. The done state is static text, so that
              // row stays a single element and describes itself below.
              trailingInteractive={CTA_TYPES.has(item.type) && !item.cta_done}
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
  pendingTrailing: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
