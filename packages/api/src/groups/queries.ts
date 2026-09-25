import { useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
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

export const useGroupRanking = (seasonId: string, since?: string) => {
  const db = useDb();
  return useQuery({
    queryKey: [...qk.groupRanking(seasonId), since ?? 'all'],
    enabled: !!seasonId,
    queryFn: async () => {
      // profiles is reachable via user_id but generated types key it to auth tables, so cast the embed.
      const { data, error } = await db
        .from('group_event_results')
        .select('user_id, ranking_points, event_id, events(starts_at), profiles(id, full_name, avatar_url)')
        .eq('group_season_id', seasonId)
        .returns<
          {
            user_id: string;
            ranking_points: number;
            event_id: string;
            events: { starts_at: string } | null;
            profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
          }[]
        >();
      if (error) throw error;
      const all = data ?? [];
      const rows = since
        ? all.filter((r) => r.events?.starts_at != null && r.events.starts_at >= since)
        : all;
      // Aggregate per user: sum points, count distinct events.
      const byUser = new Map<
        string,
        { name: string | null; avatarUrl: string | null; points: number; events: Set<string> }
      >();
      for (const r of rows) {
        const cur = byUser.get(r.user_id) ?? {
          name: r.profiles?.full_name ?? null,
          avatarUrl: r.profiles?.avatar_url ?? null,
          points: 0,
          events: new Set<string>(),
        };
        cur.points += r.ranking_points;
        cur.events.add(r.event_id);
        byUser.set(r.user_id, cur);
      }
      return [...byUser.entries()]
        .map(([userId, v]) => ({
          userId,
          name: v.name,
          avatarUrl: v.avatarUrl,
          points: v.points,
          eventsPlayed: v.events.size,
        }))
        .sort((a, b) => b.points - a.points)
        .map((row, i) => ({ ...row, rank: i + 1 }));
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
