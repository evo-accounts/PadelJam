import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

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
      return data ?? [];
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
      return data ?? [];
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
      return data ?? [];
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
      return data ?? [];
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
      return data ?? [];
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
      return data ?? [];
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
      return data ?? [];
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
      return data ?? [];
    },
    getNextPageParam: nextOffset,
  });
};
