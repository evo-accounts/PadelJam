import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

/**
 * Follow/unfollow/block change the target's and the actor's profile counts and follow lists — and,
 * since migration 0102, the follow CONTROL on every follow list in the app.
 *
 * That last part is why this cannot just name the two users involved. `list_followers` and
 * `list_following` now return `is_following` / `is_followed_by` computed against the VIEWER, so
 * following someone changes their row inside anybody's list. Invalidating only the actor's and the
 * target's own lists left the row you had just tapped still reading "Follow" while the database
 * said otherwise — visible on a third party's followers list, which is exactly the case UX-PROF-05
 * calls out ("including when browsing someone else's followers list").
 *
 * So every follow list is invalidated by predicate, and the two profiles by key.
 */
const invalidateFollow = (qc: QueryClient, uid: string | undefined, targetId: string) => {
  qc.invalidateQueries({ queryKey: qk.profile(targetId) });
  if (uid) qc.invalidateQueries({ queryKey: qk.profile(uid) });
  qc.invalidateQueries({
    predicate: (q) => {
      const k = q.queryKey;
      return k[0] === 'profile' && (k[2] === 'followers' || k[2] === 'following');
    },
  });
};

export const useFollow = () => {
  const db = useDb();
  const qc = useQueryClient();
  const uid = useSession().session?.user.id;
  return useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await db.from('follows').insert({ follower_id: uid!, followee_id: targetId });
      if (error) throw error;
    },
    onSuccess: (_d, targetId) => invalidateFollow(qc, uid, targetId),
  });
};

export const useUnfollow = () => {
  const db = useDb();
  const qc = useQueryClient();
  const uid = useSession().session?.user.id;
  return useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await db.from('follows').delete().match({ follower_id: uid!, followee_id: targetId });
      if (error) throw error;
    },
    onSuccess: (_d, targetId) => invalidateFollow(qc, uid, targetId),
  });
};

export const useBlock = () => {
  const db = useDb();
  const qc = useQueryClient();
  const uid = useSession().session?.user.id;
  return useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await db.rpc('block_user', { p_target: targetId });
      if (error) throw error;
    },
    onSuccess: (_d, targetId) => {
      // block_user deletes follow edges both ways, so the actor's lists move too.
      invalidateFollow(qc, uid, targetId);
      invalidateBlocks(qc);
    },
  });
};

/**
 * Every `list_my_blocks` query, whatever it was searched with.
 *
 * `qk.myBlocks(search)` puts the term IN the key, so blocking or unblocking while a filter is
 * typed leaves the filtered list stale — which is exactly the state the Blocked users screen is in
 * when the Unblock button is pressed. A prefix match would not do it either, because the term is
 * the last segment; this matches the two that identify the query and ignores it.
 */
const invalidateBlocks = (qc: QueryClient) =>
  qc.invalidateQueries({
    predicate: (q) => q.queryKey[0] === 'blocks' && q.queryKey[1] === 'mine',
  });

export const useUnblock = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await db.rpc('unblock_user', { p_target: targetId });
      if (error) throw error;
    },
    onSuccess: (_d, targetId) => {
      qc.invalidateQueries({ queryKey: qk.profile(targetId) });
      // Without this the row stays in the Blocked users list after the write lands (UX-SET-06
      // asks for it to go immediately), and the unblocked profile keeps rendering its collapsed
      // photo-name-Unblock state, which reads it from the same query.
      invalidateBlocks(qc);
    },
  });
};

export type UpdateProfileInput = {
  full_name?: string;
  description?: string | null;
  dominant_hand?: string | null;
  court_side?: string | null;
  gender?: string | null;
  preferred_time?: string | null;
  date_of_birth?: string | null;
  avatar_url?: string | null;
  locale?: string;
};

export const useUpdateProfile = () => {
  const db = useDb();
  const qc = useQueryClient();
  const uid = useSession().session?.user.id;
  return useMutation({
    mutationFn: async (input: UpdateProfileInput) => {
      const { error } = await db.from('profiles').update(input).eq('id', uid!);
      if (error) throw error;
    },
    onSuccess: () => {
      if (uid) {
        qc.invalidateQueries({ queryKey: qk.profile(uid) });
        qc.invalidateQueries({ queryKey: qk.myProfile(uid) });
      }
    },
  });
};

export const useReport = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useMutation({
    mutationFn: async (input: { targetId: string; reason: string; description?: string }) => {
      const { error } = await db.from('reports').insert({
        reporter_id: uid!,
        reported_user_id: input.targetId,
        reason: input.reason,
        description: input.description ?? null,
      });
      if (error) throw error;
    },
  });
};

/**
 * Write the profile's location — coordinates and label together.
 *
 * Deliberately NOT part of `useUpdateProfile`. `profiles.location_point` is a PostGIS geography
 * column, and `set_my_location(lat, lng, text)` is its only sanctioned writer; it overwrites the
 * point AND `location_text` as a pair, so neither can ride along in an ordinary `profiles` UPDATE.
 * Passing null coordinates clears the point.
 */
export const useSetMyLocation = () => {
  const db = useDb();
  const qc = useQueryClient();
  const uid = useSession().session?.user.id;
  return useMutation({
    mutationFn: async (place: { lat: number; lng: number; text: string | null }) => {
      const { error } = await db.rpc('set_my_location', {
        p_lat: place.lat,
        p_lng: place.lng,
        p_text: place.text,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      if (!uid) return;
      qc.invalidateQueries({ queryKey: qk.profile(uid) });
    },
  });
};
