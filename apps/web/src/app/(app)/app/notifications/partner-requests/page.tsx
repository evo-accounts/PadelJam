'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { useIncomingPartnerRequests, useRespondToRequest } from '@padel/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { avatarUrl } from '@/lib/upload';

export default function PartnerRequestsPage() {
  const { t } = useT('notifications');
  const list = useIncomingPartnerRequests();
  const respond = useRespondToRequest();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = (kind: 'event' | 'community', requestId: string, action: 'accept' | 'decline') => {
    setError(null);
    setBusyId(requestId);
    respond
      .mutateAsync({ kind, requestId, action })
      .catch(() => setError(t('respondError')))
      .finally(() => setBusyId(null));
  };

  const rows = list.data ?? [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('partnerRequests')}</h1>
        <Button asChild variant="ghost" size="sm">
          <Link href="/app/notifications">{t('title')}</Link>
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {list.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : list.isError ? (
        <p className="text-sm text-destructive">{t('requestsError')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('requestsEmpty')}</p>
      ) : (
        <Card className="divide-y p-0">
          {rows.map((r) => {
            const name = r.requester_name ?? '—';
            const label =
              r.kind === 'event'
                ? t('partnerRequestLabel', { entity: r.entity_name })
                : `${name} ${t('joinRequestLabel', { entity: r.entity_name })}`;
            return (
              <div key={r.request_id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-9">
                    <AvatarImage src={avatarUrl(r.requester_avatar) ?? undefined} />
                    <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">{label}</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === r.request_id}
                    onClick={() => act(r.kind, r.request_id, 'decline')}
                  >
                    {t('decline')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busyId === r.request_id}
                    onClick={() => act(r.kind, r.request_id, 'accept')}
                  >
                    {t('accept')}
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
