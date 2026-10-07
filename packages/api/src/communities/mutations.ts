import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb, mapPgError } from '../client';
import { inviteAll, type InviteOutcome } from '../invitations';
import { qk } from '../query-keys';
import type { CreateCommunityInput, LocationPoint } from '../schemas';

// ---------------------------------------------------------------------------
// RPC mutations
// ---------------------------------------------------------------------------

// The create RPC also requires a country; the validation schema omits it, so it
// is threaded through alongside the validated input.
export const useCreateCommunity = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCommunityInput & { country: string }) => {
      const { data, error } = await db.rpc('create_community_with_personal_tenant', {
        p_name: input.name,
        p_type: input.type,
        p_country: input.country,
        p_privacy: input.privacy,
        p_description: input.description,
        p_location: input.location,
        p_thumbnail_path: input.thumbnailPath,
        p_cover_image_path: input.coverImagePath,
        p_cancellation_rules_enabled: input.rules.enabled,
        p_cancellation_rules_text: input.rules.text,
        // Sent only with a point: PostgREST resolves a function by its argument NAMES, so naming
        // p_location_lat against a database without migration 0128 (the E2E stack before it is
        // applied, or hosted before the paste) would fail every create, point or not.
        ...(input.locationPoint
          ? { p_location_lat: input.locationPoint.lat, p_location_lng: input.locationPoint.lng }
          : {}),
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.communities });
      qc.invalidateQueries({ queryKey: qk.canCreate });
    },
  });
};

/**
 * Write a community's location — label and point together (migration 0128, D2).
 *
 * `communities.location_point` is a PostGIS geography, so it never rides in a plain `communities`
 * UPDATE: `set_community_location` builds the point server-side and overwrites label AND point as a
 * pair, which keeps a new label from sitting on an old place's coordinates. A null point clears the
 * coordinates and keeps the label. Admin-only (`forbidden` otherwise).
 */
export const useSetCommunityLocation = (communityId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (place: { location: string | null; point: LocationPoint | null }) => {
      const { error } = await db.rpc('set_community_location', {
        p_community_id: communityId,
        p_lat: place.point?.lat ?? null,
        p_lng: place.point?.lng ?? null,
        p_location: place.location,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.community(communityId) });
      qc.invalidateQueries({ queryKey: qk.communities });
      // Distance ranks the community and group rails.
      qc.invalidateQueries({ queryKey: ['explore'] });
    },
  });
};

export const useJoinCommunity = (communityId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ack: boolean) => {
      const { data, error } = await db.rpc('join_community', {
        p_community_id: communityId,
        p_ack: ack,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data as 'joined' | 'requested';
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.communities });
      qc.invalidateQueries({ queryKey: qk.community(communityId) });
      qc.invalidateQueries({ queryKey: qk.standing(communityId) });
    },
  });
};

// UX-COMM-04: the action reads "Request to join", becomes "Requested" once tapped, and tapping
// again cancels. The RPC takes the community rather than the request id — the preview already
// knows which community it is showing, and (community_id, user_id) is unique.
export const useCancelJoinRequest = (communityId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc('cancel_join_request', { p_community_id: communityId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.communities });
      qc.invalidateQueries({ queryKey: qk.community(communityId) });
      qc.invalidateQueries({ queryKey: qk.requests(communityId) });
      qc.invalidateQueries({ queryKey: qk.standing(communityId) });
    },
  });
};

export const useAcceptJoinRequest = (communityId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await db.rpc('accept_join_request', { p_request_id: requestId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.requests(communityId) });
      qc.invalidateQueries({ queryKey: qk.members(communityId) });
    },
  });
};

export const useDeclineJoinRequest = (communityId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await db.rpc('decline_join_request', { p_request_id: requestId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.requests(communityId) });
      qc.invalidateQueries({ queryKey: qk.members(communityId) });
    },
  });
};

