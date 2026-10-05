/**
 * Payment list (UX-MEVT-16) — reached from the dashboard's Paid card and the event page's
 * "Payment list" chip, both shown only when the event has an entrance fee. Who has paid, never
 * who is coming (that is `manage-players.tsx`).
 *
 * Header: back, "Payment list", and the number of players on the right.
 * Total card: collected against expected (fee × confirmed, guests and stand-by included) with a
 * progress bar. Tabs: All / Paid / Pending. Rows: avatar, name, and a Paid / Pending control the
 * organizer toggles (mark_paid). A Pending row with credit — the fee went up after they paid —
 * says what is still owed (decision 9). "Mark all as paid" is pinned to the bottom and asks first.
 *
 * Route guard: organizer only; an event without a fee shows a "free event" state instead. The
 * arithmetic lives in `components/event/manage/paymentList.ts`.
 */
import { useEvent, useEventParticipants, useMarkAllPaid, useMarkPaid } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  filterRows,
  formatMoney,
  paymentList,
  type PaymentFilter,
  type PaymentParticipant,
  type PaymentRow,
} from '@/components/event/manage/paymentList';
import { avatarUrl } from '@/lib/community-images';
import { useGoBack } from '@/lib/useGoBack';
import { colors, space } from '../../../theme';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  emptyIcon,
  ListRow,
  ProgressBar,
  Segmented,
  Text,
  TopBar,
  useBanner,
  useConfirm,
} from '../../../components/ui';

export default function PaymentListScreen() {
  const { t, i18n } = useT('event');
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;
  const banner = useBanner();
  const confirm = useConfirm();
  const { data: event, isLoading } = useEvent(id);
  const participants = useEventParticipants(id);
  const markPaid = useMarkPaid(id);
  const markAllPaid = useMarkAllPaid(id);
  const [filter, setFilter] = useState<PaymentFilter>('all');
  const [busy, setBusy] = useState<string | null>(null);

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

  const list = paymentList(event, (participants.data ?? []) as PaymentParticipant[]);
  if (list.fee === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar onBack={goBack} backLabel={t('back')} title={t('paymentListTitle')} />
        <EmptyState fill title={t('payNoFeeTitle')} body={t('payNoFeeBody')} testID="payments-no-fee" />
      </SafeAreaView>
    );
  }

  const money = (n: number) => formatMoney(n, i18n.language);
  // Payments stay editable through the live and completed event; a cancelled one is read-only.
  const editable = event.status !== 'cancelled';
  const rows = filterRows(list.rows, filter);

  const fail = (e: unknown) => banner.show(t(e instanceof Error ? e.message : 'unknown_error'));

  const toggle = async (row: PaymentRow) => {
    setBusy(row.participantId);
    try {
      await markPaid.mutateAsync({ participantId: row.participantId, paid: !row.paid, targetName: row.name ?? undefined });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const markAll = async () => {
    const ok = await confirm({
      title: t('payMarkAllTitle'),
      body: t('payMarkAllBody', { count: list.counts.pending }),
      confirmLabel: t('payMarkAllCta'),
    });
    if (!ok) return;
    setBusy('all');
    try {
      await markAllPaid.mutateAsync();
      banner.show(t('payMarkedAllToast'), 'success');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const renderRow = (row: PaymentRow) => {
    const name = row.name ?? '—';
    const subtitle = row.paid
      ? undefined
      : row.partial
        ? t('payOwesDifference', { owed: money(row.owed), credit: money(row.credit) })
        : t('payOwes', { amount: money(row.owed) });
    return (
      <ListRow
        key={row.participantId}
        title={name}
        subtitle={subtitle}
        leading={<Avatar uri={avatarUrl(row.avatarPath)} name={name} colourKey={row.userId ?? row.participantId} size="md" decorative />}
        trailingInteractive
        trailing={
          <View style={styles.trailing}>
            {row.guest ? <Badge label={t('guestTag')} /> : null}
            <Chip
              label={row.paid ? t('payStatusPaid') : t('payStatusPending')}
              selected={row.paid}
              disabled={!editable || busy != null}
              onPress={() => void toggle(row)}
              testID={`payment-toggle-${row.participantId}`}
            />
          </View>
        }
      />
    );
  };

  const empty =
    list.rows.length === 0 ? (
      <EmptyState icon={emptyIcon('person.2')} title={t('paymentsEmptyTitle')} body={t('paymentsEmptyBody')} testID="empty-payments" />
    ) : rows.length === 0 ? (
      filter === 'paid' ? (
        <EmptyState icon={emptyIcon('clock')} title={t('payPaidEmptyTitle')} body={t('payPaidEmptyBody')} testID="empty-payments-paid" />
      ) : (
        <EmptyState
          icon={emptyIcon('person.crop.circle.badge.checkmark')}
          title={t('payPendingEmptyTitle')}
          body={t('payPendingEmptyBody')}
          testID="empty-payments-pending"
        />
      )
    ) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <TopBar
        onBack={goBack}
        backLabel={t('back')}
        title={t('paymentListTitle')}
        trailing={
          <Text variant="label" tone="muted" accessibilityLabel={t('payPlayersCount', { count: list.counts.all })}>
            {list.counts.all}
          </Text>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.total}>
          <Text variant="label" tone="muted">
            {t('payTotalTitle')}
          </Text>
          <Text variant="heading">
            {t('payCollectedOf', { collected: money(list.collected), expected: money(list.expected) })}
          </Text>
          <ProgressBar
            value={list.expected > 0 ? list.collected / list.expected : 0}
            accessibilityLabel={t('payCollectedLabel')}
          />
        </Card>
        <Segmented
          options={[
            { value: 'all' as const, label: t('payTabAll', { n: list.counts.all }) },
            { value: 'paid' as const, label: t('payTabPaid', { n: list.counts.paid }) },
            { value: 'pending' as const, label: t('payTabPending', { n: list.counts.pending }) },
          ]}
          value={filter}
          onChange={setFilter}
          singleLine
          style={styles.tabs}
          testID="payments-tabs"
        />
        {participants.isLoading ? <ActivityIndicator color={colors.foreground} style={styles.loading} /> : (empty ?? rows.map(renderRow))}
      </ScrollView>
      {editable && list.rows.length > 0 ? (
        <View style={styles.footer}>
          <Button
            label={t('payMarkAllCta')}
            fullWidth
            loading={busy === 'all'}
            disabled={busy != null || list.counts.pending === 0}
            onPress={() => void markAll()}
            testID="payments-mark-all"
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[6], gap: space[1] },
  total: { gap: space[2], marginBottom: space[3] },
  tabs: { marginBottom: space[2] },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  loading: { paddingVertical: space[6] },
  footer: { paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[2], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.background },
});
