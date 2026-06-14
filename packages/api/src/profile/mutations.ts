import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

export const useFollow = () => {
  const db = useDb();
  const qc = useQueryClient();
  const uid = useSession().session?.user.id;
  return useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await db.from('follows').insert({ follower_id: uid!, followee_id: targetId });
      if (error) throw error;
    },
    onSuccess: (_d, targetId) => qc.invalidateQueries({ queryKey: qk.profile(targetId) }),
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
    onSuccess: (_d, targetId) => qc.invalidateQueries({ queryKey: qk.profile(targetId) }),
  });
};

export const useBlock = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await db.rpc('block_user', { p_target: targetId });
      if (error) throw error;
    },
    onSuccess: (_d, targetId) => qc.invalidateQueries({ queryKey: qk.profile(targetId) }),
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
