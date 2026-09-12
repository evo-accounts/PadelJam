import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb, mapPgError } from '../client';
import { qk } from '../query-keys';

/** Grants/revokes Jammer+ for the caller on request (UX-GLOB-10: no transaction in the MVP). */
export const useSetAccountPlan = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plan: 'free' | 'jammer_plus') => {
      const { data, error } = await db.rpc('set_account_plan', { p_plan: plan });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.accountPlan });
    },
  });
};

/** Grants/revokes Community Pro for a community on request. Fails with 'forbidden' when the
 * caller isn't the owner, and 'plan_downgrade_over_limit' when a downgrade to Starter would
 * leave the community over its member/group caps. */
export const useSetCommunityPlan = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      communityId,
      plan,
    }: {
      communityId: string;
      plan: 'starter' | 'community_pro';
    }) => {
      const { data, error } = await db.rpc('set_community_plan', {
        p_community_id: communityId,
        p_plan: plan,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data;
    },
    onSuccess: (_data, { communityId }) => {
      qc.invalidateQueries({ queryKey: qk.communityPlan(communityId) });
      qc.invalidateQueries({ queryKey: qk.community(communityId) });
      qc.invalidateQueries({ queryKey: qk.groups(communityId) });
      qc.invalidateQueries({ queryKey: qk.canCreateGroup(communityId) });
    },
  });
};
