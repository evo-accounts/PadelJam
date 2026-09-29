import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb, mapPgError } from '../client';
import { qk } from '../query-keys';
import {
  buildCreateEventPayload,
  buildUpdateEventPayload,
  type BlastChannel,
  type BlastSendTo,
  type CreateEventInput,
  type EventType,
  type UpdateEventInput,
} from '../schemas';
import { buildAmericanoSchedule, type AmericanoRoster } from '../round-gen';

// Mirrors the generated `Json` scalar from @padel/db (not re-exported there).
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/**
 * Invalidate every My Events list.
 *
 * 'all' / 'organizing' / 'going' are three cache keys over one RPC, and which of
 * them a mutation touches depends on facts the mutation does not have to hand —
 * is the viewer this event's organizer, a confirmed participant, or both? The
 * hooks below therefore invalidate the set instead of guessing at a subset. That
 * is what useCancelEvent and useMaterializeOccurrence already did; useUpdateEvent
 * covered two of the three and useCreateEvent none at all, so creating an event
 * left an already-visited Events tab showing a list without it.
 */
function invalidateMyEvents(qc: ReturnType<typeof useQueryClient>) {
  // One prefix covers every tab ('all' | 'organizing' | 'going' | 'pending') with or without
  // past events (migration 0112).
  qc.invalidateQueries({ queryKey: qk.myEventsAll });
}

// ---------------------------------------------------------------------------
// Create / duplicate
// ---------------------------------------------------------------------------

export const useCreateEvent = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      const { data, error } = await db.rpc('create_event', {
        p_payload: buildCreateEventPayload(input) as Json,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data;
    },
    onSuccess: (_data, input) => {
      invalidateMyEvents(qc);
      if (input.groupId) {
        qc.invalidateQueries({ queryKey: qk.events(input.groupId) });
        qc.invalidateQueries({ queryKey: qk.canCreateEvent(input.groupId) });
      }
    },
  });
};

/** update_event's scope on a recurring event (migration 0123). */
export type UpdateEventScope = 'only_this' | 'this_and_upcoming';

export const useUpdateEvent = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      values: UpdateEventInput;
      groupId: string | null;
      /** A recurring event asks first (UX-MEVT-08/22). Omitted = 'only_this'. Migration 0123. */
      scope?: UpdateEventScope;
    }) => {
      const { error } = await db.rpc('update_event', {
        p_event_id: eventId,
        p_payload: buildUpdateEventPayload(input.values) as Json,
        p_scope: input.scope ?? 'only_this',
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: (_d, input) => {
      // 'this_and_upcoming' also rewrites the later occurrences (other event ids): refresh them all.
      if (input.scope === 'this_and_upcoming') qc.invalidateQueries({ queryKey: ['event'] });
      qc.invalidateQueries({ queryKey: qk.event(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventSeries(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventNextOccurrences(eventId) });
      invalidateMyEvents(qc);
      if (input.groupId) qc.invalidateQueries({ queryKey: qk.events(input.groupId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventCourts(eventId) });
    },
  });
};

export const useDuplicateEvent = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      eventId: string;
      groupId: string | null;
      overrides?: Record<string, unknown>;
    }) => {
      const { data, error } = await db.rpc('duplicate_event', {
        p_event_id: input.eventId,
        p_overrides: (input.overrides ?? {}) as Json,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data;
    },
    onSuccess: (_data, input) => {
      invalidateMyEvents(qc);
      if (input.groupId) {
        qc.invalidateQueries({ queryKey: qk.events(input.groupId) });
        qc.invalidateQueries({ queryKey: qk.canCreateEvent(input.groupId) });
      }
    },
  });
};

// ---------------------------------------------------------------------------
// Join / leave
// ---------------------------------------------------------------------------

export const useJoinEvent = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { eventId: string; groupId: string | null }) => {
      const { data, error } = await db.rpc('join_event', { p_event_id: input.eventId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      // The activity row is written server-side (migration 0122, trg_activity_on_participant).
      // 'confirmed' or 'waiting_list' — the caller shows "You are in" only for the former.
      return data;
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: qk.event(input.eventId) });
      qc.invalidateQueries({ queryKey: qk.eventParticipants(input.eventId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(input.eventId) });
      if (input.groupId) qc.invalidateQueries({ queryKey: qk.events(input.groupId) });
      invalidateMyEvents(qc);
    },
  });
};

