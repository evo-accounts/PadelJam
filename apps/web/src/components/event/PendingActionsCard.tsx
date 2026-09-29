'use client';
/**
 * Pending actions (UX-MEVT-24): a collapsible card pinned to the bottom of the organizer's event
 * page (inside its bottom area, above the actions), titled with the count and collapsed by default. Expanded, each action is a row with its
 * description and a chevron, opening the page that resolves it. Renders nothing once nothing is
 * pending — a resolved action drops out of `pendingActions` on its own. Web's twin of mobile's
 * `PendingActionsCard`.
 */
import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronUp } from 'lucide-react';
import { useT } from '@padel/i18n';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { PendingAction } from './pendingActions';

export function PendingActionsCard({ actions }: { actions: PendingAction[] }) {
  const { t } = useT('event');
  const [open, setOpen] = useState(false);
  if (actions.length === 0) return null;

  const label = (a: PendingAction): string => {
    switch (a.key) {
      case 'teams':
        return t('pendingTeams');
      case 'spots':
        return t('pendingSpots', { count: a.count });
      case 'payments':
        return t('pendingPayments', { count: a.count });
      case 'location':
        return t('pendingLocation');
      case 'courts':
        return t('pendingCourts');
    }
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-xl border bg-background"
      data-testid="pending-actions"
    >
      <CollapsibleTrigger
        className="flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left font-medium focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        data-testid="pending-actions-toggle"
      >
        <span className="flex-1">{t('pendingActionsTitle', { count: actions.length })}</span>
        <ChevronUp
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex flex-col border-t">
          {actions.map((a) => (
            <li key={a.key}>
              <Link
                href={a.href}
                className="flex items-center gap-2 px-4 py-3 text-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                data-testid={`pending-action-${a.key}`}
              >
                <span className="flex-1">{label(a)}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
