import type { TypedClient } from '@padel/db';

export const getTenantMemberships = (c: TypedClient, userId: string) =>
  c.from('tenant_memberships').select('tenant_id, role').eq('user_id', userId);
