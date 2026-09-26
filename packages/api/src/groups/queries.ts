import { useQueries, useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { useCommunities } from '../communities/queries';
import { qk } from '../query-keys';

export const useCanCreateGroup = (communityId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.canCreateGroup(communityId),
    queryFn: async () => {
      const { data, error } = await db.rpc('can_create_group', { p_community_id: communityId });
      if (error) throw error;
      return data ?? false;
    },
  });
};

export const useCommunityGroups = (communityId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.groups(communityId),
    queryFn: async () => {
      const { data, error } = await db
        .from('groups')
        .select('*')
        .eq('community_id', communityId)
        .is('archived_at', null)
        .order('is_general', { ascending: false })
        .order('name');
      if (error) throw error;
      return data;
    },
  });
};

/**
 * The community's ARCHIVED groups, for Manage Groups (UX-COMM-18) — the only
 * screen in the app where they are visible.
 *
 * A separate hook rather than a flag on `useCommunityGroups`: every other caller
 * of that one wants live groups and would now have to opt out of archived ones,
 * which is the kind of default that goes wrong silently. Keeping the archived
 * read explicit also keeps its own cache entry, so archiving invalidates both
 * lists and the group moves from one section to the other in a single pass.
 */
export const useArchivedCommunityGroups = (communityId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.archivedGroups(communityId),
    enabled: !!communityId,
    queryFn: async () => {
      const { data, error } = await db
        .from('groups')
        .select('*')
        .eq('community_id', communityId)
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

export const useMyGroupMemberships = (communityId: string) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: ['community', communityId, 'my-group-memberships'] as const,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db
        .from('group_members')
        .select(
          'group_id, groups!inner(id, community_id, name, is_private, is_general, archived_at)',
        )
        .eq('user_id', uid!)
        .eq('groups.community_id', communityId)
        .returns<
          {
            group_id: string;
            groups: {
              id: string;
              community_id: string;
              name: string;
              is_private: boolean;
              is_general: boolean;
              archived_at: string | null;
            } | null;
          }[]
        >();
      if (error) throw error;
      return data ?? [];
    },
  });
};

// Callers may not have the id yet — screens that derive it from another query
// still in flight. Without the guard a falsy id goes out as `id=eq.` and the
// round-trip is doomed, so gate the fetch instead of querying a placeholder.
export const useGroup = (id: string | null | undefined) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.group(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.from('groups').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
  });
};

export const useGroupMembers = (id: string | null | undefined) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.groupMembers(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      // profiles is reachable via the user_id FK at the DB level but the generated
      // types key group_members.user_id to auth tables, so the embed is cast.
      const { data, error } = await db
        .from('group_members')
        .select('user_id, created_at, profiles(id, full_name, avatar_url)')
        .eq('group_id', id!)
        .returns<
          {
            user_id: string;
            created_at: string;
            profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
          }[]
        >();
      if (error) throw error;
      return data;
    },
  });
};

export type MyGroup = {
  group_id: string;
  name: string;
  community_id: string;
  community_name: string;
  member_count: number;
  is_managing: boolean;
  description: string | null;
  thumbnail_path: string | null;
  is_private: boolean;
  archived_at: string | null;
};

// `includeArchived` adds the archived groups the caller administers (UX-GRP-03: admins keep them
// in Your Groups with an "Archived" tag; members never see them). Both lists share the my-groups
// prefix, so invalidating qk.myGroups refreshes either.
export const useMyGroups = ({ includeArchived = false }: { includeArchived?: boolean } = {}) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: includeArchived ? qk.myGroupsWithArchived : qk.myGroups,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db.rpc('my_groups', { p_include_archived: includeArchived });
      if (error) throw error;
      return (data ?? []) as MyGroup[];
    },
  });
};

/**
 * `groups` narrowed to the communities in `allowed` and, when given, to one community. Pure, so
 * the filtering rule is tested apart from the RPCs that feed it.
 */
export function pickEventCreatableGroups(
  groups: MyGroup[],
  allowed: ReadonlySet<string>,
  communityId?: string | null,
): MyGroup[] {
  return groups.filter(
    (g) => allowed.has(g.community_id) && (!communityId || g.community_id === communityId),
  );
}

