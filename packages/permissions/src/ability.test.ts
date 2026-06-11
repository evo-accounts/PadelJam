import { describe, it, expect } from 'vitest';
import { abilityFor } from './ability';
import type { AuthContext } from './context';

const base = (over: Partial<AuthContext>): AuthContext => ({
  userId: 'u1', tenantRoles: [], ...over,
});
const C = 'c1';

describe('abilityFor', () => {
  it('super_admin can manage everything', () => {
    const a = abilityFor(base({ tenantRoles: [{ tenantId: 't1', role: 'super_admin' }] }));
    expect(a.can('manage', 'all')).toBe(true);
  });

  it('community owner can create a group in their community', () => {
    const a = abilityFor(base({ communityRole: { communityId: C, role: 'owner' } }));
    expect(a.can('create', 'Group')).toBe(true);
    expect(a.can('delete', 'Community')).toBe(true);
  });

  it('community admin can create groups but cannot delete the community', () => {
    const a = abilityFor(base({ communityRole: { communityId: C, role: 'admin' } }));
    expect(a.can('create', 'Group')).toBe(true);
    expect(a.can('delete', 'Community')).toBe(false);
  });

  it('a plain member cannot create groups or events', () => {
    const a = abilityFor(base({ communityRole: { communityId: C, role: 'member' } }));
    expect(a.can('read', 'Group')).toBe(true);
    expect(a.can('create', 'Group')).toBe(false);
    expect(a.can('create', 'Event')).toBe(false);
  });

  it('member toggles grant exactly invite/approve/post — never group/event creation', () => {
    const a = abilityFor(base({
      communityRole: { communityId: C, role: 'member' },
      communityPermissions: { invite_members: true, approve_join_requests: true, create_posts: true },
    }));
    expect(a.can('create', 'Member')).toBe(true);
    expect(a.can('update', 'JoinRequest')).toBe(true);
    expect(a.can('create', 'Post')).toBe(true);
    expect(a.can('create', 'Group')).toBe(false);
    expect(a.can('create', 'Event')).toBe(false);
  });
});
