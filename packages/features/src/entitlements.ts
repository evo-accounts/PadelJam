import type { TypedClient } from '@padel/db';
import type { AccountFeatureKey, CommunityFeatureKey, LimitKey } from './registry';

export const hasFeature = async (
  client: TypedClient, communityId: string, key: CommunityFeatureKey,
): Promise<boolean> => {
  const { data } = await client.rpc('community_has_feature', { c: communityId, key });
  return data ?? false;
};

export const hasAccountFeature = async (
  client: TypedClient, userId: string, key: AccountFeatureKey,
): Promise<boolean> => {
  const { data } = await client.rpc('account_has_feature', { u: userId, key });
  return data ?? false;
};

export const getLimit = async (
  client: TypedClient, communityId: string, key: LimitKey,
): Promise<number | null> => {
  const { data } = await client.rpc('community_limit', { c: communityId, key });
  return data ?? null;
};