// invite_to_community refuses the WHOLE list when any one invitee is blocked either way (0141),
// so the list goes through inviteAll: one call as before, and only on 'blocked' one call per
// person, so everybody else is still invited. Resolves with who was invited and who was refused;
// rejects 'blocked' only when nobody could be — a one-person call fails exactly as before.
export const useInviteMembers = (communityId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { inviteeIds?: string[]; groupIds?: string[] }): Promise<InviteOutcome> =>
      inviteAll(input.inviteeIds ?? [], async (inviteeIds) => {
        const { error } = await db.rpc('invite_to_community', {
          p_community_id: communityId,
          p_invitee_ids: inviteeIds,
          p_group_ids: input.groupIds ?? [],
        });
        if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      }),
    // Settled, not success: the one-by-one fallback can invite some people and then fail on a later
    // call, and the invitations it did send are real.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.members(communityId) });
    },
  });
};

// `ack` is the rules toggle of UX-COMM-05, which applies to private communities as much as to the
// other two. It is optional so the notification CTA (which passes the invitation id alone) keeps
// working; the RPC refuses the join when the community has rules and the acceptance is missing.
export const useAcceptInvitation = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: string | { invitationId: string; communityId?: string; ack?: boolean }) => {
      const { invitationId, ack } = typeof input === 'string' ? { invitationId: input, ack: false } : input;
      const { error } = await db.rpc('accept_invitation', {
        p_invitation_id: invitationId,
        p_ack: ack ?? false,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    // `communityId` is optional because the notification path knows only the invitation id.
    // When the preview passes it, the standing query behind the action is refreshed too —
    // otherwise the screen would still read 'invited' after the accept resolved.
    onSuccess: (_data, input) => {
      const communityId = typeof input === 'string' ? undefined : input.communityId;
      qc.invalidateQueries({ queryKey: qk.communities });
      if (communityId) {
        qc.invalidateQueries({ queryKey: qk.standing(communityId) });
        qc.invalidateQueries({ queryKey: qk.members(communityId) });
      }
    },
  });
};

// UX-COMM-04: Decline sits beside Accept on a private invitation, and dismisses it.
export const useDeclineInvitation = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: string | { invitationId: string; communityId?: string }) => {
      const invitationId = typeof input === 'string' ? input : input.invitationId;
      const { error } = await db.rpc('decline_invitation', { p_invitation_id: invitationId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: (_data, input) => {
      const communityId = typeof input === 'string' ? undefined : input.communityId;
      qc.invalidateQueries({ queryKey: qk.communities });
      qc.invalidateQueries({ queryKey: qk.notifications });
      if (communityId) qc.invalidateQueries({ queryKey: qk.standing(communityId) });
    },
  });
};

export const useLeaveCommunity = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (communityId: string) => {
      const { error } = await db.rpc('leave_community', { p_community_id: communityId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: (_data, communityId) => {
      qc.invalidateQueries({ queryKey: qk.communities });
      qc.invalidateQueries({ queryKey: qk.community(communityId) });
      qc.invalidateQueries({ queryKey: qk.members(communityId) });
    },
  });
};

export const useArchiveCommunity = (communityId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (archive: boolean) => {
      const { data, error } = await db.rpc('archive_community', {
        p_community_id: communityId,
        p_archive: archive,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.communities });
      qc.invalidateQueries({ queryKey: qk.community(communityId) });
    },
  });
};

export const useRemoveMember = (communityId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await db.rpc('remove_member', {
        p_community_id: communityId,
        p_user_id: userId,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.members(communityId) });
    },
  });
};

// ---------------------------------------------------------------------------
// Direct (RLS-gated) writes
// ---------------------------------------------------------------------------

export const useMakeAdmin = (communityId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      // co-organizer cap trigger can fire (P0001) -> mapPgError surfaces a code.
      const { error } = await db
        .from('community_members')
        .update({ role: 'admin' })
        .eq('community_id', communityId)
        .eq('user_id', userId);
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.members(communityId) });
    },
  });
};

export const useRemoveAdmin = (communityId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await db
        .from('community_members')
        .update({ role: 'member' })
        .eq('community_id', communityId)
        .eq('user_id', userId);
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.members(communityId) });
    },
  });
};

