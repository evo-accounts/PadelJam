'use client';
import type { ReactElement } from 'react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { useCommunities, useEventCreatableGroups } from '@padel/api';
import { useT } from '@padel/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { createEventTargets } from './create-event-targets';

/**
 * "Create event" on web. The wizard is opened from a community, so with exactly one community to
 * create in, the control goes straight there (`renderLink`); otherwise `trigger` opens a menu —
 * the communities to pick from, or, with none, a pointer to the communities page, where you can
 * join or create one.
 *
 * Shared by Home's quick action card (UX-HOME-01) and Explore's Events empty state (D10), which
 * dress the same behaviour differently. `trigger` must forward its ref (Radix `asChild`).
 */
export function CreateEventMenu({
  testId,
  trigger,
  renderLink,
}: {
  testId: string;
  trigger: ReactElement;
  renderLink: (href: string) => ReactElement;
}) {
  const { t } = useT('home');
  const communities = useCommunities();
  const creatable = useEventCreatableGroups();
  const loading = communities.isLoading || creatable.isLoading;
  const targets = createEventTargets(communities.data ?? [], creatable.data ?? []);

  if (!loading && targets.length === 1) return renderLink(`/app/community/${targets[0]!.id}/event-create`);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64" data-testid={`${testId}-menu`}>
        {loading ? (
          <div className="flex flex-col gap-2 p-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ) : targets.length === 0 ? (
          <>
            <DropdownMenuLabel className="font-normal text-muted-foreground">{t('createEventNone')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/app/community">{t('goToCommunities')}</Link>
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuLabel className="font-normal text-muted-foreground">{t('createEventIn')}</DropdownMenuLabel>
            {targets.map((c) => (
              <DropdownMenuItem key={c.id} asChild>
                <Link href={`/app/community/${c.id}/event-create`} data-testid={`${testId}-${c.id}`}>
                  <Building2 aria-hidden />
                  <span className="truncate">{c.name}</span>
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
