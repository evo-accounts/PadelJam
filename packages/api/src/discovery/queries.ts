import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import type { Database } from '@padel/db';
import { useDb } from '../client';
import { qk } from '../query-keys';

type Fns = Database['public']['Functions'];

// --- Viewer state (migration 0128, D9) ---
// Every explore row says where the VIEWER stands with it, so a card renders its action (Follow /
// Join / Request / Requested / Open) without a query of its own. The rails exclude what the viewer
// already has — members, pending requests, people they follow — so on a rail these mostly read
// 'none'; the full unions are the contract the search RPCs (0129) share.
export type PlayerViewerState = 'following' | 'none';
export type CommunityViewerState = 'member' | 'requested' | 'invited' | 'none';
export type GroupViewerState = 'member' | 'none';

export type ExplorePlayer = Omit<Fns['explore_players']['Returns'][number], 'viewer_state'> & {
  viewer_state: PlayerViewerState;
};
/** `distance_m` is metres from the viewer's profile location; null when either side has no point. */
export type ExploreCommunity = Omit<Fns['explore_communities']['Returns'][number], 'viewer_state'> & {
  viewer_state: CommunityViewerState;
};
/** A group's `distance_m` is its community's: groups have no location of their own (D2). */
export type ExploreGroup = Omit<Fns['explore_groups']['Returns'][number], 'viewer_state'> & {
  viewer_state: GroupViewerState;
};

const asPlayers = (rows: Fns['explore_players']['Returns'] | null) => (rows ?? []) as ExplorePlayer[];
const asCommunities = (rows: Fns['explore_communities']['Returns'] | null) =>
  (rows ?? []) as ExploreCommunity[];
const asGroups = (rows: Fns['explore_groups']['Returns'] | null) => (rows ?? []) as ExploreGroup[];

const RAIL_LIMIT = 10;
const PAGE_SIZE = 20;

const nextOffset = (lastPage: unknown[], allPages: unknown[][]) =>
  lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE;

// --- Rails (limit 10) ---

export const useExploreCommunities = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.exploreCommunities,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db.rpc('explore_communities', {
        p_limit: RAIL_LIMIT,
        p_offset: 0,
      });
      if (error) throw error;
      return asCommunities(data);
    },
  });
};

export const useExploreGroups = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.exploreGroups,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db.rpc('explore_groups', { p_limit: RAIL_LIMIT, p_offset: 0 });
      if (error) throw error;
      return asGroups(data);
    },
  });
};

export const useExploreEvents = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.exploreEvents,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db.rpc('explore_events', { p_limit: RAIL_LIMIT, p_offset: 0 });
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r.event, distance_m: r.distance_m }));
    },
  });
};

export const useExplorePlayers = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.explorePlayers,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db.rpc('explore_players', { p_limit: RAIL_LIMIT, p_offset: 0 });
      if (error) throw error;
      return asPlayers(data);
    },
  });
};

// --- See-all (paged) ---

export const useExploreCommunitiesList = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useInfiniteQuery({
    queryKey: qk.exploreCommunitiesList,
    enabled: !!uid,
    initialPageParam: 0,
    queryFn: async ({ pageParam: offset }) => {
      const { data, error } = await db.rpc('explore_communities', {
        p_limit: PAGE_SIZE,
        p_offset: offset as number,
      });
      if (error) throw error;
      return asCommunities(data);
    },
    getNextPageParam: nextOffset,
  });
};

export const useExploreGroupsList = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useInfiniteQuery({
    queryKey: qk.exploreGroupsList,
    enabled: !!uid,
    initialPageParam: 0,
    queryFn: async ({ pageParam: offset }) => {
      const { data, error } = await db.rpc('explore_groups', {
        p_limit: PAGE_SIZE,
        p_offset: offset as number,
      });
      if (error) throw error;
      return asGroups(data);
    },
    getNextPageParam: nextOffset,
  });
};

export const useExploreEventsList = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useInfiniteQuery({
    queryKey: qk.exploreEventsList,
    enabled: !!uid,
    initialPageParam: 0,
    queryFn: async ({ pageParam: offset }) => {
      const { data, error } = await db.rpc('explore_events', {
        p_limit: PAGE_SIZE,
        p_offset: offset as number,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r.event, distance_m: r.distance_m }));
    },
    getNextPageParam: nextOffset,
  });
};

export const useExplorePlayersList = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useInfiniteQuery({
    queryKey: qk.explorePlayersList,
    enabled: !!uid,
    initialPageParam: 0,
    queryFn: async ({ pageParam: offset }) => {
      const { data, error } = await db.rpc('explore_players', {
        p_limit: PAGE_SIZE,
        p_offset: offset as number,
      });
      if (error) throw error;
      return asPlayers(data);
    },
    getNextPageParam: nextOffset,
  });
};
