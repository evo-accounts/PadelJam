import { describe, it, expect } from 'vitest';
import { authorize } from './authorize';
import type { AuthContext } from '@padel/permissions';
import type { TypedClient } from '@padel/db';

const ctx: AuthContext = {
  userId: 'u1', tenantRoles: [], communityRole: { communityId: 'c1', role: 'admin' },
};
const stubClient = (featureOn: boolean) =>
  ({ rpc: async () => ({ data: featureOn, error: null }) }) as unknown as TypedClient;

describe('authorize', () => {
  it('passes when entitlement + permission both hold', async () => {
    const r = await authorize({
      client: stubClient(true), ctx, action: 'create', subject: 'Broadcast',
      feature: 'custom_broadcasts', featureScope: 'community', communityId: 'c1',
    });
    expect(r.ok).toBe(true);
  });

  it('fails with reason "entitlement" when the plan lacks an MVP feature', async () => {
    const r = await authorize({
      client: stubClient(false), ctx, action: 'create', subject: 'Broadcast',
      feature: 'custom_broadcasts', featureScope: 'community', communityId: 'c1',
    });
    expect(r).toEqual({ ok: false, reason: 'entitlement', detail: 'custom_broadcasts' });
  });

  it('fails with reason "forbidden" when CASL denies', async () => {
    const memberCtx: AuthContext = { ...ctx, communityRole: { communityId: 'c1', role: 'member' } };
    const r = await authorize({
      client: stubClient(true), ctx: memberCtx, action: 'delete', subject: 'Community',
      communityId: 'c1',
    });
    expect(r).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('skips the entitlement check for a non-MVP feature key', async () => {
    const r = await authorize({
      client: stubClient(false), ctx, action: 'read', subject: 'Analytics',
      feature: 'analytics_pro', featureScope: 'community', communityId: 'c1',
    });
    expect(r.ok).toBe(true);
  });
});
