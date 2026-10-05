'use client';
import { History } from 'lucide-react';
import { useT } from '@padel/i18n';
import type { ActivityRow } from '@padel/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { avatarUrl } from '@/lib/upload';
import { activityLine, relativeTime } from './activityLine';
import { formatMoney } from './paymentList';

/**
 * The Activity log (UX-MEVT-17): newest first (useEventActivity orders it), one row per entry —
 * who (avatar), what (a sentence per action, `activityLine`), when (relative, with the exact time
 * on hover). Empty state per UX-GLOB-03.
 */
export function ActivityFeed({ rows, nowMs }: { rows: ActivityRow[]; nowMs: number }) {
  const { t, i18n } = useT('event');
  const tt = t as unknown as (key: string, options?: Record<string, unknown>) => string;
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center" data-testid="activity-empty">
        <History className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">{t('activityEmpty')}</p>
        <p className="text-sm text-muted-foreground">{t('activityEmptyBody')}</p>
      </div>
    );
  }
  const money = (n: number) => formatMoney(n, i18n.language);
  return (
    <ol className="flex flex-col" data-testid="activity-list">
      {rows.map((r) => {
        const name = r.profiles?.full_name ?? t('activitySomeone');
        const exact = new Date(r.created_at).toLocaleString(i18n.language);
        return (
          <li key={r.id} className="flex items-start gap-3 px-2 py-3" data-testid={`activity-row-${r.action}`}>
            <Avatar className="size-9">
              <AvatarImage src={avatarUrl(r.profiles?.avatar_url) ?? undefined} alt="" />
              <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm">{activityLine(tt, r, money)}</span>
              <time dateTime={r.created_at} title={exact} className="text-xs text-muted-foreground">
                {relativeTime(r.created_at, i18n.language, tt, nowMs)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
