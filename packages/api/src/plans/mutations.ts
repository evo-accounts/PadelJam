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

/**
 * Sets a community's tier on request: Starter, Basic or Community Pro.
 *
 * Fails with 'forbidden' when the caller is not an ADMIN of the community (any admin since
 * migration 0098 — it was the owner only before, and the `owner` role no longer exists), and with
 * 'plan_downgrade_over_limit' when the community already exceeds the TARGET plan's member or group
 * caps. Since 0103 that check runs against whichever plan is being set, not always Starter's, so
 * Community Pro -> Basic is guarded too.
 *
 * 'club' is not settable from the app.
 */
export const useSetCommunityPlan = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      communityId,
      plan,
    }: {
      communityId: string;
      plan: 'starter' | 'basic' | 'community_pro';
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