export const useLeaveEvent = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { eventId: string; groupId: string | null }) => {
      const { error } = await db.rpc('leave_event', { p_event_id: input.eventId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: (_data, input) => {
      // leave_event withdraws the leaver's sent partner requests and closes the ones sent to them.
      qc.invalidateQueries({ queryKey: qk.incomingPartnerRequests });
      qc.invalidateQueries({ queryKey: qk.partnerRequestSummary });
      qc.invalidateQueries({ queryKey: qk.event(input.eventId) });
      qc.invalidateQueries({ queryKey: qk.eventParticipants(input.eventId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(input.eventId) });
      if (input.groupId) qc.invalidateQueries({ queryKey: qk.events(input.groupId) });
      invalidateMyEvents(qc);
    },
  });
};

export const useLeaveWaitingList = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc('leave_waiting_list', { p_event_id: eventId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.event(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
      invalidateMyEvents(qc);
    },
  });
};

// ---------------------------------------------------------------------------
// Partner selection (team / mixed events)
// ---------------------------------------------------------------------------

/**
 * "I need a partner" (UX-JEVT-11): marks the caller interested and asks each target (0112). An empty
 * list is "Let others invite me" — listed as looking, no request sent. Errors: already_joined
 * (paired or waiting), forbidden, event_closed.
 */
export const useRequestPartner = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targets: string[]) => {
      const { error } = await db.rpc('request_partner', {
        p_event_id: eventId,
        p_targets: targets,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    // The caller becomes 'interested' (a roster row, the event page's banner, the Going tab), so
    // this refreshes what a pairing does and not just the request lists. Returned, so the
    // mutation settles only once the lists are fresh: an Invited → withdraw tap right after needs
    // the new request's id.
    onSuccess: () => invalidatePairing(qc, eventId),
    onError: (e) => refetchCandidatesOnStale(qc, eventId, e),
  });
};

/**
 * Everything a pairing (or a waiting pair's claim) can change on one event. Resolves once the
 * active queries have refetched — return it from `onSuccess` so `mutateAsync` waits for it.
 */
function invalidatePairing(qc: ReturnType<typeof useQueryClient>, eventId: string): Promise<unknown> {
  invalidateMyEvents(qc);
  return Promise.all([
    qc.invalidateQueries({ queryKey: qk.partnerRequests(eventId) }),
    qc.invalidateQueries({ queryKey: qk.partnerCandidates(eventId) }),
    qc.invalidateQueries({ queryKey: qk.incomingPartnerRequests }),
    qc.invalidateQueries({ queryKey: qk.partnerRequestSummary }),
    qc.invalidateQueries({ queryKey: qk.eventTeams(eventId) }),
    qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) }),
    // choose_partner / accept_partner_request accept both players' pending invitations.
    qc.invalidateQueries({ queryKey: qk.eventInvitations(eventId) }),
    qc.invalidateQueries({ queryKey: qk.eventInvitedPlayers(eventId) }),
    qc.invalidateQueries({ queryKey: qk.event(eventId) }),
  ]);
}

/**
 * A pick that went stale under the caller — the partner paired or left (partner_unavailable), the
 * caller is already in (already_joined), or the request target stopped looking (request_stale):
 * refetch the candidate and request lists so the page stops offering it.
 */
function refetchCandidatesOnStale(qc: ReturnType<typeof useQueryClient>, eventId: string, e: unknown) {
  const code = e instanceof Error ? e.message : '';
  if (code === 'partner_unavailable' || code === 'already_joined' || code === 'request_stale') {
    qc.invalidateQueries({ queryKey: qk.partnerCandidates(eventId) });
    qc.invalidateQueries({ queryKey: qk.partnerRequests(eventId) });
  }
}

/**
 * A request that vanished under the caller (withdrawn, or closed by a pair forming) answers
 * `request_not_found`. Realtime cannot be relied on to have told us — filtered Postgres Changes
 * do not deliver DELETEs — so refetch the request lists before surfacing the error.
 */
function refetchRequestsOnStale(qc: ReturnType<typeof useQueryClient>, eventId: string, e: unknown) {
  const code = e instanceof Error ? e.message : '';
  if (code === 'request_not_found' || code === 'request_stale') {
    qc.invalidateQueries({ queryKey: qk.partnerRequests(eventId) });
    qc.invalidateQueries({ queryKey: qk.incomingPartnerRequests });
    qc.invalidateQueries({ queryKey: qk.partnerRequestSummary });
  }
}

