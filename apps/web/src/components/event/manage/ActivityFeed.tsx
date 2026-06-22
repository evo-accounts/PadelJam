'use client';
import { useT } from '@padel/i18n';
import type { ActivityRow } from '@padel/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { avatarUrl } from '@/lib/upload';

export function ActivityFeed({ rows }: { rows: ActivityRow[] }) {
  const { t, i18n } = useT('event');
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('activityEmpty')}</p>;
  }
  return (
    <Card className="divide-y p-0">
      {rows.map((r) => {
        const name = r.profiles?.full_name ?? '—';
        const label = t(`activity_${r.action}`, { defaultValue: r.action });
        const target = r.detail?.target_name ? ` · ${r.detail.target_name}` : '';
        return (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar className="size-9">
              <AvatarImage src={avatarUrl(r.profiles?.avatar_url) ?? undefined} />
              <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm">
                <span className="font-medium">{name}</span> {label}
                {target}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleString(i18n.language)}
              </span>
            </div>
          </div>
        );
      })}
    </Card>
  );
}