/**
 * The groups the caller may create an event in, across every community (UX-CEVT-02, B14): the
 * create-event wizard's Group step. Before this, the step read `useCommunityGroups`, so from
 * Home (no community) it listed nothing, and from a community it listed every group whether or
 * not you could create an event there.
 *
 * Built from `my_groups` (thumbnail, community, member count) and `can_create_event`, which is
 * per COMMUNITY underneath (`may_create_event`: admin, or member with the create-events
 * permission) — so it is asked once per community, through any one of its groups, not once per
 * group. No new RPC: both already exist and are granted to `authenticated`.
 *
 * Only groups you are a MEMBER of: a community admin who is not in a group does not see it
 * here, although `create_event` would accept it.
 */
export const useEventCreatableGroups = (communityId?: string | null) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.eventCreatableGroups(communityId ?? ''),
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db.rpc('my_groups', { p_include_archived: false });
      if (error) throw error;
      const groups = ((data ?? []) as MyGroup[]).filter(
        (g) => !communityId || g.community_id === communityId,
      );
      // One representative group per community.
      const probe = new Map<string, string>();
      for (const g of groups) if (!probe.has(g.community_id)) probe.set(g.community_id, g.group_id);
      // One community's check failing must not hide every other community's groups: a failed
      // check counts as "not creatable". Only when EVERY check fails is that an error, not an
      // empty list.
      const checks = await Promise.allSettled(
        [...probe].map(async ([cid, gid]) => {
          const res = await db.rpc('can_create_event', { p_group_id: gid });
          if (res.error) throw res.error;
          return [cid, res.data === true] as const;
        }),
      );
      const firstFailure = checks.find((c) => c.status === 'rejected');
      if (checks.length > 0 && firstFailure && checks.every((c) => c.status === 'rejected')) {
        throw (firstFailure as PromiseRejectedResult).reason;
      }
      const allowed = new Set(
        checks.flatMap((c) => (c.status === 'fulfilled' && c.value[1] ? [c.value[0]] : [])),
      );
      return pickEventCreatableGroups(groups, allowed, communityId);
    },
  });
};

export type GroupMemberListRow = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  /** false = left the group; shown greyscale with a "No longer in group" tag (UX-GRP-07/15). */
  is_member: boolean;
  joined_at: string | null;
  left_at: string | null;
};

// Current members first, then departed ones (migration 0108). Readable by group members, its
// admins, and community members of a public group — the preview's avatars (UX-GRP-02).
export const useGroupMemberList = (id: string | null | undefined) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.groupMemberList(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.rpc('group_member_list', { p_group_id: id! });
      if (error) throw error;
      return (data ?? []) as GroupMemberListRow[];
    },
  });
};

export const useGroupSeasons = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.groupSeasons(id),
    queryFn: async () => {
      const { data, error } = await db
        .from('group_seasons')
        .select('*')
        .eq('group_id', id)
        .order('season_number', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

export type GroupRankingRow = {
  rank: number;
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  points: number;
  /** Matches won / lost across the season's events (migration 0109). */
  wins: number;
  losses: number;
  eventsPlayed: number;
  /** false = left the group; shown greyscale, still ranked (decision 2). */
  isMember: boolean;
  /** When the season's results last changed — "Last update {DATE}" (UX-GRP-04/06). */
  lastUpdated: string | null;
};

// Aggregated server-side by group_ranking (migration 0109); `since` filters by event start.
export const useGroupRanking = (seasonId: string, since?: string) => {
  const db = useDb();
  return useQuery({
    queryKey: [...qk.groupRanking(seasonId), since ?? 'all'],
    enabled: !!seasonId,
    queryFn: async (): Promise<GroupRankingRow[]> => {
      const { data, error } = await db.rpc('group_ranking', {
        p_season_id: seasonId,
        ...(since ? { p_since: since } : {}),
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        rank: r.rank,
        userId: r.user_id,
        name: r.full_name,
        avatarUrl: r.avatar_url,
        points: r.points,
        wins: r.wins,
        losses: r.losses,
        eventsPlayed: r.events_played,
        isMember: r.is_member,
        lastUpdated: r.last_updated,
      }));
    },
  });
};

export const useGroupInvitations = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.groupInvitations(id),
    queryFn: async () => {
      // invitee_id and inviter_id both FK profiles, so the embed is disambiguated
      // by the constraint name (migration 0034).
      const { data, error } = await db
        .from('group_invitations')
        .select('*, invitee:profiles!group_invitations_invitee_id_fkey(id, full_name, avatar_url)')
        .eq('group_id', id)
        .eq('status', 'pending')
        .returns<
          {
            id: string;
            group_id: string;
            invitee_id: string;
            inviter_id: string;
            status: string;
            created_at: string;
            responded_at: string | null;
            invitee: { id: string; full_name: string | null; avatar_url: string | null } | null;
          }[]
        >();
      if (error) throw error;
      return data;
    },
  });
};

