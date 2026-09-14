import { describe, it, expect } from 'vitest';
import { abilityFor } from './ability';
import type { AuthContext, CommunityPermissionToggles } from './context';

const base = (over: Partial<AuthContext>): AuthContext => ({
  userId: 'u1', tenantRoles: [], ...over,
});
const C = 'c1';

/** All five toggles off, so each test turns on exactly the one it is about. */
const toggles = (over: Partial<CommunityPermissionToggles> = {}): CommunityPermissionToggles => ({
  invite_members: false,
  approve_join_requests: false,
  create_posts: false,
  create_groups: false,
  create_events: false,
  ...over,
});

describe('abilityFor', () => {
  it('super_admin can manage everything', () => {
    const a = abilityFor(base({ tenantRoles: [{ tenantId: 't1', role: 'super_admin' }] }));
    expect(a.can('manage', 'all')).toBe(true);
  });

  it('a community admin holds the two abilities that used to be owner-only', () => {
    // Before migration 0098 the owner branch was `manage all` and the admin branch explicitly
    // withheld these two. Two roles means an admin now archives the community (UX-COMM-24) and
    // changes its plan (UX-COMM-15).
    const a = abilityFor(base({ communityRole: { communityId: C, role: 'admin' } }));
    expect(a.can('create', 'Group')).toBe(true);
    expect(a.can('delete', 'Community')).toBe(true);
    expect(a.can('manage', 'Payment')).toBe(true);
  });

  it('an admin is never constrained by the member toggles', () => {
    const a = abilityFor(base({
      communityRole: { communityId: C, role: 'admin' },
      communityPermissions: toggles(),
    }));
    expect(a.can('create', 'Group')).toBe(true);
    expect(a.can('create', 'Event')).toBe(true);
    expect(a.can('create', 'Post')).toBe(true);
  });

  it('a plain member with every toggle off can create nothing', () => {
    const a = abilityFor(base({
      communityRole: { communityId: C, role: 'member' },
      communityPermissions: toggles(),
    }));
    expect(a.can('read', 'Group')).toBe(true);
    expect(a.can('create', 'Group')).toBe(false);
    expect(a.can('create', 'Event')).toBe(false);
    expect(a.can('create', 'Post')).toBe(false);
    expect(a.can('create', 'Member')).toBe(false);
    expect(a.can('update', 'JoinRequest')).toBe(false);
  });

  it('each of the five toggles grants exactly its own ability', () => {
    const only = (key: keyof CommunityPermissionToggles) =>
      abilityFor(base({
        communityRole: { communityId: C, role: 'member' },
        communityPermissions: toggles({ [key]: true }),
      }));

    const invite = only('invite_members');
    expect(invite.can('create', 'Member')).toBe(true);
    expect(invite.can('create', 'Group')).toBe(false);

    const approve = only('approve_join_requests');
    expect(approve.can('update', 'JoinRequest')).toBe(true);
    expect(approve.can('create', 'Member')).toBe(false);

    const posts = only('create_posts');
    expect(posts.can('create', 'Post')).toBe(true);
    expect(posts.can('create', 'Event')).toBe(false);

    // The two the audit added (UX-COMM-17); 0012 had ruled both out as admin-only.
    const groups = only('create_groups');
    expect(groups.can('create', 'Group')).toBe(true);
    expect(groups.can('create', 'Event')).toBe(false);

    const events = only('create_events');
    expect(events.can('create', 'Event')).toBe(true);
    expect(events.can('create', 'Group')).toBe(false);
  });

  it('a member never gains community administration from a toggle', () => {
    const a = abilityFor(base({
      communityRole: { communityId: C, role: 'member' },
      communityPermissions: toggles({
        invite_members: true, approve_join_requests: true, create_posts: true,
        create_groups: true, create_events: true,
      }),
    }));
    expect(a.can('update', 'Community')).toBe(false);
    expect(a.can('delete', 'Community')).toBe(false);
    expect(a.can('manage', 'Payment')).toBe(false);
    expect(a.can('manage', 'Member')).toBe(false);
  });

  it('member can create Post/Comment/Like and own Review; admin manages all social', () => {
    const m = abilityFor(base({
      communityRole: { communityId: C, role: 'member' },
      communityPermissions: toggles({ create_posts: true }),
    }));
    expect(m.can('create', 'Comment')).toBe(true);
    expect(m.can('create', 'Like')).toBe(true);
    expect(m.can('create', 'Review')).toBe(true);
    const a = abilityFor(base({ communityRole: { communityId: C, role: 'admin' } }));
    expect(a.can('manage', 'Review')).toBe(true);
    expect(a.can('manage', 'Invitation')).toBe(true);
  });
});
