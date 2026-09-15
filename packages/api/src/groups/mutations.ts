import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb, mapPgError } from '../client';
import { qk } from '../query-keys';
import type { CreateGroupInput } from '../schemas';

// ---------------------------------------------------------------------------
// RPC mutations
// ---------------------------------------------------------------------------

export const useCreateGroup = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateGroupInput) => {
      const { data, error } = await db.rpc('create_group', {
        p_community_id: input.communityId,
        p_name: input.name,
        p_description: input.description,
        p_is_private: input.isPrivate,
        p_thumbnail_path: input.thumbnailPath,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data;
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: qk.groups(input.communityId) });
      qc.invalidateQueries({ queryKey: qk.canCreateGroup(input.communityId) });
    },
  });
};

export const useUpdateGroup = (id: string, communityId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      patch: Partial<{
        name: string;
        description: string | null;
        is_private: boolean;
        thumbnail_path: string | null;
      }>,
    ) => {
      const { error } = await db.from('groups').update(patch).eq('id', id);
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.group(id) });
      qc.invalidateQueries({ queryKey: qk.groups(communityId) });
    },
  });
};

export const useJoinGroup = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    // `ack` carries the rules acceptance of UX-COMM-05: joining a public group is also entry into
    // its community, so a community with rules refuses the join until they are accepted.
    mutationFn: async (input: { groupId: string; communityId: string; ack?: boolean }) => {
      const { error } = await db.rpc('join_group', {
        p_group_id: input.groupId,
        p_ack: input.ack ?? false,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: qk.group(input.groupId) });
      qc.invalidateQueries({ queryKey: qk.groupMembers(input.groupId) });
      qc.invalidateQueries({ queryKey: qk.communities });
      qc.invalidateQueries({ queryKey: qk.members(input.communityId) });
    },
  });
};

export const useLeaveGroup = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { groupId: string; communityId: string }) => {
      const { error } = await db.rpc('leave_group', { p_group_id: input.groupId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: qk.group(input.groupId) });
      qc.invalidateQueries({ queryKey: qk.groupMembers(input.groupId) });
      qc.invalidateQueries({ queryKey: qk.communities });
      qc.invalidateQueries({ queryKey: qk.members(input.communityId) });
    },
  });
};

export const useInviteToGroup = (id: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteeId: string) => {
      const { error } = await db.rpc('invite_to_group', {
        p_group_id: id,
        p_invitee_id: inviteeId,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.groupInvitations(id) });
    },
  });
};

export const useAcceptGroupInvitation = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { groupId: string; communityId: string; ack?: boolean }) => {
      const { error } = await db.rpc('accept_group_invitation', {
        p_group_id: input.groupId,
        p_ack: input.ack ?? false,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: qk.group(input.groupId) });
      qc.invalidateQueries({ queryKey: qk.groupMembers(input.groupId) });
      qc.invalidateQueries({ queryKey: qk.communities });
      qc.invalidateQueries({ queryKey: qk.members(input.communityId) });
    },
  });
};

export const useStartNewSeason = (id: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc('start_new_season', { p_group_id: id });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.groupSeasons(id) });
      qc.invalidateQueries({ queryKey: qk.group(id) });
    },
  });
};

export const useArchiveGroup = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { groupId: string; communityId: string }) => {
      const { error } = await db.rpc('archive_group', { p_group_id: input.groupId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: qk.group(input.groupId) });
      qc.invalidateQueries({ queryKey: qk.groups(input.communityId) });
      qc.invalidateQueries({ queryKey: qk.canCreateGroup(input.communityId) });
    },
  });
};

export const useUnarchiveGroup = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { groupId: string; communityId: string }) => {
      const { error } = await db.rpc('unarchive_group', { p_group_id: input.groupId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: qk.group(input.groupId) });
      qc.invalidateQueries({ queryKey: qk.groups(input.communityId) });
      qc.invalidateQueries({ queryKey: qk.canCreateGroup(input.communityId) });
    },
  });
};

export const useAddGroupAdmins = (groupId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userIds: string[]) => {
      const { error } = await db.rpc('add_group_admins', {
        p_group_id: groupId,
        p_user_ids: userIds,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.groupMembers(groupId) });
      qc.invalidateQueries({ queryKey: qk.myGroups });
    },
  });
};

// ---------------------------------------------------------------------------
// Direct (RLS-gated) writes
// ---------------------------------------------------------------------------

export const useRemoveGroupMember = (id: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await db
        .from('group_members')
        .delete()
        .eq('group_id', id)
        .eq('user_id', userId);
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.groupMembers(id) });
    },
  });
};