export const useUpsertReview = (communityId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { rating: number; body?: string }) => {
      const { error } = await db.rpc('upsert_community_review', {
        p_community_id: communityId,
        p_rating: input.rating,
        p_body: input.body ?? null,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.reviews(communityId) });
      qc.invalidateQueries({ queryKey: qk.canReview(communityId) });
    },
  });
};

export const useCreatePost = (communityId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  const uid = useSession().session?.user.id;
  return useMutation({
    mutationFn: async (input: { body: string; imagePath?: string }) => {
      const { error } = await db.from('community_posts').insert({
        community_id: communityId,
        author_id: uid!,
        kind: 'user',
        body: input.body,
        image_path: input.imagePath ?? null,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.posts(communityId) });
    },
  });
};

type PostRow = {
  id: string;
  likes?: { count: number }[];
  mine?: { user_id: string }[];
};

export const useToggleLike = (communityId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  const uid = useSession().session?.user.id;
  return useMutation({
    mutationFn: async (input: { postId: string; liked: boolean }) => {
      if (input.liked) {
        // currently liked -> unlike
        const { error } = await db
          .from('post_likes')
          .delete()
          .eq('post_id', input.postId)
          .eq('user_id', uid!);
        if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      } else {
        const { error } = await db
          .from('post_likes')
          .insert({ post_id: input.postId, user_id: uid! });
        if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      }
    },
    onMutate: async (input) => {
      const key = qk.posts(communityId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<PostRow[]>(key);
      qc.setQueryData<PostRow[]>(key, (old) =>
        (old ?? []).map((p) => {
          if (p.id !== input.postId) return p;
          const likeCount = p.likes?.[0]?.count ?? 0;
          return {
            ...p,
            likes: [{ count: input.liked ? Math.max(0, likeCount - 1) : likeCount + 1 }],
            mine: input.liked ? [] : [{ user_id: uid ?? '' }],
          };
        }),
      );
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.posts(communityId), ctx.previous);
    },
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({ queryKey: qk.posts(communityId) });
      qc.invalidateQueries({ queryKey: qk.post(input.postId) }); // keep the detail screen's like in sync
    },
  });
};

export const useAddComment = () => {
  const db = useDb();
  const qc = useQueryClient();
  const uid = useSession().session?.user.id;
  return useMutation({
    mutationFn: async (input: { postId: string; communityId: string; body: string }) => {
      const { error } = await db.from('post_comments').insert({
        post_id: input.postId,
        author_id: uid!,
        body: input.body,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: qk.post(input.postId) });
      qc.invalidateQueries({ queryKey: qk.comments(input.postId) }); // refresh the comment list, not just counts
      qc.invalidateQueries({ queryKey: qk.posts(input.communityId) });
    },
  });
};

export const useSetDefaultCommunity = () => {
  const db = useDb();
  const qc = useQueryClient();
  const uid = useSession().session?.user.id;
  return useMutation({
    mutationFn: async (communityId: string) => {
      const { error } = await db
        .from('user_default_community')
        .upsert({ user_id: uid!, community_id: communityId }, { onConflict: 'user_id' });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.defaultCommunity });
    },
  });
};

export const useUpdateCommunity = (communityId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      patch: Partial<{
        name: string;
        description: string | null;
        location: string | null;
        type: string;
        privacy: string;
        thumbnail_path: string | null;
        cover_image_path: string | null;
        cancellation_rules_enabled: boolean;
        cancellation_rules_text: string | null;
      }>,
    ) => {
      const { error } = await db.from('communities').update(patch).eq('id', communityId);
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.community(communityId) });
    },
  });
};

export const useUpdatePermissions = (communityId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      // The five toggles of UX-COMM-17. create_groups and create_events were added in
      // migration 0098, reversing 0012's "these are admin-only, never columns" rule.
      patch: Partial<{
        invite_members: boolean;
        approve_join_requests: boolean;
        create_posts: boolean;
        create_groups: boolean;
        create_events: boolean;
      }>,
    ) => {
      const { error } = await db
        .from('community_permissions')
        .update(patch)
        .eq('community_id', communityId);
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.permissions(communityId) });
    },
  });
};
