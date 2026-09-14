export type TenantRole =
  | 'member' | 'coach' | 'staff' | 'community_owner' | 'club_owner' | 'super_admin';
/** Two roles (UX-COMM audit, 2026-09-14). 'owner' was removed in migration 0098: every owner
 *  became an admin and there is no ownership to transfer. */
export type CommunityRole = 'admin' | 'member';

/** The five member toggles of UX-COMM-17. Admins are never constrained by them. */
export interface CommunityPermissionToggles {
  invite_members: boolean;
  approve_join_requests: boolean;
  create_posts: boolean;
  create_groups: boolean;
  create_events: boolean;
}

export interface AuthContext {
  userId: string;
  tenantRoles: { tenantId: string; role: TenantRole }[];
  communityRole?: { communityId: string; role: CommunityRole };
  communityPermissions?: CommunityPermissionToggles;
}
