'use client';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import Link from 'next/link';
import { Building2, CalendarSearch, CirclePlus, Users, type LucideIcon } from 'lucide-react';
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
import { exploreSearchHref } from '@/lib/explore-links';
import { cn } from '@/lib/utils';
import { createEventTargets } from './create-event-targets';

/** Every quick action is the same card, link or menu trigger alike (UX-HOME-01: consistent size). */
const CARD =
  'flex h-24 w-36 shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-xl border bg-card px-3 text-center text-sm font-medium shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

type CardProps = { icon: LucideIcon; label: string } & ComponentPropsWithoutRef<'button'>;

/** The menu-trigger form of a quick action card (Radix needs a ref-forwarding element). */
const QuickActionButton = forwardRef<HTMLButtonElement, CardProps>(function QuickActionButton(
  { icon: Icon, label, className, ...props },
  ref,
) {
  return (
    <button ref={ref} type="button" className={cn(CARD, className)} {...props}>
      <Icon className="size-6 text-primary" aria-hidden />
      <span>{label}</span>
    </button>
  );
});

function QuickActionLink({ icon: Icon, label, href, testId }: { icon: LucideIcon; label: string; href: string; testId: string }) {
  return (
    <Link href={href} className={CARD} data-testid={testId}>
      <Icon className="size-6 text-primary" aria-hidden />
      <span>{label}</span>
    </Link>
  );
}

/**
 * Create Event. Web's wizard is opened from a community, so with exactly one community to create
 * in the card goes straight there; otherwise it opens a menu: the communities to pick from, or —
 * with none — a pointer to the communities page, where you can join or create one.
 */
function CreateEventAction() {
  const { t } = useT('home');
  const communities = useCommunities();
  const creatable = useEventCreatableGroups();
  const loading = communities.isLoading || creatable.isLoading;
  const targets = createEventTargets(communities.data ?? [], creatable.data ?? []);
  const label = t('quickCreate');

  if (!loading && targets.length === 1) {
    return (
      <QuickActionLink
        icon={CirclePlus}
        label={label}
        href={`/app/community/${targets[0]!.id}/event-create`}
        testId="home-quick-create"
      />
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <QuickActionButton icon={CirclePlus} label={label} data-testid="home-quick-create" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64" data-testid="home-quick-create-menu">
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
                <Link href={`/app/community/${c.id}/event-create`} data-testid={`home-quick-create-${c.id}`}>
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

/**
 * Home's quick actions (UX-HOME-01): Create Event, then the three ways into Explore search with
 * the matching tab pre-selected. One row of equal cards that scrolls sideways when the page is
 * too narrow for all four, so none is ever cut off.
 */
export function QuickActions() {
  const { t } = useT('home');
  return (
    <nav aria-label={t('quickActions')} data-testid="home-quick-actions">
      <ul className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6">
        <li>
          <CreateEventAction />
        </li>
        <li>
          <QuickActionLink icon={CalendarSearch} label={t('findEvent')} href={exploreSearchHref('events')} testId="home-quick-find-event" />
        </li>
        <li>
          <QuickActionLink icon={Users} label={t('findGroup')} href={exploreSearchHref('groups')} testId="home-quick-find-group" />
        </li>
        <li>
          <QuickActionLink icon={Building2} label={t('findCommunity')} href={exploreSearchHref('communities')} testId="home-quick-find-community" />
        </li>
      </ul>
    </nav>
  );
}
