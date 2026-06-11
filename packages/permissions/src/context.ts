export type TenantRole =
  | 'member' | 'coach' | 'staff' | 'community_owner' | 'club_owner' | 'super_admin';
export type CommunityRole = 'owner' | 'admin' | 'member';

export interface CommunityPermissionToggles {
  invite_members: boolean;
  approve_join_requests: boolean;
  create_posts: boolean;
}

export interface AuthContext {
  userId: string;
  tenantRoles: { tenantId: string; role: TenantRole }[];
  communityRole?: { communityId: string; role: CommunityRole };
  communityPermissions?: CommunityPermissionToggles;
}
