import { useQuery } from '@tanstack/react-query';
import type { TypedClient } from '@padel/db';
import { abilityFor, type AuthContext, type TenantRole, type CommunityRole } from '@padel/permissions';
import { useDb } from './client';
import { useSession } from '@padel/auth';

export function buildAuthContext(
  userId: string,
  tenantRows: { tenant_id: string; role: TenantRole }[],
  communityRole: { community_id: string; role: CommunityRole } | null,
  perms: { invite_members: boolean; approve_join_requests: boolean; create_posts: boolean } | null,
): AuthContext {
  return {
    userId,
    tenantRoles: tenantRows.map((r) => ({ tenantId: r.tenant_id, role: r.role })),
    communityRole: communityRole ? { communityId: communityRole.community_id, role: communityRole.role } : undefined,
    communityPermissions: perms ?? undefined,
  };
}

/** Resolve the live AuthContext for a community and return a memoized CASL ability. */
export function useAbility(communityId: string | undefined) {
  const db: TypedClient = useDb();
  const userId = useSession().session?.user.id;
  return useQuery({
    queryKey: ['ability', communityId, userId],
    enabled: !!userId,
    queryFn: async () => {
      const [tenants, role, perms] = await Promise.all([
        db.from('tenant_memberships').select('tenant_id, role').eq('user_id', userId!),
        communityId
          ? db.from('community_members').select('community_id, role').eq('community_id', communityId).eq('user_id', userId!).maybeSingle()
          : Promise.resolve({ data: null }),
        communityId
          ? db.from('community_permissions').select('invite_members, approve_join_requests, create_posts').eq('community_id', communityId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return abilityFor(buildAuthContext(userId!, (tenants.data ?? []) as never, (role as { data: never }).data, (perms as { data: never }).data));
    },
  });
}
