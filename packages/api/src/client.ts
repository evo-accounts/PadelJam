import { useSession } from '@padel/auth';
import type { TypedClient } from '@padel/db';

export const useDb = (): TypedClient => useSession().client;

const KNOWN = [
  'owned_community_cap_reached', 'rules_acknowledgement_required', 'invite_required',
  'transfer_ownership_first', 'community_not_found', 'forbidden', 'not_a_member',
  'request_not_found', 'invitation_not_found', 'new_owner_not_member',
  // groups: RPC/validation codes the group screens translate directly
  'name_required', 'group_not_found', 'group_private_join_forbidden',
  'sole_owner_must_transfer', 'sole_admin_must_add_another', 'groups_per_community',
  // events: RPC/validation codes the event screens translate directly
  'invalid_event_config', 'series_requires_group', 'event_not_found', 'event_closed',
  'event_full', 'leave_deadline_passed', 'already_joined', 'not_invited', 'not_participant',
  'use_team_join', 'not_a_team_event', 'partner_unavailable', 'gender_required',
  'setup_incomplete', 'round_not_scored', 'round_exists', 'event_not_scheduled',
  'match_not_found', 'score_locked', 'invalid_participant', 'invalid_mode',
  'recurring_events', 'not_cancellable', 'invalid_scope', 'not_editable', 'standby_below_roster',
  // community reviews: gate RPC codes the review screen translates directly
  'invalid_rating', 'review_requires_participation',
  // blasts: RPC/validation codes the blast screen translates directly
  'no_community', 'channels_required', 'invalid_channel', 'blast_incomplete',
  // timer + share-results: RPC codes the timer/share screens translate directly
  'invalid_action', 'not_completed', 'already_posted',
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
