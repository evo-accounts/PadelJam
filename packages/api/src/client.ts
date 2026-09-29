import { useSession } from '@padel/auth';
import type { TypedClient } from '@padel/db';

export const useDb = (): TypedClient => useSession().client;

const KNOWN = [
  'owned_community_cap_reached', 'rules_acknowledgement_required', 'invite_required',
  'community_not_found', 'forbidden', 'not_a_member',
  'request_not_found', 'invitation_not_found',
  // The last-admin guard (migration 0098's trg_last_admin trigger). It replaces
  // 'transfer_ownership_first' and covers all four ways an admin row can leave: leave_community,
  // remove_member, a direct demotion under RLS, and soft_delete_account.
  'last_admin_must_promote_first',
  // groups: RPC/validation codes the group screens translate directly
  'name_required', 'group_not_found', 'group_private_join_forbidden',
  'sole_admin_must_add_another', 'groups_per_community', 'last_active_group',
  // events: RPC/validation codes the event screens translate directly
  'invalid_event_config', 'series_requires_group', 'event_not_found', 'event_closed',
  'event_full', 'leave_deadline_passed', 'already_joined', 'not_invited', 'not_participant',
  'not_on_waiting_list', 'spot_taken',
  // 0113: a mixed event's guest has no gender. BEFORE 'gender_required', which is a substring.
  'guest_gender_required',
  // 0122: the organizer confirms a player with no gender on a mixed event. Same reason.
  'player_gender_required',
  'use_team_join', 'not_a_team_event', 'partner_unavailable', 'request_stale', 'gender_required',
  // 0112: a mixed event's half for the caller's gender is full (claim_waitlist_spot).
  'gender_full',
  // 0113: a guest's name is empty or over 60 characters; manual court names don't match the courts.
  // (A deleted registry venue raises 'venue_not_found', listed with the 0114 codes below.)
  'invalid_guest_name', 'invalid_court_names',
  'setup_incomplete', 'mixed_unbalanced', 'mixed_gender_missing', 'round_not_scored', 'round_exists', 'event_not_scheduled',
  // 0121: an organizer roster tool on an event that is no longer scheduled (payments: cancelled),
  // finish_event on an event that is not in progress, a participant of another event. BEFORE
  // 'not_editable', which is a substring of 'event_not_editable'.
  'event_not_editable', 'event_not_in_progress', 'participant_not_found',
  // 0122: start blockers (setup_incomplete is no longer raised), a client schedule that does not
  // fit the event, the organizer's roster rules, duplicate's date, invitation scope, team slots,
  // a group-less event made public.
  'not_enough_players', 'odd_players', 'teams_incomplete', 'invalid_rounds',
  'waitlist_not_confirmable', 'team_required', 'starts_at_required', 'starts_at_in_past',
  'invites_not_allowed', 'not_group_member', 'user_not_found', 'slot_taken',
  'standalone_must_be_private',
  // 0123: acting on a recurring event's occurrence slot (not a slot / already sent / cancelled),
  // and a 'this and upcoming' date move onto another occurrence's week.
  'occurrence_not_found', 'occurrence_materialised', 'occurrence_cancelled', 'occurrence_conflict',
  // 0127: the Teams tab (a team past the event's bound, a bad slot), switching a player who is in no
  // team, revoking an invitation whose invitee is already on the roster.
  'invalid_team', 'invalid_slot', 'not_in_team', 'invitee_in_roster',
  'match_not_found', 'score_locked', 'invalid_participant', 'invalid_mode',
  'recurring_events', 'not_cancellable', 'invalid_scope', 'not_editable', 'standby_below_roster', 'series_inactive', 'courts_below_roster', 'not_retryable',
  // community reviews: gate RPC codes the review screen translates directly
  'invalid_rating', 'review_requires_participation',
  // blasts: RPC/validation codes the blast screen translates directly
  'no_community', 'channels_required', 'invalid_channel', 'blast_incomplete',
  // 0124: custom text / Save blast / Your blasts without custom_broadcasts (or Jammer+ on a
  // group-less event), over-long text, an unknown send_to, template or saved blast.
  'blast_customization_required', 'blast_too_long', 'invalid_send_to', 'template_not_found',
  'saved_blast_not_found',
  // timer + share-results: RPC codes the timer/share screens translate directly
  'invalid_action', 'not_completed', 'already_posted',
  // plans: RPC/validation codes the paywall and plan screens translate directly
  'invalid_plan', 'plan_downgrade_over_limit',
  // auth: complete-account's weak-password rejection (UX-GLOB-07); the mobile create-account
  // screen currently reads this straight off the Edge Function's JSON body instead of through
  // mapPgError, but the code is listed here too so a future Postgres-side password check (or a
  // caller that does route through mapPgError) resolves to the same i18n key.
  'password_weak',
  // venue registry (0114): save_venue / the court-in-use guard
  'court_in_use', 'court_name_required', 'venue_not_found', 'invalid_courts',
  // 0128: follow_player on yourself; a community location with half a point or out of range.
  'cannot_follow_self', 'invalid_location',
  // 0122: invite_to_event to a blocked player; 0128: follow_player across a block.
  // LAST: the shortest, most generic code.
  'blocked',
] as const;

/** Map a Supabase/Postgres error to a stable code the UI translates via i18n. */
export function mapPgError(error: { message?: string } | null): string | null {
  if (!error?.message) return null;
  const msg = error.message;
  // KNOWN is checked first: the group cap trigger raises 'groups_per_community limit reached (N)'
  // and unarchive_group raises a bare 'groups_per_community' — both match the 'groups_per_community'
  // code, which is the i18n key the group screens expect.
  for (const code of KNOWN) if (msg.includes(code)) return code;
  if (msg.includes('members_per_community limit reached')) return 'community_full';
  if (msg.includes('co_organizers limit reached')) return 'co_organizers_limit_reached';
  return 'unknown_error';
}
