import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb, mapPgError } from '../client';
import { qk } from '../query-keys';
import {
  buildCreateEventPayload,
  buildUpdateEventPayload,
  type CreateEventInput,
  type EventType,
  type UpdateEventInput,
} from '../schemas';
import { americanoSchedule } from '../round-gen';

// Mirrors the generated `Json` scalar from @padel/db (not re-exported there).
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Fire-and-forget activity log. A logging failure must never fail the user's action. */
async function logActivity(
  db: ReturnType<typeof useDb>,
  eventId: string,
  action: string,
  detail: Record<string, unknown> = {},
) {
  try {
    await db.rpc('log_event_activity', {
      p_event_id: eventId,
      p_action: action,
      p_detail: detail as Json,
    });
  } catch {
    /* best-effort */
  }
}

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

export const useUpdateEvent = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { values: UpdateEventInput; groupId: string | null }) => {
      const { error } = await db.rpc('update_event', {
        p_event_id: eventId,
        p_payload: buildUpdateEventPayload(input.values) as Json,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: qk.event(eventId) });
      invalidateMyEvents(qc);
      if (input.groupId) qc.invalidateQueries({ queryKey: qk.events(input.groupId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
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
      await logActivity(db, input.eventId, 'joined', { status: data });
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
      await logActivity(db, input.eventId, 'left');
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.partnerRequests(eventId) });
      qc.invalidateQueries({ queryKey: qk.partnerCandidates(eventId) });
    },
  });
};

/** Everything a pairing (or a waiting pair's claim) can change on one event. */
function invalidatePairing(qc: ReturnType<typeof useQueryClient>, eventId: string) {
  qc.invalidateQueries({ queryKey: qk.partnerRequests(eventId) });
  qc.invalidateQueries({ queryKey: qk.partnerCandidates(eventId) });
  qc.invalidateQueries({ queryKey: qk.incomingPartnerRequests });
  qc.invalidateQueries({ queryKey: qk.partnerRequestSummary });
  qc.invalidateQueries({ queryKey: qk.eventTeams(eventId) });
  qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
  qc.invalidateQueries({ queryKey: qk.event(eventId) });
  invalidateMyEvents(qc);
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.partnerRequests(eventId) });
      qc.invalidateQueries({ queryKey: qk.partnerCandidates(eventId) });
    },
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
    // add_manual_participant or the wizard's `guests`.
    mutationFn: async (invitees: { invitee_id: string }[]) => {
      const { error } = await db.rpc('invite_to_event', {
        p_event_id: eventId,
        p_invitees: invitees,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventInvitations(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
    },
  });
};

export const useAcceptEventInvitation = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { eventId: string; groupId: string | null }) => {
      const { error } = await db.rpc('accept_event_invitation', { p_event_id: input.eventId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
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
      qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
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
      qc.invalidateQueries({ queryKey: qk.event(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
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

export const useStartEvent = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      eventType: EventType;
      confirmedParticipantIds: string[];
      numCourts: number;
    }) => {
      const args: { p_event_id: string; p_rounds?: Json } = { p_event_id: eventId };
      if (input.eventType === 'americano') {
        // Americano schedule is computed client-side and persisted as the
        // full round plan. Mexicano / Up&Down seed round 1 server-side.
        const plan = americanoSchedule(input.confirmedParticipantIds, input.numCourts);
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

export const useSendBlast = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sourceTemplateId: string | null;
      title: string;
      description: string;
      imagePath: string | null;
      channels: ('email' | 'whatsapp')[];
    }) => {
      const { data, error } = await db.rpc('send_event_blast', {
        p_event_id: eventId,
        p_source_template_id: input.sourceTemplateId,
        p_title: input.title,
        p_description: input.description,
        p_image_path: input.imagePath,
        p_channels: input.channels,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      const row = data?.[0] ?? { blast_id: null, sent_to_count: 0 };
      // Deliver the email channel best-effort (the row is already recorded). Use the supabase
      // client's `functions.invoke` — it injects the project URL + the caller's auth automatically.
      if (input.channels.includes('email') && row.blast_id) {
        try {
          await db.functions.invoke('send-blast', { body: { blast_id: row.blast_id } });
        } catch {
          /* delivery is best-effort; the blast is recorded regardless */
        }
      }
      return row.sent_to_count;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventBlasts(eventId) });
    },
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
