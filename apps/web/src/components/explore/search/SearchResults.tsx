'use client';
import { useState, type ReactNode } from 'react';
import { Building2, CalendarDays, SearchX, Users } from 'lucide-react';
import {
  useCommunities,
  useSearchCommunities,
  useSearchEvents,
  useSearchGroups,
  useSearchPlayers,
  type SearchEvent,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { EventCard } from '@/components/event/EventCard';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ExploreSearchTab } from '@/lib/explore-links';
import { ExploreCommunityCard } from '../ExploreCommunityCard';
import { ExploreGroupCard } from '../ExploreGroupCard';
import { PlayerCard } from '../PlayerCard';
import { FilterDialog } from './FilterDialog';
import { ResultsHeader, ResultsList, type AppliedChip } from './ResultsList';
import {
  COMMUNITY_TYPE_LABEL,
  EMPTY_COMMUNITIES_FILTERS,
  EMPTY_EVENTS_FILTERS,
  EMPTY_GROUPS_FILTERS,
  EVENT_TYPE_LABEL,
  PRIVACY_LABEL,
  SORT_LABEL,
  toCommunityFilters,
  toEventFilters,
  toGroupFilters,
  localDay,
  toggle,
  type CommunitiesFilterState,
  type EventsFilterState,
  type GroupsFilterState,
  type SearchFilterState,
} from '@padel/api';
import { useViewerHasLocation } from '@padel/api';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const TABS: { value: ExploreSearchTab; label: string }[] = [
  { value: 'all', label: 'tabAll' },
  { value: 'events', label: 'tabEvents' },
  { value: 'groups', label: 'tabGroups' },
  { value: 'communities', label: 'tabCommunities' },
];

/** EventCard labels a spot the viewer does not hold yet; the other states need no badge. */
const eventViewerStatus = (e: SearchEvent) =>
  e.viewer_state === 'waiting_list' || e.viewer_state === 'interested' ? e.viewer_state : undefined;

/**
 * Search results (UX-EXPL-06, UX-EXPL-07): the tab bar All / Events / Groups / Communities exists
 * only here. All is a mixed overview with no filters; each typed tab has its count, its Filter
 * sheet, its applied chips and a full-width list. Only the active tab's queries run.
 *
 * Filters live in the parent, one set per tab (D13), so switching tab carries nothing across and
 * coming back restores what was applied.
 */