/** Resolves to 'confirmed', or 'waiting_list' when the event has no room for the pair (or people
 *  are already waiting) and the pair queues together (migration 0112). */
export const useChoosePartner = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (partnerUser: string) => {
      const { data, error } = await db.rpc('choose_partner', {
        p_event_id: eventId,
        p_partner_user: partnerUser,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data as 'confirmed' | 'waiting_list';
    },
    onSuccess: () => invalidatePairing(qc, eventId),
    onError: (e) => refetchCandidatesOnStale(qc, eventId, e),
  });
};

/**
 * Pair with someone who is not on the app (UX-JEVT-10, migration 0113): a guest partner is created
 * for this event only — no account, no history, no ranking, not reusable. Same gates and outcome as
 * useChoosePartner: resolves to 'confirmed', or 'waiting_list' when the pair has to queue. Errors:
 * invalid_guest_name (empty or over 60 characters), already_joined, forbidden, event_closed.
 */
export const useChooseGuestPartner = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; gender?: 'male' | 'female' | null }) => {
      const { data, error } = await db.rpc('choose_guest_partner', {
        p_event_id: eventId,
        p_name: input.name,
        p_gender: input.gender ?? undefined,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data as 'confirmed' | 'waiting_list';
    },
    onSuccess: () => invalidatePairing(qc, eventId),
    onError: (e) => refetchCandidatesOnStale(qc, eventId, e),
  });
};

/** Resolves to 'confirmed' or 'waiting_list', as useChoosePartner. */
export const useAcceptPartnerRequest = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { data, error } = await db.rpc('accept_partner_request', { p_request_id: requestId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data as 'confirmed' | 'waiting_list';
    },
    onSuccess: () => invalidatePairing(qc, eventId),
    onError: (e) => refetchRequestsOnStale(qc, eventId, e),
  });
};

/**
 * Claim a freed spot from the waiting list — first come, first served (migration 0112). On a team
 * event the caller must be half of a waiting pair, and the pair takes two spots at once. Errors:
 * spot_taken, gender_full / gender_required (mixed), use_team_join (a lone waiter on a team event).
 */
export const useClaimWaitlistSpot = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc('claim_waitlist_spot', { p_event_id: eventId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data;
    },
    onSuccess: () => {
      invalidatePairing(qc, eventId);
      qc.invalidateQueries({ queryKey: qk.notifications });
      qc.invalidateQueries({ queryKey: qk.notificationsUnread });
    },
    onError: () => {
      // spot_taken & co: the roster moved under us.
      qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
    },
  });
};

export const useDeclinePartnerRequest = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await db.rpc('decline_partner_request', { p_request_id: requestId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.partnerRequests(eventId) });
      qc.invalidateQueries({ queryKey: qk.incomingPartnerRequests });
      qc.invalidateQueries({ queryKey: qk.partnerRequestSummary });
    },
    onError: (e) => refetchRequestsOnStale(qc, eventId, e),
  });
};

/** The requester takes back a pending request (0111, B5). The row is deleted, so the same
 *  person can be asked again later. */
export const useWithdrawPartnerRequest = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await db.rpc('withdraw_partner_request', { p_request_id: requestId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    // Returned: the Invite button must not reappear before the request list has dropped the row.
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.partnerRequests(eventId) }),
        qc.invalidateQueries({ queryKey: qk.partnerCandidates(eventId) }),
      ]),
    onError: (e) => refetchRequestsOnStale(qc, eventId, e),
  });
};

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export const useInviteToEvent = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    // Platform users only (0113): people without an account are guests, added with
    // add_manual_participant or the wizard's `guests`. Since 0122 (D12): a group event invites
    // its members only (not_group_member), a public group event none (invites_not_allowed), a
    // blocked player never (blocked); anyone already invited or playing is skipped.
    mutationFn: async (invitees: { invitee_id: string }[]) => {
      const { error } = await db.rpc('invite_to_event', {
        p_event_id: eventId,
        p_invitees: invitees,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventInvitations(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventInvitedPlayers(eventId) });
      qc.invalidateQueries({ queryKey: ['event', eventId, 'invite-candidates'] });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
    },
  });
};

