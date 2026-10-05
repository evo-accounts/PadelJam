'use client';
/**
 * Blasts already sent for this event, newest first: title, who it went to, the channels, when, and
 * the email delivery status (with Retry on a failed attempt). WhatsApp is sent from the organizer's
 * device, so it has no delivery status of its own.
 */
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { useEventBlastDeliveries, useEventBlasts, useRetryBlast } from '@padel/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function BlastHistory({ eventId }: { eventId: string }) {
  const { t, i18n } = useT('event');
  const blasts = useEventBlasts(eventId);
  const deliveries = useEventBlastDeliveries(eventId);
  const retry = useRetryBlast(eventId);

  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (blasts.isLoading) return <Skeleton className="h-24" />;
  const rows = blasts.data ?? [];
  if (rows.length === 0) return null;

  const onRetry = (blastId: string) => {
    setRetrying(blastId);
    setError(null);
    retry
      .mutateAsync(blastId)
      .catch((e) => setError(t(e instanceof Error ? e.message : 'unknown_error', { defaultValue: t('unknown_error') })))
      .finally(() => setRetrying(null));
  };

  return (
    <section className="flex flex-col gap-3" data-testid="blast-history">
      <h2 className="text-lg font-semibold">{t('blastHistoryTitle')}</h2>
      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
      <ul className="flex flex-col gap-2">
        {rows.map((b) => {
          // `deliveries.data` is keyed by blast_id and holds the latest EMAIL attempt.
          const d = deliveries.data?.[b.id];
          const hasEmail = b.channels.includes('email');
          const failed = d?.status === 'failed';
          const status = !hasEmail
            ? null
            : !d
              ? t('deliveryPending')
              : failed
                ? `${t('deliveryFailed')} (${d.failed_count})`
                : `${t('deliveryDelivered')} (${d.sent_count})`;
          const channels = b.channels
            .map((c) => (c === 'email' ? t('blastChannelEmail') : c === 'whatsapp' ? t('blastChannelWhatsapp') : c))
            .join(' · ');
          const when = b.sent_at ? new Date(b.sent_at).toLocaleString(i18n.language) : '—';
          return (
            <li key={b.id}>
              <Card className="flex flex-col gap-1 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">{b.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{when}</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {t(`blastSendTo_${b.send_to}`, { defaultValue: t('blastSendTo_all') })} · {channels}
                </span>
                {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
                {failed ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-1 self-start"
                    disabled={retrying === b.id}
                    onClick={() => onRetry(b.id)}
                  >
                    {t('retryBlastCta')}
                  </Button>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
