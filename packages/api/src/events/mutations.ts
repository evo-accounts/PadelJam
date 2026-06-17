import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb, mapPgError } from '../client';
import { qk } from '../query-keys';
import { buildCreateEventPayload, type CreateEventInput, type EventType } from '../schemas';
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
      if (input.groupId) {
        qc.invalidateQueries({ queryKey: qk.events(input.groupId) });
        qc.invalidateQueries({ queryKey: qk.canCreateEvent(input.groupId) });
      }
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
    },
  });
};

export const useChoosePartner = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (partnerUser: string) => {
      const { error } = await db.rpc('choose_partner', {
        p_event_id: eventId,
        p_partner_user: partnerUser,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.partnerRequests(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventTeams(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
    },
  });
};

export const useAcceptPartnerRequest = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await db.rpc('accept_partner_request', { p_request_id: requestId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.partnerRequests(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventTeams(eventId) });
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
    },
  });
};

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export const useInviteToEvent = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      invitees: { invitee_id?: string; name?: string; email?: string; phone?: string }[],
    ) => {
      const { error } = await db.rpc('invite_to_event', {
        p_event_id: eventId,
        p_invitees: invitees,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventInvitations(eventId) });
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
      await logActivity(db, eventId, 'confirmed', { target_name: input.targetName });
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
      await logActivity(db, eventId, 'removed', { target_name: input.targetName, mode: input.mode });
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
      await logActivity(db, eventId, 'guest_added', { guest_name: input.name });
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
      await logActivity(db, eventId, input.paid ? 'marked_paid' : 'marked_unpaid', {
        target_name: input.targetName,
      });
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
      await logActivity(db, eventId, 'marked_all_paid');
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
      await logActivity(db, eventId, 'team_assigned', {
        target_name: input.targetName,
        team_number: input.teamNumber,
      });
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
      await logActivity(db, eventId, 'team_removed', { target_name: input.targetName });
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
      await logActivity(db, eventId, 'team_switched', {});
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
      return data as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventBlasts(eventId) });
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
      qc.invalidateQueries({ queryKey: qk.myEvents('all') });
      qc.invalidateQueries({ queryKey: qk.myEvents('organizing') });
      qc.invalidateQueries({ queryKey: qk.myEvents('going') });
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
