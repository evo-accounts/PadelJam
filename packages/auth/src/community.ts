import type { TypedClient } from '@padel/db';

export const getCommunityMemberships = (c: TypedClient, userId: string) =>
  c.from('community_members').select('community_id, role').eq('user_id', userId);
