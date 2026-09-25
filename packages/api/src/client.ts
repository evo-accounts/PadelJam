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
  'use_team_join', 'not_a_team_event', 'partner_unavailable', 'gender_required',
  'setup_incomplete', 'mixed_unbalanced', 'mixed_gender_missing', 'round_not_scored', 'round_exists', 'event_not_scheduled',
  'match_not_found', 'score_locked', 'invalid_participant', 'invalid_mode',
  'recurring_events', 'not_cancellable', 'invalid_scope', 'not_editable', 'standby_below_roster', 'series_inactive', 'courts_below_roster', 'not_retryable',
  // community reviews: gate RPC codes the review screen translates directly
  'invalid_rating', 'review_requires_participation',
  // blasts: RPC/validation codes the blast screen translates directly
  'no_community', 'channels_required', 'invalid_channel', 'blast_incomplete',
  // timer + share-results: RPC codes the timer/share screens translate directly
  'invalid_action', 'not_completed', 'already_posted',
  // plans: RPC/validation codes the paywall and plan screens translate directly
  'invalid_plan', 'plan_downgrade_over_limit',
  // auth: complete-account's weak-password rejection (UX-GLOB-07); the mobile create-account
  // screen currently reads this straight off the Edge Function's JSON body instead of through
  // mapPgError, but the code is listed here too so a future Postgres-side password check (or a
  // caller that does route through mapPgError) resolves to the same i18n key.
  'password_weak',
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