export const useAcceptEventInvitation = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { eventId: string; groupId: string | null }) => {
      const { data, error } = await db.rpc('accept_event_invitation', { p_event_id: input.eventId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      // The participant status the acceptance produced ('confirmed', 'waiting_list', or
      // 'interested' on a team event).
      return data;
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: qk.event(input.eventId) });
      qc.invalidateQueries({ queryKey: qk.eventParticipants(input.eventId) });
      qc.invalidateQueries({ queryKey: qk.eventInvitations(input.eventId) });
      if (input.groupId) qc.invalidateQueries({ queryKey: qk.events(input.groupId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(input.eventId) });
      invalidateMyEvents(qc);
    },
  });
};

export const useDeclineEventInvitation = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc('decline_event_invitation', { p_event_id: eventId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventInvitations(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
      invalidateMyEvents(qc);
    },
  });
};

// ---------------------------------------------------------------------------
// Organizer roster management
// ---------------------------------------------------------------------------

export const useMarkConfirmed = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { participantId: string; targetName?: string }) => {
      const { error } = await db.rpc('organizer_mark_confirmed', {
        p_participant_id: input.participantId,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      // Confirming also accepts the player's pending invitation (0122), so the Invited list moves.
      qc.invalidateQueries({ queryKey: qk.event(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventInvitations(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventInvitedPlayers(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
    },
  });
};

/**
 * Confirm a pending invitee who has no participant row yet (organizer_confirm_invitee, 0122). On a
 * team event a team and slot are required: the placement is organizer_assign_to_team's, and the
 * player is confirmed once the pair is complete. Returns the participant id.
 */
export const useConfirmInvitee = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; teamNumber?: number; slot?: 'a' | 'b' }) => {
      const { data, error } = await db.rpc('organizer_confirm_invitee', {
        p_event_id: eventId,
        p_user_id: input.userId,
        p_team_number: input.teamNumber ?? null,
        p_slot: input.slot ?? null,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.event(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventInvitations(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventInvitedPlayers(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventTeams(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
    },
  });
};

/** A guest straight into a team slot (organizer_add_guest_to_team, 0122 / plan D7). */
export const useAddGuestToTeam = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { teamNumber: number; slot: 'a' | 'b'; name: string; gender?: string | null }) => {
      const { data, error } = await db.rpc('organizer_add_guest_to_team', {
        p_event_id: eventId,
        p_team_number: input.teamNumber,
        p_slot: input.slot,
        p_name: input.name,
        p_gender: input.gender ?? null,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.event(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventTeams(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
    },
  });
};

export const useRemoveParticipant = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { participantId: string; mode: string; targetName?: string }) => {
      const { error } = await db.rpc('organizer_remove_participant', {
        p_participant_id: input.participantId,
        p_mode: input.mode,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      // 'to_invited' reopens the player's invitation; 'from_event' deletes it and any team slot.
      qc.invalidateQueries({ queryKey: qk.event(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventInvitations(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventInvitedPlayers(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventTeams(eventId) });
      qc.invalidateQueries({ queryKey: ['event', eventId, 'invite-candidates'] });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
    },
  });
};

export const useAddManualParticipant = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; gender?: string }) => {
      const { data, error } = await db.rpc('add_manual_participant', {
        p_event_id: eventId,
        p_name: input.name,
        p_gender: input.gender,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.event(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
    },
  });
};

export const useMarkPaid = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { participantId: string; paid: boolean; targetName?: string }) => {
      const { error } = await db.rpc('mark_paid', {
        p_participant_id: input.participantId,
        p_paid: input.paid,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
    },
  });
};

export const useMarkAllPaid = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc('mark_all_paid', { p_event_id: eventId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
    },
  });
};

// ---------------------------------------------------------------------------
// Match engine
// ---------------------------------------------------------------------------

type EngineRosterRow = {
  participant_id: string;
  gender: string | null;
  team_id: string | null;
  team_number: number | null;
};

/**
 * The Team / Mixed Americano input, in the caller's seeding order (`orderedIds`, then anyone the
 * server lists that the caller did not). Team: each complete pair, by team number. Mixed: the men
 * and the women. start_event refuses a start the roster cannot pair (teams_incomplete,
 * mixed_unbalanced), and validates the schedule's pairs.
 */
