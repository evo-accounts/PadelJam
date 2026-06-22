'use client';
import { useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useMarkRead, useCompleteNotificationCta, type NotificationRow } from '@padel/api';
import { notificationRoute } from '@padel/utils';
import { Button } from '@/components/ui/button';

const CTA_TYPES = new Set(['event_invite', 'group_invite', 'community_invite']);

export function NotificationItem({ n, onNavigate }: { n: NotificationRow; onNavigate?: () => void }) {
  const { t, i18n } = useT('notifications');
  const router = useRouter();
  const markRead = useMarkRead();
  const completeCta = useCompleteNotificationCta();

  const message = t(n.type, {
    actor: n.actor_name ?? '',
    entity: n.entity_name ?? '',
    defaultValue: n.entity_name ?? n.actor_name ?? '',
  });
  const when = new Date(n.created_at).toLocaleString(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const onRowClick = () => {
    if (!n.read_at) markRead.mutate(n.id);
    const route = notificationRoute(n);
    if (route) router.push(`/app${route}`);
    onNavigate?.();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onRowClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onRowClick();
      }}
      className={`flex items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
        n.read_at ? '' : 'bg-primary/5'
      }`}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm">{message}</span>
        <span className="text-xs text-muted-foreground">{when}</span>
      </div>
      {CTA_TYPES.has(n.type) ? (
        n.cta_done ? (
          <span className="shrink-0 text-xs text-muted-foreground">{t('joined')}</span>
        ) : (
          <Button
            size="sm"
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              completeCta.mutate(n);
            }}
          >
            {t('join')}
          </Button>
        )
      ) : null}
    </div>
  );
}
