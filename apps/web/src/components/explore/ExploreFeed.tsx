'use client';
import { CalendarDays } from 'lucide-react';
import {
  useExploreCommunities,
  useExploreEvents,
  useExploreGroups,
  useExplorePlayers,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { EventCard } from '@/components/event/EventCard';
import { HomeRail } from '@/components/home/HomeRail';
import { EmptyState } from '@/components/ui/empty-state';
import { CreateEventAction } from './CreateEventAction';
import { ExploreCommunityCard } from './ExploreCommunityCard';
import { ExploreGroupCard } from './ExploreGroupCard';
import { PlayerCard } from './PlayerCard';

export type ExploreType = 'players' | 'events' | 'communities' | 'groups';

export const seeAllHref = (type: ExploreType) => `/app/explore/${type}`;

/** A rail with nothing in it once loaded (not while loading, not on error). */
const loadedEmpty = (q: { isLoading: boolean; isError: boolean; data?: unknown[] }) =>
  !q.isLoading && !q.isError && (q.data?.length ?? 0) === 0;

/**
 * The recommendation feed under Explore's search input (UX-EXPL-01, UX-EXPL-02): Players you
 * might know, Events, Communities, Groups — each a row of vertical cards with "See all".
 *
 * Players, Communities and Groups are hidden when they have nothing to show; Events keeps its
 * place with the standard empty state and "Create event", its one meaningful action (D10). Each
 * rail loads, fails and retries on its own.
 */
export function ExploreFeed() {
  const { t } = useT('explore');
  const players = useExplorePlayers();
  const events = useExploreEvents();
  const communities = useExploreCommunities();
  const groups = useExploreGroups();

  return (
    <div className="flex min-w-0 flex-col gap-8" data-testid="explore-feed">
      {loadedEmpty(players) ? null : (
        <HomeRail
          id="explore-players-title"
          title={t('railPlayers')}
          seeAllHref={seeAllHref('players')}
          testId="explore-players"
          loading={players.isLoading}
          error={players.isError}
          onRetry={() => void players.refetch()}
          empty={null}
        >
          {(players.data ?? []).map((p) => (
            <PlayerCard key={p.id} player={p} />
          ))}
        </HomeRail>
      )}

      <HomeRail
        id="explore-events-title"
        title={t('railEvents')}
        seeAllHref={seeAllHref('events')}
        testId="explore-events"
        loading={events.isLoading}
        error={events.isError}
        onRetry={() => void events.refetch()}
        empty={
          loadedEmpty(events) ? (
            <EmptyState icon={CalendarDays} title={t('emptyEvents')} testId="explore-events-empty">
              <CreateEventAction testId="explore-events-create" />
            </EmptyState>
          ) : null
        }
      >
        {(events.data ?? []).map((e) => (
          <EventCard key={e.id} event={e} orientation="vertical" />
        ))}
      </HomeRail>

      {loadedEmpty(communities) ? null : (
        <HomeRail
          id="explore-communities-title"
          title={t('railCommunities')}
          seeAllHref={seeAllHref('communities')}
          testId="explore-communities"
          loading={communities.isLoading}
          error={communities.isError}
          onRetry={() => void communities.refetch()}
          empty={null}
        >
          {(communities.data ?? []).map((c) => (
            <ExploreCommunityCard key={c.id} community={c} />
          ))}
        </HomeRail>
      )}

      {loadedEmpty(groups) ? null : (
        <HomeRail
          id="explore-groups-title"
          title={t('railGroups')}
          seeAllHref={seeAllHref('groups')}
          testId="explore-groups"
          loading={groups.isLoading}
          error={groups.isError}
          onRetry={() => void groups.refetch()}
          empty={null}
        >
          {(groups.data ?? []).map((g) => (
            <ExploreGroupCard key={g.id} group={g} />
          ))}
        </HomeRail>
      )}
    </div>
  );
}