export function engineRoster(
  specification: 'team' | 'mixed',
  orderedIds: string[],
  rows: EngineRosterRow[],
): AmericanoRoster {
  const pos = new Map(orderedIds.map((id, i) => [id, i]));
  const ordered = [...rows].sort(
    (a, b) =>
      (pos.get(a.participant_id) ?? Number.MAX_SAFE_INTEGER) -
      (pos.get(b.participant_id) ?? Number.MAX_SAFE_INTEGER),
  );
  if (specification === 'mixed') {
    return {
      specification,
      men: ordered.filter((r) => r.gender === 'male').map((r) => r.participant_id),
      women: ordered.filter((r) => r.gender === 'female').map((r) => r.participant_id),
    };
  }
  const byTeam = new Map<string, { n: number; ids: string[] }>();
  for (const r of ordered) {
    if (!r.team_id) continue;
    const t = byTeam.get(r.team_id) ?? { n: r.team_number ?? 0, ids: [] };
    t.ids.push(r.participant_id);
    byTeam.set(r.team_id, t);
  }
  const teams = [...byTeam.values()]
    .filter((t) => t.ids.length === 2)
    .sort((a, b) => a.n - b.n)
    .map((t) => [t.ids[0]!, t.ids[1]!] as [string, string]);
  return { specification, teams };
}

export const useStartEvent = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      eventType: EventType;
      /** The event's modality: Team keeps its pairs, Mixed pairs a man and a woman (0126). */
      specification?: string | null;
      confirmedParticipantIds: string[];
      numCourts: number;
    }) => {
      const args: { p_event_id: string; p_rounds?: Json } = { p_event_id: eventId };
      if (input.eventType === 'americano') {
        // Americano schedule is computed client-side and persisted as the
        // full round plan. Mexicano / Up&Down seed round 1 server-side.
        let roster: AmericanoRoster = {
          specification: 'classic',
          participantIds: input.confirmedParticipantIds,
        };
        if (input.specification === 'team' || input.specification === 'mixed') {
          // Genders and teams as start_event sees them (a block can hide a profile's gender).
          const { data, error } = await db.rpc('event_engine_roster', { p_event_id: eventId });
          if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
          roster = engineRoster(input.specification, input.confirmedParticipantIds, data ?? []);
        }
        const plan = buildAmericanoSchedule(roster, input.numCourts);
        args.p_rounds = plan.map((round) => ({
          round_number: round.roundNumber,
          status: 'pending',
          rests: round.rests,
          matches: round.matches.map((m) => ({
            court_number: m.courtNumber,
            match_number: m.matchNumber,
            side_a: m.sideA,
            side_b: m.sideB,
          })),
        }));
      }
      const { error } = await db.rpc('start_event', args);
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.event(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventRounds(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventMatches(eventId) });
    },
  });
};

export const useGenerateNextRound = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc('generate_next_round', { p_event_id: eventId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventRounds(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventMatches(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventStandings(eventId) });
    },
  });
};

export const useSubmitScore = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      matchId: string;
      sideA: number;
      sideB: number;
      notPlayed?: boolean;
    }) => {
      const { error } = await db.rpc('submit_score', {
        p_match_id: input.matchId,
        p_side_a: input.sideA,
        p_side_b: input.sideB,
        p_not_played: input.notPlayed,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventMatches(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventRounds(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventStandings(eventId) });
    },
  });
};

export const useFinishEvent = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input?: { countsOverride?: boolean; finishMessage?: string }) => {
      const { error } = await db.rpc('finish_event', {
        p_event_id: eventId,
        p_counts_override: input?.countsOverride,
        p_finish_message: input?.finishMessage,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.event(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventStandings(eventId) });
      invalidateMyEvents(qc);
    },
  });
};

export const useSetEventRanking = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await db.rpc('set_event_ranking', {
        p_event_id: eventId,
        p_enabled: enabled,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.event(eventId) });
    },
  });
};

export const useAssignToTeam = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      participantId: string;
      teamNumber: number;
      slot: 'a' | 'b';
      targetName?: string;
    }) => {
      const { error } = await db.rpc('organizer_assign_to_team', {
        p_event_id: eventId,
        p_participant_id: input.participantId,
        p_team_number: input.teamNumber,
        p_slot: input.slot,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventTeams(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
    },
  });
};

