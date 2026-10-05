'use client';
/**
 * Payment list (UX-MEVT-16) — reached from the dashboard's Paid card and the event page's "Payment
 * list" chip, both shown only when the event has an entrance fee. Web's twin of mobile's
 * `payments.tsx`. Who is coming lives in Manage players; this page is only who has paid.
 *
 *   header   back · "Payment list" · the number of players
 *   Total    collected vs expected (fee × confirmed, guests included) with a progress bar
 *   tabs     All · Paid · Pending
 *   rows     avatar, name, a Paid / Pending toggle; a Pending player holding credit after a fee rise
 *            shows only the difference owed (decision 9)
 *   footer   "Mark all as paid", fixed at the bottom, behind a confirmation
 *
 * Without a fee the page is unavailable (a note and the way back). Payments stay editable while the
 * event runs and after it ends (mark_paid's payments guard); a cancelled event is read-only.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Wallet } from 'lucide-react';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import { useEvent, useEventParticipants, useEventRealtime, useMarkAllPaid, useMarkPaid } from '@padel/api';
import {
  filterPaymentRows,
  formatMoney,
  paymentSummary,
  type PaymentFilter,
  type PaymentRow,
} from '@/components/event/manage/paymentList';
import { GroupPageTitle } from '@/components/group/GroupHeader';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toaster';
import { avatarUrl } from '@/lib/upload';

export default function PaymentListPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useT('event');
  const uid = useSession().session?.user.id;
  useEventRealtime(id);
  const event = useEvent(id);
  const participants = useEventParticipants(id);
  const markPaid = useMarkPaid(id);
  const markAllPaid = useMarkAllPaid(id);
  const [filter, setFilter] = useState<PaymentFilter>('all');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busyAll, setBusyAll] = useState(false);

  const back = `/app/event/${id}/manage`;
  const title = t('paymentListTitle');

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  const e = event.data;
  if (e == null || uid == null || uid !== e.organizer_id) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <GroupPageTitle title={title} fallbackHref={back} />
        <p className="p-8 text-center text-sm text-muted-foreground" data-testid="payments-forbidden">
          {t('forbidden')}
        </p>
      </div>
    );
  }
  if (!e.entrance_fee_enabled) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <GroupPageTitle title={title} fallbackHref={back} />
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center" data-testid="payments-no-fee">
          <Wallet className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">{t('paymentsNoFeeTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('paymentsNoFeeBody')}</p>
          <Button asChild variant="secondary" size="sm" className="mt-1">
            <Link href={back}>{t('manageEventTitle')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const summary = paymentSummary(e, participants.data ?? []);
  const rows = filterPaymentRows(summary.rows, filter);
  const editable = e.status !== 'cancelled';
  const money = (n: number) => formatMoney(n, i18n.language);
  const pct = summary.expected > 0 ? Math.min(100, Math.round((summary.collected / summary.expected) * 100)) : 0;

  const fail = (x: unknown) =>
    toast(t(x instanceof Error ? x.message : 'unknown_error', { defaultValue: t('unknown_error') }), 'error');

  const toggle = async (row: PaymentRow) => {
    setPendingId(row.id);
    try {
      await markPaid.mutateAsync({ participantId: row.id, paid: !row.paid, targetName: row.name ?? undefined });
    } catch (x) {
      fail(x);
    } finally {
      setPendingId(null);
    }
  };

  const onMarkAll = async () => {
    setBusyAll(true);
    try {
      await markAllPaid.mutateAsync();
      setConfirmAll(false);
      toast(t('paymentsAllMarkedToast'));
    } catch (x) {
      fail(x);
    } finally {
      setBusyAll(false);
    }
  };

  const tabs: { value: PaymentFilter; label: string }[] = [
    { value: 'all', label: t('paymentsTabAll', { n: summary.rows.length }) },
    { value: 'paid', label: t('paymentsTabPaid', { n: summary.paidCount }) },
    { value: 'pending', label: t('paymentsTabPending', { n: summary.pendingCount }) },
  ];

  const emptyCopy =
    summary.rows.length === 0
      ? { title: t('paymentsEmptyTitle'), body: t('paymentsEmptyBody') }
      : filter === 'paid'
        ? { title: t('paymentsPaidEmptyTitle'), body: t('paymentsPaidEmptyBody') }
        : { title: t('paymentsPendingEmptyTitle'), body: t('paymentsPendingEmptyBody') };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 px-4 pt-4 sm:px-6 sm:pt-6">
      <GroupPageTitle
        title={title}
        fallbackHref={back}
        actions={
          <span className="shrink-0 text-sm text-muted-foreground" data-testid="payments-count">
            {t('paymentsPlayersCount', { count: summary.rows.length })}
          </span>
        }
      />

      <Card className="flex flex-col gap-3 p-4" data-testid="payments-total">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">{t('paymentsTotalTitle')}</span>
          <span className="text-xs text-muted-foreground">{t('paymentsFeeEach', { amount: money(summary.fee) })}</span>
        </div>
        <p className="text-2xl font-semibold tabular-nums">
          {money(summary.collected)}
          <span className="text-base font-normal text-muted-foreground">
            {' '}
            {t('paymentsOfExpected', { amount: money(summary.expected) })}
          </span>
        </p>
        <div
          role="progressbar"
          aria-label={t('paymentsTotalTitle')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </Card>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as PaymentFilter)}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          {tabs.map((o) => (
            <TabsTrigger key={o.value} value={o.value} className="flex-none" data-testid={`payments-tab-${o.value}`}>
              {o.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {participants.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed p-8 text-center" data-testid="payments-empty">
          <p className="text-sm font-medium">{emptyCopy.title}</p>
          <p className="text-sm text-muted-foreground">{emptyCopy.body}</p>
        </div>
      ) : (
        <ul className="flex flex-col" data-testid="payments-list">
          {rows.map((row) => {
            const name = row.name ?? '—';
            return (
              <li key={row.id} className="flex items-center gap-3 px-2 py-2" data-testid={`payments-row-${row.id}`}>
                <Avatar className="size-9">
                  <AvatarImage src={avatarUrl(row.avatarPath) ?? undefined} alt="" />
                  <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{name}</span>
                  {row.partial ? (
                    <span className="text-xs text-muted-foreground" data-testid={`payments-owed-${row.id}`}>
                      {t('paymentsOwesDifference', { amount: money(row.owed) })}
                    </span>
                  ) : null}
                </span>
                {row.guest ? <Badge variant="secondary">{t('guestTag')}</Badge> : null}
                <Button
                  variant={row.paid ? 'success' : 'secondary'}
                  size="sm"
                  className="min-w-24"
                  aria-pressed={row.paid}
                  aria-label={t(row.paid ? 'paymentsMarkPendingA11y' : 'paymentsMarkPaidA11y', { name })}
                  disabled={!editable || pendingId === row.id || busyAll}
                  onClick={() => void toggle(row)}
                  data-testid={`payments-toggle-${row.id}`}
                >
                  {row.paid ? t('paidBadge') : t('paymentsPending')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {editable && summary.rows.length > 0 ? (
        <div className="sticky bottom-0 -mx-4 mt-auto border-t bg-card px-4 py-3 sm:-mx-6 sm:px-6">
          <Button
            className="w-full"
            disabled={summary.pendingCount === 0 || busyAll}
            onClick={() => setConfirmAll(true)}
            data-testid="payments-mark-all"
          >
            {t('markAllPaidCta')}
          </Button>
        </div>
      ) : (
        <div className="pb-6" />
      )}

      <AlertDialog open={confirmAll} onOpenChange={(o) => (!o && !busyAll ? setConfirmAll(false) : undefined)}>
        <AlertDialogContent data-testid="payments-mark-all-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('paymentsMarkAllTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('paymentsMarkAllBody', { count: summary.pendingCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAll}>{t('cancel')}</AlertDialogCancel>
            <Button disabled={busyAll} onClick={() => void onMarkAll()} data-testid="payments-mark-all-confirm">
              {t('markAllPaidCta')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
