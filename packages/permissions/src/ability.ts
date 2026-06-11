import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import type { Action, Subject } from './subjects';
import type { AuthContext } from './context';

export type AppAbility = MongoAbility<[Action, Subject]>;

export function abilityFor(ctx: AuthContext): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  // 1) Platform super-admin short-circuit.
  if (ctx.tenantRoles.some((t) => t.role === 'super_admin')) {
    can('manage', 'all');
    return build();
  }

  const cr = ctx.communityRole;
  if (cr) {
    const scope = { community_id: cr.communityId } as const;

    if (cr.role === 'owner') {
      can('manage', 'all', scope);
    } else if (cr.role === 'admin') {
      for (const s of ['Group', 'Event', 'Post', 'Member', 'JoinRequest', 'Broadcast', 'Review', 'Comment', 'Like', 'Invitation'] as Subject[]) {
        can('manage', s, scope);
      }
      can('read', 'Analytics', scope);
      can(['read', 'update'], 'Community', scope);
      cannot('delete', 'Community', scope);
      cannot('manage', 'Payment', scope);
    } else {
      for (const s of ['Community', 'Group', 'Event', 'Post', 'Member'] as Subject[]) {
        can('read', s, scope);
      }
      for (const s of ['Review', 'Comment', 'Like'] as Subject[]) can('read', s, scope);
      can('create', 'Comment', scope);
      can('create', 'Like', scope);
      can(['create', 'update'], 'Review', scope);
      const p = ctx.communityPermissions;
      if (p?.invite_members) can('create', 'Member', scope);
      if (p?.approve_join_requests) can('update', 'JoinRequest', scope);
      if (p?.create_posts) can('create', 'Post', scope);
    }
  }

  return build();
}