export const useRemoveFromTeam = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { participantId: string; targetName?: string }) => {
      const { error } = await db.rpc('organizer_remove_from_team', {
        p_event_id: eventId,
        p_participant_id: input.participantId,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventTeams(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
    },
  });
};

export const useSwitchPlayers = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { participantA: string; participantB: string }) => {
      const { error } = await db.rpc('organizer_switch_players', {
        p_event_id: eventId,
        p_a: input.participantA,
        p_b: input.participantB,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventTeams(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
    },
  });
};

export interface SendBlastResult {
  blastId: string | null;
  /** Email recipients (audience members opted in to email); 0 without the email channel. */
  sentToCount: number;
  /** Everyone in the send_to scope. */
  audienceCount: number;
  /**
   * "*Title*\n\nDescription" when WhatsApp was chosen, else null. WhatsApp is sent from the
   * organizer's device (D6): open `https://wa.me/?text=${encodeURIComponent(shareText)}` or the
   * share sheet with it. The server only records the blast as 'shared'.
   */
  shareText: string | null;
}

/**
 * Send a blast (UX-MEVT-18, migration 0124). Without customisation (useCanCustomizeBlast false)
 * the server only accepts an unedited template: pass `sourceTemplateId` with `title` /
 * `description` / `imagePath` null (it fills them) or equal to the template's; anything else, or
 * `save`, raises blast_customization_required. `save` also stores it under "Your blasts".
 */
export const useSendBlast = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sourceTemplateId: string | null;
      title: string | null;
      description: string | null;
      imagePath: string | null;
      channels: BlastChannel[];
      sendTo?: BlastSendTo;
      save?: boolean;
    }): Promise<SendBlastResult> => {
      const { data, error } = await db.rpc('send_event_blast', {
        p_event_id: eventId,
        p_source_template_id: input.sourceTemplateId,
        p_title: input.title,
        p_description: input.description,
        p_image_path: input.imagePath,
        p_channels: input.channels,
        p_send_to: input.sendTo ?? 'all',
        p_save: input.save ?? false,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      const row = data?.[0];
      const result: SendBlastResult = {
        blastId: row?.blast_id ?? null,
        sentToCount: row?.sent_to_count ?? 0,
        audienceCount: row?.audience_count ?? 0,
        shareText: row?.share_text ?? null,
      };
      // Deliver the email channel best-effort (the row is already recorded). Use the supabase
      // client's `functions.invoke` — it injects the project URL + the caller's auth automatically.
      if (input.channels.includes('email') && result.blastId) {
        try {
          await db.functions.invoke('send-blast', { body: { blast_id: result.blastId } });
        } catch {
          /* delivery is best-effort; the blast is recorded regardless */
        }
      }
      return result;
    },
    onSuccess: (_r, input) => {
      qc.invalidateQueries({ queryKey: qk.eventBlasts(eventId) });
      qc.invalidateQueries({ queryKey: qk.blastDeliveries(eventId) });
      if (input.save) qc.invalidateQueries({ queryKey: qk.savedBlastsAll });
    },
  });
};

/** Save a blast under "Your blasts" without sending it. Needs customisation. Returns its id. */
export const useSaveBlast = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description: string;
      imagePath?: string | null;
      sourceTemplateId?: string | null;
    }) => {
      const { data, error } = await db.rpc('save_blast', {
        p_event_id: eventId,
        p_title: input.title,
        p_description: input.description,
        p_image_path: input.imagePath ?? null,
        p_source_template_id: input.sourceTemplateId ?? null,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.savedBlastsAll }),
  });
};

/** Edit a saved blast (its creator or a community admin; needs customisation). */
export const useUpdateSavedBlast = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; title: string; description: string; imagePath?: string | null }) => {
      const { error } = await db.rpc('update_saved_blast', {
        p_saved_blast_id: input.id,
        p_title: input.title,
        p_description: input.description,
        p_image_path: input.imagePath ?? null,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.savedBlastsAll }),
  });
};

/** Delete a saved blast. Allowed after a downgrade too, so an owner can still clean up. */
export const useDeleteSavedBlast = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc('delete_saved_blast', { p_saved_blast_id: id });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.savedBlastsAll }),
  });
};

