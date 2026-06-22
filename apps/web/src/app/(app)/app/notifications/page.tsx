'use client';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import {
  useNotifications,
  useMarkAllRead,
  useClearAll,
  usePartnerRequestSummary,
} from '@padel/api';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function NotificationsPage() {
  const { t } = useT('notifications');
  const list = useNotifications();
  const markAllRead = useMarkAllRead();
  const clearAll = useClearAll();
  const summary = usePartnerRequestSummary();

  const rows = list.data?.pages.flat() ?? [];
  const pending = summary.data ?? 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => markAllRead.mutate()}>
            {t('markAllRead')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => clearAll.mutate()}>
            {t('clearAll')}
          </Button>
        </div>
      </div>

      <Link
        href="/app/notifications/partner-requests"
        className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted/50"
      >
        <span className="text-sm font-medium">{t('partnerRequests')}</span>
        <span className="text-sm text-primary">{t('pendingCount', { count: pending })}</span>
      </Link>

      {list.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : list.isError ? (
        <p className="text-sm text-destructive">{t('loadError')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <Card className="divide-y p-0">
          {rows.map((n) => (
            <NotificationItem key={n.id} n={n} />
          ))}
        </Card>
      )}

      {list.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={list.isFetchingNextPage}
          onClick={() => list.fetchNextPage()}
        >
          {t('seeAll')}
        </Button>
      ) : null}
    </div>
  );
}