export function SearchResults({
  q,
  tab,
  onTab,
  filters,
  onFilters,
}: {
  q: string;
  tab: ExploreSearchTab;
  onTab: (tab: ExploreSearchTab) => void;
  filters: SearchFilterState;
  onFilters: (next: SearchFilterState) => void;
}) {
  const { t } = useT('explore');
  return (
    <Tabs value={tab} onValueChange={(v) => onTab(v as ExploreSearchTab)} className="min-w-0 gap-4" data-testid="explore-results">
      <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b" aria-label={t('resultsTabsLabel')}>
        {TABS.map((x) => (
          <TabsTrigger key={x.value} value={x.value} className="flex-none px-3" data-testid={`explore-tab-${x.value}`}>
            {t(x.label)}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="all" className="min-w-0">
        <AllTab q={q} onTab={onTab} />
      </TabsContent>
      <TabsContent value="events" className="min-w-0">
        <EventsTab q={q} state={filters.events} onState={(events) => onFilters({ ...filters, events })} />
      </TabsContent>
      <TabsContent value="groups" className="min-w-0">
        <GroupsTab q={q} state={filters.groups} onState={(groups) => onFilters({ ...filters, groups })} />
      </TabsContent>
      <TabsContent value="communities" className="min-w-0">
        <CommunitiesTab q={q} state={filters.communities} onState={(communities) => onFilters({ ...filters, communities })} />
      </TabsContent>
    </Tabs>
  );
}

// --- All ---

function AllSection({
  id,
  title,
  loading,
  onSeeAll,
  children,
}: {
  id: string;
  title: string;
  loading: boolean;
  onSeeAll?: () => void;
  children: ReactNode;
}) {
  const { t } = useT('explore');
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-labelledby={`explore-all-${id}-title`} data-testid={`explore-all-${id}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={`explore-all-${id}-title`} className="text-lg font-semibold">
          {title}
        </h2>
        {onSeeAll ? (
          <Button variant="tertiary" size="sm" className="text-primary" onClick={onSeeAll} data-testid={`explore-all-${id}-see-all`}>
            {t('seeAll')}
          </Button>
        ) : null}
      </div>
      {loading ? (
        <div className="-mx-4 flex gap-3 overflow-hidden px-4 sm:-mx-6 sm:px-6">
          <Skeleton className="h-48 w-44 shrink-0 rounded-xl" />
          <Skeleton className="h-48 w-44 shrink-0 rounded-xl" />
          <Skeleton className="h-48 w-44 shrink-0 rounded-xl" />
        </div>
      ) : (
        <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6" data-testid={`explore-all-${id}-rail`}>
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * All (UX-EXPL-06): Players, Events, Communities, Groups — each a titled row of vertical cards,
 * shown only when it has something. Players appear nowhere else. No filter control.
 */
function AllTab({ q, onTab }: { q: string; onTab: (tab: ExploreSearchTab) => void }) {
  const { t } = useT('explore');
  const { t: tc } = useT('common');
  const players = useSearchPlayers(q);
  const events = useSearchEvents(q);
  const communities = useSearchCommunities(q);
  const groups = useSearchGroups(q);
  const all = [players, events, communities, groups];

  const show = (x: { isLoading: boolean; data?: { items: unknown[] } }) => x.isLoading || (x.data?.items.length ?? 0) > 0;

  if (all.every((x) => x.isError && !x.data)) {
    return (
      <div className="flex flex-col items-start gap-2" role="alert" data-testid="explore-all-error">
        <p className="text-sm text-muted-foreground">{t('searchError')}</p>
        <Button variant="secondary" size="sm" onClick={() => all.forEach((x) => void x.refetch())}>
          {tc('retry')}
        </Button>
      </div>
    );
  }
  if (all.every((x) => !show(x))) {
    return (
      <EmptyState
        icon={SearchX}
        title={q.trim() ? t('noResultsFor', { q: q.trim() }) : t('noResults')}
        body={t('noResultsBody')}
        testId="explore-all-empty"
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-8" data-testid="explore-all">
      {show(players) ? (
        <AllSection id="players" title={t('sectionPlayers')} loading={players.isLoading}>
          {(players.data?.items ?? []).map((p) => (
            <PlayerCard key={p.id} player={p} />
          ))}
        </AllSection>
      ) : null}
      {show(events) ? (
        <AllSection id="events" title={t('sectionEvents')} loading={events.isLoading} onSeeAll={() => onTab('events')}>
          {(events.data?.items ?? []).map((e) => (
            <EventCard key={e.id} event={e} orientation="vertical" viewerStatus={eventViewerStatus(e)} />
          ))}
        </AllSection>
      ) : null}
      {show(communities) ? (
        <AllSection id="communities" title={t('sectionCommunities')} loading={communities.isLoading} onSeeAll={() => onTab('communities')}>
          {(communities.data?.items ?? []).map((c) => (
            <ExploreCommunityCard key={c.id} community={c} />
          ))}
        </AllSection>
      ) : null}
      {show(groups) ? (
        <AllSection id="groups" title={t('sectionGroups')} loading={groups.isLoading} onSeeAll={() => onTab('groups')}>
          {(groups.data?.items ?? []).map((g) => (
            <ExploreGroupCard key={g.id} group={g} />
          ))}
        </AllSection>
      ) : null}
    </div>
  );
}

// --- Typed tabs ---

const dayLabel = (day: string, lang: string) => localDay(day).toLocaleDateString(lang, { day: 'numeric', month: 'short' });

function sortChip(t: Translate, sort: keyof typeof SORT_LABEL, reset: () => void): AppliedChip[] {
  return sort === 'relevant' ? [] : [{ key: 'sort', label: t('sortChip', { sort: t(SORT_LABEL[sort]) }), onRemove: reset }];
}

function distanceChip(t: Translate, maxKm: number | null, reset: () => void): AppliedChip[] {
  return maxKm == null ? [] : [{ key: 'distance', label: t('distanceUpTo', { km: maxKm }), onRemove: reset }];
}

/** The empty state of a typed tab: with filters on, offer to clear them. */
function TypedEmpty({
  icon,
  q,
  kind,
  filtered,
  onClear,
  testId,
}: {
  icon: typeof CalendarDays;
  q: string;
  kind: 'Events' | 'Groups' | 'Communities';
  filtered: boolean;
  onClear: () => void;
  testId: string;
}) {
  const { t } = useT('explore');
  return (
    <EmptyState
      icon={icon}
      title={q.trim() ? t(`noResults${kind}For`, { q: q.trim() }) : t(`noResults${kind}`)}
      body={filtered ? t('noResultsFiltered') : t('noResultsBody')}
      testId={testId}
    >
      {filtered ? (
        <Button variant="secondary" size="sm" onClick={onClear} data-testid={`${testId}-clear`}>
          {t('clearFilters')}
        </Button>
      ) : null}
    </EmptyState>
  );
}

function EventsTab({ q, state, onState }: { q: string; state: EventsFilterState; onState: (s: EventsFilterState) => void }) {
  const { t, i18n } = useT('explore');
  const { hasLocation } = useViewerHasLocation();
  const [open, setOpen] = useState(false);
  const effective = hasLocation ? state : { ...state, maxKm: null, sort: state.sort === 'distance' ? 'relevant' : state.sort };
  const apiFilters = toEventFilters(effective);
  const query = useSearchEvents(q, apiFilters, effective.sort);

  const chips: AppliedChip[] = [
    ...sortChip(t, effective.sort, () => onState({ ...state, sort: 'relevant' })),
    ...(state.dateFrom
      ? [{ key: 'from', label: t('chipFrom', { date: dayLabel(state.dateFrom, i18n.language) }), onRemove: () => onState({ ...state, dateFrom: '' }) }]
      : []),
    ...(state.dateTo
      ? [{ key: 'to', label: t('chipTo', { date: dayLabel(state.dateTo, i18n.language) }), onRemove: () => onState({ ...state, dateTo: '' }) }]
      : []),
    ...state.types.map((v) => ({ key: `type:${v}`, label: t(EVENT_TYPE_LABEL[v]), onRemove: () => onState({ ...state, types: toggle(state.types, v) }) })),
    ...distanceChip(t, effective.maxKm, () => onState({ ...state, maxKm: null })),
    ...(state.free ? [{ key: 'free', label: t('filterFree'), onRemove: () => onState({ ...state, free: false }) }] : []),
    ...(state.recurring ? [{ key: 'recurring', label: t('filterRecurring'), onRemove: () => onState({ ...state, recurring: false }) }] : []),
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ResultsHeader
        count={query.data?.totalCount ?? 0}
        loading={query.isLoading}
        appliedCount={chips.length}
        onFilter={() => setOpen(true)}
        chips={chips}
        testId="explore-events-results"
      />
      <ResultsList
        query={query}
        testId="explore-events-list"
        renderRow={(e) => <EventCard event={e} viewerStatus={eventViewerStatus(e)} />}
        empty={
          <TypedEmpty
            icon={CalendarDays}
            q={q}
            kind="Events"
            filtered={chips.length > 0}
            onClear={() => onState(EMPTY_EVENTS_FILTERS)}
            testId="explore-events-empty"
          />
        }
      />
      {open ? (
        <FilterDialog
          tab="events"
          value={state}
          hasLocation={hasLocation}
          onClose={() => setOpen(false)}
          onApply={(next) => {
            onState(next);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function GroupsTab({ q, state, onState }: { q: string; state: GroupsFilterState; onState: (s: GroupsFilterState) => void }) {
  const { t } = useT('explore');
  const { hasLocation } = useViewerHasLocation();
  const mine = useCommunities();
  const [open, setOpen] = useState(false);
  const effective = hasLocation ? state : { ...state, maxKm: null, sort: state.sort === 'distance' ? 'relevant' : state.sort };
  const query = useSearchGroups(q, toGroupFilters(effective), effective.sort);
  const names = new Map((mine.data ?? []).filter((r) => r.community).map((r) => [r.community!.id, r.community!.name]));

  const chips: AppliedChip[] = [
    ...sortChip(t, effective.sort, () => onState({ ...state, sort: 'relevant' })),
    ...state.communityIds.map((id) => ({
      key: `community:${id}`,
      label: names.get(id) ?? t('filterCommunity'),
      onRemove: () => onState({ ...state, communityIds: toggle(state.communityIds, id) }),
    })),
    ...distanceChip(t, effective.maxKm, () => onState({ ...state, maxKm: null })),
    ...(state.withUpcoming ? [{ key: 'upcoming', label: t('filterWithUpcoming'), onRemove: () => onState({ ...state, withUpcoming: false }) }] : []),
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ResultsHeader
        count={query.data?.totalCount ?? 0}
        loading={query.isLoading}
        appliedCount={chips.length}
        onFilter={() => setOpen(true)}
        chips={chips}
        testId="explore-groups-results"
      />
      <ResultsList
        query={query}
        testId="explore-groups-list"
        renderRow={(g) => <ExploreGroupCard group={g} orientation="horizontal" />}
        empty={
          <TypedEmpty
            icon={Users}
            q={q}
            kind="Groups"
            filtered={chips.length > 0}
            onClear={() => onState(EMPTY_GROUPS_FILTERS)}
            testId="explore-groups-empty"
          />
        }
      />
      {open ? (
        <FilterDialog
          tab="groups"
          value={state}
          hasLocation={hasLocation}
          onClose={() => setOpen(false)}
          onApply={(next) => {
            onState(next);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function CommunitiesTab({
  q,
  state,
  onState,
}: {
  q: string;
  state: CommunitiesFilterState;
  onState: (s: CommunitiesFilterState) => void;
}) {
  const { t } = useT('explore');
  const { hasLocation } = useViewerHasLocation();
  const [open, setOpen] = useState(false);
  const effective = hasLocation ? state : { ...state, maxKm: null, sort: state.sort === 'distance' ? 'relevant' : state.sort };
  const query = useSearchCommunities(q, toCommunityFilters(effective), effective.sort);

  const chips: AppliedChip[] = [
    ...sortChip(t, effective.sort, () => onState({ ...state, sort: 'relevant' })),
    ...state.types.map((v) => ({ key: `type:${v}`, label: t(COMMUNITY_TYPE_LABEL[v]), onRemove: () => onState({ ...state, types: toggle(state.types, v) }) })),
    ...distanceChip(t, effective.maxKm, () => onState({ ...state, maxKm: null })),
    ...state.privacy.map((v) => ({ key: `privacy:${v}`, label: t(PRIVACY_LABEL[v]), onRemove: () => onState({ ...state, privacy: toggle(state.privacy, v) }) })),
    ...(state.withUpcoming ? [{ key: 'upcoming', label: t('filterWithUpcoming'), onRemove: () => onState({ ...state, withUpcoming: false }) }] : []),
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ResultsHeader
        count={query.data?.totalCount ?? 0}
        loading={query.isLoading}
        appliedCount={chips.length}
        onFilter={() => setOpen(true)}
        chips={chips}
        testId="explore-communities-results"
      />
      <ResultsList
        query={query}
        testId="explore-communities-list"
        renderRow={(c) => <ExploreCommunityCard community={c} orientation="horizontal" />}
        empty={
          <TypedEmpty
            icon={Building2}
            q={q}
            kind="Communities"
            filtered={chips.length > 0}
            onClear={() => onState(EMPTY_COMMUNITIES_FILTERS)}
            testId="explore-communities-empty"
          />
        }
      />
      {open ? (
        <FilterDialog
          tab="communities"
          value={state}
          hasLocation={hasLocation}
          onClose={() => setOpen(false)}
          onApply={(next) => {
            onState(next);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