export const useSendRosterCsvEmail = (eventId: string) => {
  const db = useDb();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await db.functions.invoke('send-roster-csv', {
        body: { event_id: eventId },
      });
      // `send-roster-csv` returns 200 `{ ok:false, error:'email_not_configured' }` for the unconfigured
      // case (so it arrives as `data`, not a thrown FunctionsHttpError); other failures set `error`.
      if (error) throw new Error('csv_email_failed');
      if (data && data.ok === false) {
        throw new Error(data.error === 'email_not_configured' ? 'email_not_configured' : 'csv_email_failed');
      }
    },
  });
};

export const useCancelEvent = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { scope: 'only_this' | 'this_and_upcoming' }) => {
      const { error } = await db.rpc('cancel_event', { p_event_id: eventId, p_scope: input.scope });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.event(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventNextOccurrences(eventId) });
      invalidateMyEvents(qc);
    },
  });
};

export const useSetEventTimer = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: 'start' | 'pause' | 'resume' | 'reset') => {
      const { error } = await db.rpc('set_event_timer', { p_event_id: eventId, p_action: action });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventTimer(eventId) });
    },
  });
};

export const usePostEventResult = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_communityId: string) => {
      const { data, error } = await db.rpc('post_event_result', { p_event_id: eventId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data as string;
    },
    onSuccess: (_data, communityId) => {
      qc.invalidateQueries({ queryKey: qk.posts(communityId) });
      qc.invalidateQueries({ queryKey: qk.eventResultSummary(eventId) });
    },
  });
};

export const useMaterializeOccurrence = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc('materialize_occurrence', { p_after_event_id: eventId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data as string; // new (or existing) occurrence event id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.event(eventId) });
      invalidateMyEvents(qc);
    },
  });
};

// ---------------------------------------------------------------------------
// Recurring occurrences (migration 0123, UX-MEVT-08 / 22). `eventId` is the event whose Manage
// screen lists the occurrences (its next-occurrences cache is refreshed).
// ---------------------------------------------------------------------------

/** Move an Upcoming occurrence (not yet sent). A Scheduled one is edited with useUpdateEvent. */
export const useUpdateOccurrenceSlot = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { seriesId: string; slotDate: string; startsAt: string }) => {
      const { error } = await db.rpc('update_occurrence_slot', {
        p_series_id: input.seriesId,
        p_slot_date: input.slotDate,
        p_starts_at: input.startsAt,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventNextOccurrences(eventId) });
    },
  });
};

/** Cancel one occurrence; the series goes on. A Scheduled one is cancelled like cancel_event 'only_this'. */
export const useCancelOccurrenceSlot = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { seriesId: string; slotDate: string }) => {
      const { error } = await db.rpc('cancel_occurrence_slot', {
        p_series_id: input.seriesId,
        p_slot_date: input.slotDate,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventNextOccurrences(eventId) });
      invalidateMyEvents(qc);
    },
  });
};

/** "Send invitation now": materialise an Upcoming occurrence early. Returns its event id. */
export const useSendOccurrenceNow = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { seriesId: string; slotDate: string }) => {
      const { data, error } = await db.rpc('send_occurrence_now', {
        p_series_id: input.seriesId,
        p_slot_date: input.slotDate,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventNextOccurrences(eventId) });
      invalidateMyEvents(qc);
    },
  });
};

/**
 * "Repeat every week" on an existing event. Off cancels every later Scheduled occurrence (their
 * players are told) and stops the series; on starts a new weekly series from this event (group
 * events only; the community's recurring_events cap applies → 'recurring_events').
 */
export const useSetEventRecurrence = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { on: boolean; inviteLeadDays?: 3 | 5 | 7 | null; groupId: string | null }) => {
      const { error } = await db.rpc('set_event_recurrence', {
        p_event_id: eventId,
        p_on: input.on,
        p_invite_lead_days: input.inviteLeadDays ?? null,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: qk.event(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventSeries(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventNextOccurrences(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
      invalidateMyEvents(qc);
      if (input.groupId) {
        qc.invalidateQueries({ queryKey: qk.events(input.groupId) });
        qc.invalidateQueries({ queryKey: qk.canCreateEvent(input.groupId) });
      }
    },
  });
};

export const useRetryBlast = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (blastId: string) => {
      const { error } = await db.rpc('retry_blast', { p_blast_id: blastId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      try {
        await db.functions.invoke('send-blast', { body: { blast_id: blastId } });
      } catch { /* delivery is best-effort; the new attempt will be logged by the function */ }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.blastDeliveries(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventBlasts(eventId) });
    },
  });
};
