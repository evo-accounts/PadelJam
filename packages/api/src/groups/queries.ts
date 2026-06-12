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

export const useGroup = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.group(id),
    queryFn: async () => {
      const { data, error } = await db.from('groups').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
  });
};

export const useGroupMembers = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.groupMembers(id),
    queryFn: async () => {
      // profiles is reachable via the user_id FK at the DB level but the generated
      // types key group_members.user_id to auth tables, so the embed is cast.
      const { data, error } = await db
        .from('group_members')
        .select('user_id, created_at, profiles(id, full_name, avatar_url)')
        .eq('group_id', id)
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
