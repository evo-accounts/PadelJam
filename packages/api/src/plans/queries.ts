import { useQuery } from '@tanstack/react-query';
import { useDb } from '../client';
import { qk } from '../query-keys';

/** The caller's own effective account plan ('free' | 'jammer_plus'), including plans derived
 * from owning a community whose plan bundles Jammer+ (see account_plan, migration 0014). */
export const useAccountPlan = () => {
  const db = useDb();
  return useQuery({
    queryKey: qk.accountPlan,
    queryFn: async () => {
      const { data, error } = await db.rpc('account_plan_of_caller');
      if (error) throw error;
      return data;
    },
  });
};

/** A community's effective plan ('starter' | 'basic' | 'community_pro' | 'club'). */
export const useCommunityPlan = (communityId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.communityPlan(communityId),
    queryFn: async () => {
      const { data, error } = await db.rpc('community_plan', { c: communityId });
      if (error) throw error;
      return data;
    },
  });
};
