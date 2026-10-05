import {
  EVENT_TYPE_FILTERS,
  type CommunityPrivacy,
  type CommunitySearchFilters,
  type CommunitySearchSort,
  type CommunityType,
  type EventSearchFilters,
  type EventSearchSort,
  type EventTypeFilter,
  type GroupSearchFilters,
  type GroupSearchSort,
} from './search';

/**
 * The Filter sheet's state per result tab (UX-EXPL-08, D13). Each tab owns its own — switching tab
 * carries nothing across, and coming back restores that tab's filters and chips. The shapes are
 * the form's (local calendar days for the date pickers); `toEventFilters` and friends turn them
 * into what the 0129 RPCs take.
 *
 * Shared by both apps, so the mobile Filter sheet and the web Filter dialog send the RPCs the same
 * filters. The label maps hold i18n KEYS only; each app resolves them in its own namespace.
 */
export type ExploreSearchTypedTab = 'events' | 'groups' | 'communities';

export type EventsFilterState = {
  sort: EventSearchSort;
  /** 'YYYY-MM-DD' in the viewer's time zone, or ''. */
  dateFrom: string;
  dateTo: string;
  types: EventTypeFilter[];
  maxKm: number | null;
  free: boolean;
  recurring: boolean;
};

export type GroupsFilterState = {
  sort: GroupSearchSort;
  communityIds: string[];
  maxKm: number | null;
  withUpcoming: boolean;
};

export type CommunitiesFilterState = {
  sort: CommunitySearchSort;
  types: CommunityType[];
  maxKm: number | null;
  privacy: CommunityPrivacy[];
  withUpcoming: boolean;
};

export type SearchFilterState = {
  events: EventsFilterState;
  groups: GroupsFilterState;
  communities: CommunitiesFilterState;
};

export const EMPTY_EVENTS_FILTERS: EventsFilterState = {
  sort: 'relevant',
  dateFrom: '',
  dateTo: '',
  types: [],
  maxKm: null,
  free: false,
  recurring: false,
};
export const EMPTY_GROUPS_FILTERS: GroupsFilterState = {
  sort: 'relevant',
  communityIds: [],
  maxKm: null,
  withUpcoming: false,
};
export const EMPTY_COMMUNITIES_FILTERS: CommunitiesFilterState = {
  sort: 'relevant',
  types: [],
  maxKm: null,
  privacy: [],
  withUpcoming: false,
};
export const EMPTY_SEARCH_FILTERS: SearchFilterState = {
  events: EMPTY_EVENTS_FILTERS,
  groups: EMPTY_GROUPS_FILTERS,
  communities: EMPTY_COMMUNITIES_FILTERS,
};

/** The nine type chips' labels (D4), in the explore namespace. */
export const EVENT_TYPE_LABEL: Record<EventTypeFilter, string> = {
  'americano:classic': 'typeAmericanoClassic',
  'mexicano:classic': 'typeMexicanoClassic',
  'up_and_down:classic': 'typeUpDownClassic',
  'americano:mixed': 'typeAmericanoMixed',
  'americano:team': 'typeAmericanoTeam',
  'mexicano:mixed': 'typeMexicanoMixed',
  'mexicano:team': 'typeMexicanoTeam',
  'up_and_down:team': 'typeUpDownTeam',
  'up_and_down:mixed': 'typeUpDownMixed',
};

export const COMMUNITY_TYPE_LABEL: Record<CommunityType, string> = {
  club: 'communityTypeClub',
  team: 'communityTypeTeam',
  friends: 'communityTypeFriends',
};
export const COMMUNITY_TYPE_OPTIONS = Object.keys(COMMUNITY_TYPE_LABEL) as CommunityType[];

export const PRIVACY_LABEL: Record<CommunityPrivacy, string> = {
  public: 'privacyPublic',
  request_to_join: 'privacyRequest',
  private: 'privacyPrivate',
};
export const PRIVACY_OPTIONS = Object.keys(PRIVACY_LABEL) as CommunityPrivacy[];

export const SORT_LABEL = {
  relevant: 'sortRelevant',
  date: 'sortDate',
  recent: 'sortRecent',
  distance: 'sortDistance',
} as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' as local midnight of that day. */
export function localDay(day: string): Date {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * A local calendar day as an ISO timestamp with the viewer's own offset — the start of the day,
 * or its last millisecond — so "From 3 Oct" means 3 Oct where the viewer is, not in UTC.
 */
export function localDayIso(day: string, edge: 'start' | 'end'): string {
  const at = localDay(day);
  if (edge === 'end') at.setHours(23, 59, 59, 999);
  const off = -at.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const time = edge === 'start' ? '00:00:00.000' : '23:59:59.999';
  return `${day}T${time}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export const toEventFilters = (s: EventsFilterState): EventSearchFilters => ({
  date_from: s.dateFrom ? localDayIso(s.dateFrom, 'start') : null,
  date_to: s.dateTo ? localDayIso(s.dateTo, 'end') : null,
  types: s.types,
  max_km: s.maxKm,
  free: s.free,
  recurring: s.recurring,
});

export const toGroupFilters = (s: GroupsFilterState): GroupSearchFilters => ({
  community_ids: s.communityIds,
  max_km: s.maxKm,
  with_upcoming: s.withUpcoming,
});

export const toCommunityFilters = (s: CommunitiesFilterState): CommunitySearchFilters => ({
  types: s.types,
  max_km: s.maxKm,
  privacy: s.privacy,
  with_upcoming: s.withUpcoming,
});

/** Toggle `value` in a multi-select. */
export const toggle = <T>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

/** The type filter a "For you" format chip runs (D6): every specification of that event type. */
export const typesForFormat = (format: string): EventTypeFilter[] =>
  EVENT_TYPE_FILTERS.filter((f) => f.startsWith(`${format}:`));

/**
 * The number in "{{km}} km away" for a distance in metres: one decimal under 10 km ("3.4"), whole
 * kilometres from 10 km ("27"). Under a kilometre the apps say "Nearby" instead and don't call this.
 */
export const formatDistanceKm = (metres: number): string => {
  const km = metres / 1000;
  return km < 10 ? km.toFixed(1) : String(Math.round(km));
};
