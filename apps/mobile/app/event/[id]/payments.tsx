/**
 * Payment list — reached from the dashboard's Paid card and the event page's "Payment list" chip,
 * both shown only when the event has an entrance fee.
 *
 * INTERIM (M1): today's paid toggles, moved here from the old single-screen Manage — one row per
 * confirmed player with a Paid / Unpaid chip, and "Mark all paid". M4 rebuilds it as UX-MEVT-16
 * (Paid / Pending tabs, credited amounts after a fee change — decision 9).
 */
import { useEvent, useEventParticipants, useMarkAllPaid, useMarkPaid } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/community-images';
import { useGoBack } from '@/lib/useGoBack';
import { colors, space } from '../../../theme';
import { Avatar, Button, Chip, EmptyState, emptyIcon, Screen, Text, TopBar, useBanner } from '../../../components/ui';

export default function PaymentListScreen() {
  const { t } = useT('event');
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;
  const banner = useBanner();
  const { data: event, isLoading } = useEvent(id);
  const { data: participantsData } = useEventParticipants(id);
  const markPaid = useMarkPaid(id);
  const markAllPaid = useMarkAllPaid(id);
  const [busy, setBusy] = useState(false);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }
  if (event == null || uid == null || uid !== event.organizer_id) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar onBack={goBack} backLabel={t('back')} title={t('paymentListTitle')} />
        <EmptyState fill title={t('forbidden')} testID="payments-forbidden" />
      </SafeAreaView>
    );
  }

  const confirmed = (participantsData ?? []).filter((p) => p.status === 'confirmed');
  const paidCount = confirmed.filter((p) => p.has_paid).length;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      banner.show(t(e instanceof Error ? e.message : 'unknown_error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar onBack={goBack} backLabel={t('back')} title={t('paymentListTitle')} />
      <Screen scroll padded={false} style={styles.content}>
        {confirmed.length === 0 ? (
          <EmptyState
            icon={emptyIcon('person.2')}
            title={t('paymentsEmptyTitle')}
            body={t('paymentsEmptyBody')}
            testID="empty-payments"
          />
        ) : (
          <>
            <View style={styles.head}>
              <Text variant="bodyStrong" style={styles.flex}>
                {t('statPaid', { paid: paidCount, total: confirmed.length })}
              </Text>
              <Button
                label={t('markAllPaidCta')}
                variant="tertiary"
                size="sm"
                disabled={busy || paidCount === confirmed.length}
                onPress={() => void run(() => markAllPaid.mutateAsync())}
              />
            </View>
            {confirmed.map((p) => {
              const name = p.profiles?.full_name ?? p.guest_name ?? '—';
              return (
                <View key={p.id} style={styles.row}>
                  <Avatar uri={avatarUrl(p.profiles?.avatar_url)} name={name} colourKey={p.profiles?.id ?? p.user_id} size="sm" decorative />
                  <Text variant="body" numberOfLines={1} style={styles.flex}>
                    {name}
                  </Text>
                  <Chip
                    label={p.has_paid ? t('paidBadge') : t('unpaidBadge')}
                    selected={p.has_paid}
                    disabled={busy}
                    onPress={() =>
                      void run(() =>
                        markPaid.mutateAsync({ participantId: p.id, paid: !p.has_paid, targetName: p.profiles?.full_name ?? p.guest_name ?? undefined }),
                      )
                    }
                  />
                </View>
              );
            })}
          </>
        )}
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[10] },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[3], marginBottom: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] },
  flex: { flex: 1 },
});
