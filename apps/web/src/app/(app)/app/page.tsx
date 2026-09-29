'use client';
import { CalendarDays, Users } from 'lucide-react';
import { useMyEventStatuses, useMyEvents, useMyGroups, useMyProfile } from '@padel/api';
import { useT } from '@padel/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { EventCard, type EventCardEvent } from '@/components/event/EventCard';
import { GroupMiniCard } from '@/components/group/GroupMiniCard';
import { HomeRail } from '@/components/home/HomeRail';
import { QuickActions } from '@/components/home/QuickActions';
import { exploreSearchHref } from '@/lib/explore-links';

/** How many cards each rail shows before "See all" (mobile shows the same eight events). */
const RAIL_EVENTS = 8;
const RAIL_GROUPS = 8;

/**
 * Home (UX-HOME-01): quick actions, then Next Events and My Groups as rails of vertical cards,
 * each with "See all" and the standard empty state. No search here — search lives on Explore,
 * and the Find actions go there with the matching tab selected.
 *
 * The plain list of the viewer's communities that used to sit here is gone: the audit's Home is
 * these three sections, and communities keep their own page in the sidebar (and Find Community).
 */
export default function AppHome() {
  const { t } = useT('app');
  const { t: th } = useT('home');
  const profile = useMyProfile();
  // 'going' includes the waiting list and interested since 0112; the card labels those.
  const events = useMyEvents('going');
  const { data: statuses } = useMyEventStatuses();
  const groups = useMyGroups();

  const eventRows = (events.data?.pages.flat() ?? []) as EventCardEvent[];
  const groupRows = groups.data ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-8 px-4 py-6 sm:p-6">
      <h1 className="text-2xl font-semibold">
        {profile.isLoading ? (
          <Skeleton className="h-8 w-48" />
        ) : (
          t('welcome', { name: profile.data?.full_name ?? '' })
        )}
      </h1>

      <QuickActions />

      <HomeRail
        id="home-next-events-title"
        title={th('nextEvents')}
        seeAllHref="/app/events"
        testId="home-next-events"
        loading={events.isLoading}
        error={events.isError}
        onRetry={() => void events.refetch()}
        empty={
          eventRows.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={th('eventsEmpty')}
              action={{ label: th('findEventsCta'), href: exploreSearchHref('events'), testId: 'home-next-events-find' }}
              testId="home-next-events-empty"
            />
          ) : null
        }
      >
        {eventRows.slice(0, RAIL_EVENTS).map((e) => (
          <EventCard key={e.id} event={e} viewerStatus={statuses?.[e.id]} orientation="vertical" />
        ))}
      </HomeRail>

      <HomeRail
        id="home-groups-title"
        title={th('myGroups')}
        // Your Groups has no sidebar entry of its own — this "See all" is the way in
        // (product decision, 2026-09-25).
        seeAllHref="/app/groups"
        testId="home-groups"
        loading={groups.isLoading}
        error={groups.isError}
        onRetry={() => void groups.refetch()}
        empty={
          groupRows.length === 0 ? (
            <EmptyState
              icon={Users}
              title={th('groupsEmpty')}
              action={{ label: th('findGroupsCta'), href: exploreSearchHref('groups'), testId: 'home-groups-find' }}
              testId="home-groups-empty"
            />
          ) : null
        }
      >
        {groupRows.slice(0, RAIL_GROUPS).map((g) => (
          <GroupMiniCard key={g.group_id} group={g} orientation="vertical" />
        ))}
      </HomeRail>
    </div>
  );
}
