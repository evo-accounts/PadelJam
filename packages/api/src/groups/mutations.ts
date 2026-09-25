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
      qc.invalidateQueries({ queryKey: qk.groupMemberList(input.groupId) });
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
      qc.invalidateQueries({ queryKey: qk.groupMemberList(input.groupId) });
      qc.invalidateQueries({ queryKey: qk.communities });
      qc.invalidateQueries({ queryKey: qk.members(input.communityId) });
      // The group leaves Your Groups too; without this it lingered there until a refetch.
      qc.invalidateQueries({ queryKey: qk.myGroups });
    },
  });
};

// 'ok' | 'sole_admin' | 'not_a_member' — leave_group's own checks, asked BEFORE the confirm sheet
// so the sole-admin case is a sheet that resolves it, never an error after confirming (UX-GRP-15).
export type LeaveGroupPreflight = 'ok' | 'sole_admin' | 'not_a_member';

export const useLeaveGroupPreflight = () => {
  const db = useDb();
  return useMutation({
    mutationFn: async (groupId: string): Promise<LeaveGroupPreflight> => {
      const { data, error } = await db.rpc('leave_group_preflight', { p_group_id: groupId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data as LeaveGroupPreflight;
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
      qc.invalidateQueries({ queryKey: qk.groupMemberList(input.groupId) });
      qc.invalidateQueries({ queryKey: qk.communities });
      qc.invalidateQueries({ queryKey: qk.members(input.communityId) });
    },
  });
};

export const useDeclineGroupInvitation = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await db.rpc('decline_group_invitation', { p_group_id: groupId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: (_data, groupId) => {
      qc.invalidateQueries({ queryKey: qk.group(groupId) });
      qc.invalidateQueries({ queryKey: qk.notifications });
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
      // Archiving MOVES a group between the two lists Manage Groups renders
      // (UX-COMM-18); without this it disappears from one and never arrives in
      // the other until the screen is left and re-entered.
      qc.invalidateQueries({ queryKey: qk.archivedGroups(input.communityId) });
      qc.invalidateQueries({ queryKey: qk.canCreateGroup(input.communityId) });
      // Your Groups keeps archived groups for admins (UX-GRP-03), so it moves them too.
      qc.invalidateQueries({ queryKey: qk.myGroups });
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
      // Archiving MOVES a group between the two lists Manage Groups renders
      // (UX-COMM-18); without this it disappears from one and never arrives in
      // the other until the screen is left and re-entered.
      qc.invalidateQueries({ queryKey: qk.archivedGroups(input.communityId) });
      qc.invalidateQueries({ queryKey: qk.canCreateGroup(input.communityId) });
      // Your Groups keeps archived groups for admins (UX-GRP-03), so it moves them too.
      qc.invalidateQueries({ queryKey: qk.myGroups });
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

// Was a direct DELETE on group_members; 0107 removed that policy (it also let members delete
// their own row past leave_group's guard), so removal goes through its RPC. Group only — the
// person stays in the community (UX-GRP-13).
export const useRemoveGroupMember = (id: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await db.rpc('remove_group_member', { p_group_id: id, p_user_id: userId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.groupMembers(id) });
      qc.invalidateQueries({ queryKey: qk.groupMemberList(id) });
    },
  });
};
