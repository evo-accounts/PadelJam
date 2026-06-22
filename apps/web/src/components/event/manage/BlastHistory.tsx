'use client';

import { useState } from 'react';
import { useT } from '@padel/i18n';
import { useEventBlasts, useEventBlastDeliveries, useRetryBlast } from '@padel/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function BlastHistory({ eventId }: { eventId: string }) {
  const { t, i18n } = useT('event');
  const blasts = useEventBlasts(eventId);
  const deliveries = useEventBlastDeliveries(eventId);
  const retry = useRetryBlast(eventId);

  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (blasts.isLoading) return <Skeleton className="h-40" />;

  const rows = blasts.data ?? [];
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('blastYourEmpty')}</p>;
  }

  const onRetry = (blastId: string) => {
    setRetrying(blastId);
    setError(null);
    retry
      .mutateAsync(blastId)
      .catch((e) => setError(t(e instanceof Error ? e.message : 'unknown_error')))
      .finally(() => setRetrying(null));
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('blastSentTitle')}</h2>
      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
      {rows.map((b) => {
        // `deliveries.data` is a record keyed by blast_id holding the latest attempt.
        const d = deliveries.data?.[b.id];
        const failed = d?.status === 'failed';
        let status: string;
        if (!d) {
          status = t('deliveryPending');
        } else if (failed) {
          status = `${t('deliveryFailed')} (${d.failed_count})`;
        } else {
          status = `${t('deliveryDelivered')} (${d.sent_count})`;
        }
        const when = b.sent_at ? new Date(b.sent_at).toLocaleString(i18n.language) : '—';
        return (
          <Card key={b.id}>
            <CardContent className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{b.title}</span>
                <span className="text-sm text-muted-foreground">
                  {b.sent_to_count} · {when}
                </span>
              </div>
              <span className="text-sm text-muted-foreground">{status}</span>
              {failed ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 self-start"
                  disabled={retrying === b.id}
                  onClick={() => onRetry(b.id)}
                >
                  {t('retryBlastCta')}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
