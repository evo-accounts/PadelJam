'use client';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useT } from '@padel/i18n';
import {
  useNotifications,
  useUnreadCount,
  useNotificationsRealtime,
  useMarkAllRead,
} from '@padel/api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { NotificationItem } from './NotificationItem';

export function NotificationBell() {
  const { t } = useT('notifications');
  useNotificationsRealtime();
  const unread = useUnreadCount();
  const notifications = useNotifications();
  const markAllRead = useMarkAllRead();

  const count = unread.data ?? 0;
  const recent = (notifications.data?.pages.flat() ?? []).slice(0, 8);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t('title')}>
          <Bell />
          {count > 0 ? (
            <span className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4">
              {count > 9 ? '9+' : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-semibold">{t('title')}</span>
          {count > 0 ? (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllRead.mutate()}
            >
              {t('markAllRead')}
            </button>
          ) : null}
        </div>
        <div className="max-h-96 divide-y overflow-y-auto">
          {notifications.isLoading ? (
            <Skeleton className="m-3 h-16" />
          ) : recent.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            recent.map((n) => <NotificationItem key={n.id} n={n} />)
          )}
        </div>
        <Link
          href="/app/notifications"
          className="block border-t px-4 py-2 text-center text-sm font-medium hover:bg-muted/50"
        >
          {t('seeAll')}
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
