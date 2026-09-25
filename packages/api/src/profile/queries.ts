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

/**
 * People matching a name, for the invite picker (UX-COMM-22).
 *
 * This lived inline in `manage/invite.tsx` as a raw `db.from('profiles')` call
 * with its own `useState`/`useEffect`/`setTimeout` machinery, which meant the
 * screen re-ran the query on every remount and cached nothing. React Query
 * already de-duplicates and caches per search term; the CALLER still debounces
 * the keystrokes, since this only sees the term it is given.
 *
 * Deliberately not filtered to non-members here: who is already in the
 * community is the caller's business, and doing it in SQL would need the
 * community id threaded through a query that has nothing else to do with it.
 */
export const useSearchProfiles = (search: string) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  const term = search.trim();
  return useQuery({
    queryKey: qk.profileSearch(term),
    enabled: !!uid && term.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from('profiles')
        .select('id, full_name, avatar_url')
        .ilike('full_name', `%${term}%`)
        .limit(20)
        .returns<{ id: string; full_name: string | null; avatar_url: string | null }[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
};

/**
 * GoTrue stores a phone WITHOUT the leading '+' and returns '' when there is none; profiles.phone
 * held the E.164 spelling. Keep the shape the Account screens have always rendered.
 */
export const ownPhone = (authPhone: string | null | undefined): string | null =>
  authPhone ? `+${authPhone.replace(/^\+/, '')}` : null;

export const useMyProfile = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.myProfile(uid ?? ''),
    enabled: !!uid,
    queryFn: async () => {
      // email and phone are DISPLAYED by Account Settings (UX-SET-02) but never written here —
      // both change through their own OTP flows, which go via GoTrue rather than this table.
      //
      // phone is NOT selected: migration 0115 revokes SELECT on profiles.phone from every client
      // role, so no user can read anyone's number, their own included. Your own comes from the auth
      // user instead — profiles.phone was only ever a server-side copy of it. getSession() reads the
      // stored session (no network), which the phone-change OTP flow refreshes.
      const [{ data, error }, { data: auth }] = await Promise.all([
        db
          .from('profiles')
          .select('id, full_name, avatar_url, description, date_of_birth, gender, dominant_hand, court_side, preferred_time, location_text, email')
          .eq('id', uid!)
          .single(),
        db.auth.getSession(),
      ]);
      if (error) throw error;
      return { ...data, phone: ownPhone(auth.session?.user.phone) };
    },
  });
};

/**
 * The Groups section of a profile (UX-PROF-01).
 *
 * `my_groups` took no argument until migration 0102 — it is `security definer`, so pointing it at
 * another user is a privacy widening, and the rule lives in the function rather than here: someone
 * else's profile shows only groups in communities you both belong to, never private ones, and
 * `is_managing` comes back NULL rather than false. Passing no argument still means "me".
 */
export const usePlayerGroups = (userId: string | undefined) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.profileGroups(userId ?? ''),
    enabled: !!uid && !!userId,
    queryFn: async () => {
      const { data, error } = await db.rpc('my_groups', { p_user: userId! });
      if (error) throw error;
      return data ?? [];
    },
  });
};

/**
 * The Last results section (UX-PROF-01): recent matches with a recorded score.
 *
 * Note this counts something different from the `played_matches` stat beside it, and both are
 * right. That stat counts rows in `group_event_results` — finished RANKED GROUP events. This counts
 * matches the engine has a score for. A standalone americano contributes to one and not the other.
 */
export const usePlayerResults = (userId: string | undefined, limit = 5) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.profileResults(userId ?? ''),
    enabled: !!uid && !!userId,
    queryFn: async () => {
      const { data, error } = await db.rpc('player_recent_results', { p_user: userId!, p_limit: limit });
      if (error) throw error;
      return data ?? [];
    },
  });
};

/**
 * Who I blocked — the UX-SET-06 list, and the only way to render UX-PROF-03's collapsed profile.
 *
 * `get_player_profile` returns zero rows for a block in EITHER direction, so the blocker cannot
 * read the row either. Distinguishing "I blocked them" from "they blocked me" is exactly what this
 * answers, and it is why the collapsed profile can show a name and photo at all.
 */
export const useMyBlocks = (search = '') => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.myBlocks(search),
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db.rpc('list_my_blocks', {
        p_search: search.trim() || null,
        p_limit: 100,
        p_offset: 0,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
};

/**
 * The raw counters behind the badge catalogue (migration 0105).
 *
 * Returns NUMBERS, never verdicts — `evaluateBadges` in `@padel/utils` turns them into unlock
 * states, so changing a threshold is a code change rather than another hand-pasted migration.
 *
 * The RPC is a single row; PostgREST still returns it as an array, so it is unwrapped here and the
 * consumer never has to think about `[0]`.
 */
export const usePlayerBadgeFacts = (userId: string | undefined) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.profileBadges(userId ?? ''),
    enabled: !!uid && !!userId,
    queryFn: async () => {
      const { data, error } = await db.rpc('player_badge_facts', { p_user: userId! });
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
  });
};
