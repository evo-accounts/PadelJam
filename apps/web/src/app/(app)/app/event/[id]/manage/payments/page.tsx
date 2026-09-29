'use client';
/**
 * Payment list — reached from the dashboard's Paid card and the event page's "Payment list" chip,
 * both shown only when the event has an entrance fee. Web's twin of mobile's `payments.tsx`.
 *
 * INTERIM (W1): today's paid toggles, moved here from the old single-page Manage — one row per
 * confirmed player with Paid / Unpaid, and "Mark all paid". W4 rebuilds it as UX-MEVT-16 (Paid /
 * Pending tabs, credited amounts after a fee change — decision 9).
 */
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import { useEvent, useEventParticipants, useEventRealtime, useMarkAllPaid, useMarkPaid } from '@padel/api';
import { BackButton } from '@/components/group/GroupHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { avatarUrl } from '@/lib/upload';

export default function PaymentListPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT('event');
  const uid = useSession().session?.user.id;
  useEventRealtime(id);
  const event = useEvent(id);
  const participants = useEventParticipants(id);
  const markPaid = useMarkPaid(id);
  const markAllPaid = useMarkAllPaid(id);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const header = (
    <div className="flex items-center gap-2">
      <BackButton fallbackHref={`/app/event/${id}/manage`} label={t('back')} />
      <h1 className="text-xl font-semibold">{t('paymentListTitle')}</h1>
    </div>
  );

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  if (event.data == null || uid == null || uid !== event.data.organizer_id) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-3 sm:px-6">
        {header}
        <p className="p-8 text-center text-sm text-muted-foreground" data-testid="payments-forbidden">
          {t('forbidden')}
        </p>
      </div>
    );
  }

  const confirmed = (participants.data ?? []).filter((p) => p.status === 'confirmed');
  const paidCount = confirmed.filter((p) => p.has_paid).length;

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (x) {
      setErr(t(x instanceof Error ? x.message : 'unknown_error', { defaultValue: t('unknown_error') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-3 pb-8 sm:px-6">
      {header}
      {err ? (
        <p role="alert" className="text-sm text-destructive">
          {err}
        </p>
      ) : null}
      {confirmed.length === 0 ? (
        <div className="flex flex-col items-center gap-1 p-8 text-center" data-testid="payments-empty">
          <p className="font-medium">{t('paymentsEmptyTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('paymentsEmptyBody')}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" data-testid="payments-count">
              {t('dashRatio', { n: paidCount, total: confirmed.length })}
            </p>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || paidCount === confirmed.length}
              onClick={() => void run(() => markAllPaid.mutateAsync())}
              data-testid="payments-mark-all"
            >
              {t('markAllPaidCta')}
            </Button>
          </div>
          <Card className="divide-y p-0">
            {confirmed.map((p) => {
              const name = p.profiles?.full_name ?? p.guest_name ?? '—';
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar className="size-9">
                    <AvatarImage src={avatarUrl(p.profiles?.avatar_url) ?? undefined} alt="" />
                    <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                  <Button
                    variant={p.has_paid ? 'secondary' : 'tertiary'}
                    size="sm"
                    aria-pressed={p.has_paid}
                    disabled={busy}
                    onClick={() =>
                      void run(() => markPaid.mutateAsync({ participantId: p.id, paid: !p.has_paid, targetName: name }))
                    }
                    data-testid={`payments-toggle-${p.id}`}
                  >
                    {p.has_paid ? t('paidBadge') : t('unpaidBadge')}
                  </Button>
                </div>
              );
            })}
          </Card>
        </>
      )}
    </div>
  );
}
