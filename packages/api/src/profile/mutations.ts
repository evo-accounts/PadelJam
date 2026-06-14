import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

// Follow/unfollow/block all change both the target's and the actor's profile counts and
// follow lists, so invalidate every affected surface (prefix-matches all search variants).
const invalidateFollow = (qc: QueryClient, uid: string | undefined, targetId: string) => {
  qc.invalidateQueries({ queryKey: qk.profile(targetId) });
  qc.invalidateQueries({ queryKey: qk.followers(targetId) });
  if (uid) {
    qc.invalidateQueries({ queryKey: qk.profile(uid) });
    qc.invalidateQueries({ queryKey: qk.following(uid) });
    qc.invalidateQueries({ queryKey: qk.followers(uid) });
  }
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
    // block_user deletes follow edges both ways, so invalidate the actor's lists too.
    onSuccess: (_d, targetId) => invalidateFollow(qc, uid, targetId),
  });
};

export const useUnblock = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await db.rpc('unblock_user', { p_target: targetId });
      if (error) throw error;
    },
    onSuccess: (_d, targetId) => qc.invalidateQueries({ queryKey: qk.profile(targetId) }),
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
