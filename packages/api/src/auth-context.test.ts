import { it, expect } from 'vitest';
import { buildAuthContext } from './auth-context';

it('assembles AuthContext from rows', () => {
  const ctx = buildAuthContext('u1',
    [{ tenant_id: 't1', role: 'community_owner' }],
    { community_id: 'c1', role: 'admin' },
    {
      invite_members: true,
      approve_join_requests: false,
      create_posts: true,
      create_groups: false,
      create_events: true,
    });
  expect(ctx.userId).toBe('u1');
  expect(ctx.communityRole).toEqual({ communityId: 'c1', role: 'admin' });
  expect(ctx.communityPermissions?.invite_members).toBe(true);
  // The two toggles migration 0098 added must survive the round trip, not be dropped silently.
  expect(ctx.communityPermissions?.create_events).toBe(true);
  expect(ctx.communityPermissions?.create_groups).toBe(false);
});
