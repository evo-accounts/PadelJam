'use client';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { ArrowLeft, Building2, CalendarDays, UserRound, Users } from 'lucide-react';
import {
  useExploreCommunitiesList,
  useExploreEventsList,
  useExploreGroupsList,
  useExplorePlayersList,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { EventCard } from '@/components/event/EventCard';
import { CreateEventAction } from '@/components/explore/CreateEventAction';
import { ExploreCommunityCard } from '@/components/explore/ExploreCommunityCard';
import type { ExploreType } from '@/components/explore/ExploreFeed';
import { ExploreGroupCard } from '@/components/explore/ExploreGroupCard';
import { PlayerCard } from '@/components/explore/PlayerCard';
import { SeeAllList } from '@/components/explore/SeeAllList';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Separator } from '@/components/ui/separator';

const TITLE = {
  players: 'seeAllTitlePlayers',
  events: 'seeAllTitleEvents',
  communities: 'seeAllTitleCommunities',
  groups: 'seeAllTitleGroups',
} as const satisfies Record<ExploreType, string>;

const isType = (v: string | undefined): v is ExploreType => !!v && v in TITLE;

// One component per type, so a screen runs only its own list query (mobile's B2 was all four).

function PlayersList() {
  const { t } = useT('explore');
  return (
    <SeeAllList
      query={useExplorePlayersList()}
      testId="explore-list-players"
      renderRow={(p) => <PlayerCard player={p} orientation="horizontal" />}
      empty={<EmptyState icon={UserRound} title={t('emptyPlayers')} testId="explore-list-players-empty" />}
    />
  );
}

function EventsList() {
  const { t } = useT('explore');
  return (
    <SeeAllList
      query={useExploreEventsList()}
      testId="explore-list-events"
      renderRow={(e) => <EventCard event={e} />}
      empty={
        <EmptyState icon={CalendarDays} title={t('emptyEvents')} testId="explore-list-events-empty">
          <CreateEventAction testId="explore-list-events-create" />
        </EmptyState>
      }
    />
  );
}

function CommunitiesList() {
  const { t } = useT('explore');
  return (
    <SeeAllList
      query={useExploreCommunitiesList()}
      testId="explore-list-communities"
      renderRow={(c) => <ExploreCommunityCard community={c} orientation="horizontal" />}
      empty={<EmptyState icon={Building2} title={t('emptyCommunities')} testId="explore-list-communities-empty" />}
    />
  );
}

function GroupsList() {
  const { t } = useT('explore');
  return (
    <SeeAllList
      query={useExploreGroupsList()}
      testId="explore-list-groups"
      renderRow={(g) => <ExploreGroupCard group={g} orientation="horizontal" />}
      empty={<EmptyState icon={Users} title={t('emptyGroups')} testId="explore-list-groups-empty" />}
    />
  );
}

const LISTS: Record<ExploreType, () => React.ReactNode> = {
  players: PlayersList,
  events: EventsList,
  communities: CommunitiesList,
  groups: GroupsList,
};

/**
 * See all (UX-EXPL-03): every recommendation of one type. Back on the left, the section's title
 * centred, a divider, then full-width horizontal cards with the same inline actions as the rail.
 * A recommendation list, not search: no input, no tabs, no filters.
 */
export default function ExploreSeeAllPage() {
  const { t } = useT('explore');
  const { type } = useParams<{ type: string }>();
  if (!isType(type)) notFound();
  const List = LISTS[type];

  return (
    <div className="flex min-w-0 flex-col pb-16">
      <header className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2 px-4 py-3 sm:px-6">
        <Button asChild variant="tertiary" size="icon" aria-label={t('back')}>
          <Link href="/app/explore" data-testid="explore-list-back">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="truncate text-center text-lg font-semibold">{t(TITLE[type])}</h1>
        <span aria-hidden />
      </header>
      <Separator />
      <div className="px-4 pt-4 sm:px-6">
        <List />
      </div>
    </div>
  );
}
