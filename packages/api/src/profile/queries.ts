import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

const PAGE_SIZE = 20;
const nextOffset = (lastPage: unknown[], allPages: unknown[][]) =>
  lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE;

export const useProfile = (targetId: string | undefined) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.profile(targetId ?? ''),
    enabled: !!uid && !!targetId,
    queryFn: async () => {
      const { data, error } = await db.rpc('get_player_profile', { p_target: targetId! });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
};

const useFollowList = (
  rpc: 'list_following' | 'list_followers',
  userId: string | undefined,
  search: string,
) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  const key = rpc === 'list_following' ? qk.following(userId ?? '') : qk.followers(userId ?? '');
  return useInfiniteQuery({
    queryKey: [...key, search] as const,
    enabled: !!uid && !!userId,
    initialPageParam: 0,
    queryFn: async ({ pageParam: offset }) => {
      const { data, error } = await db.rpc(rpc, {
        p_user: userId!,
        p_search: search.trim() || null,
        p_limit: PAGE_SIZE,
        p_offset: offset as number,
      });
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: nextOffset,
  });
};

export const useFollowing = (userId: string | undefined, search = '') =>
  useFollowList('list_following', userId, search);
export const useFollowers = (userId: string | undefined, search = '') =>
  useFollowList('list_followers', userId, search);

export const useMyProfile = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.myProfile(uid ?? ''),
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db
        .from('profiles')
        .select('id, full_name, avatar_url, description, date_of_birth, gender, dominant_hand, court_side, preferred_time')
        .eq('id', uid!)
        .single();
      if (error) throw error;
      return data;
    },
  });
};