// The server's own answer to "may I invite into this group" (0107's may_invite_to_group): its
// admins, and its members when the community's invite_members toggle is on. Gates every
// "+ Invite members" (UX-GRP-02/04/07) so nobody is offered an action that answers `forbidden`.
export const useCanInviteToGroup = (groupId: string | null | undefined) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.canInviteToGroup(groupId ?? ''),
    enabled: !!groupId && !!uid,
    queryFn: async () => {
      const { data, error } = await db.rpc('may_invite_to_group', { g: groupId!, u: uid! });
      if (error) throw error;
      return data ?? false;
    },
  });
};

export type GroupInvitationPreview = {
  group_id: string;
  name: string;
  description: string | null;
  thumbnail_path: string | null;
  is_private: boolean;
  created_at: string;
  member_count: number;
  members: { id: string; full_name: string | null; avatar_url: string | null }[];
  community_id: string;
  community_name: string;
  community_thumb: string | null;
  inviter_id: string | null;
  inviter_name: string | null;
  inviter_avatar: string | null;
};

// What a PENDING invitation shows of its group (migration 0110, UX-GRP-02): identity and context,
// never content. null when there is no pending invitation — accepted, declined, or never sent.
export const useGroupInvitationPreview = (groupId: string | null | undefined) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.groupInvitationPreview(groupId ?? ''),
    enabled: !!groupId,
    queryFn: async (): Promise<GroupInvitationPreview | null> => {
      const { data, error } = await db.rpc('group_invitation_preview', { p_group_id: groupId! });
      if (error) throw error;
      const row = data?.[0];
      return row ? ({ ...row, members: (row.members ?? []) as GroupInvitationPreview['members'] } as GroupInvitationPreview) : null;
    },
  });
};

// Permission only — admin, or a member the community lets create groups (0098's may_create_group).
// Create actions show on this, not on can_create_group: a community at its plan's group limit
// still offers "Create group", and the create answers with the upgrade prompt instead of the
// button silently not being there (decision 6).
export const useMayCreateGroup = (communityId: string | null | undefined) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.mayCreateGroup(communityId ?? ''),
    enabled: !!communityId,
    queryFn: async () => {
      const { data, error } = await db.rpc('may_create_group', { c: communityId! });
      if (error) throw error;
      return data ?? false;
    },
  });
};

/**
 * The communities where the user may create a group (UX-GRP-01): the targets of Your Groups'
 * "Create group" and of its community selector. Admin rows qualify outright; member rows ask
 * may_create_group, since the community's create_groups toggle decides. Archived communities
 * never qualify. `isLoading` stays true until every answer is in, so the create action does not
 * flicker in and out.
 */
export const useCreatableCommunities = () => {
  const db = useDb();
  const { data: memberships, isLoading: loadingMemberships } = useCommunities();
  const active = (memberships ?? []).filter((m) => !m.community.archived_at);
  const answers = useQueries({
    queries: active.map((m) => ({
      queryKey: qk.mayCreateGroup(m.community.id),
      queryFn: async () => {
        if (m.role === 'admin') return true;
        const { data, error } = await db.rpc('may_create_group', { c: m.community.id });
        if (error) throw error;
        return data ?? false;
      },
    })),
  });
  return {
    communities: active.filter((_, i) => answers[i]?.data === true).map((m) => m.community),
    isLoading: loadingMemberships || answers.some((a) => a.isLoading),
  };
};
