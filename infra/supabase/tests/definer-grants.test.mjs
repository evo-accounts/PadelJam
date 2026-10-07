// infra/supabase/tests/definer-grants.test.mjs
// Migration 0136: the SECURITY DEFINER functions only signed-in screens call are closed to anon.
// Before it, every one of them answered the publishable key — most refused inside their body, but
// get_player_profile, list_followers and list_following handed anon profiles and follow graphs.
//
// Every argument is null. The EXECUTE check happens before a function body runs, so a refusal
// here proves the grant is gone without executing anything; if a grant ever came back, the body
// would see nulls and refuse or do nothing.
import { user, rpc, anonRpc, expectError, assert, run } from './lib.mjs';

const DENIED = 'permission denied for function';

/** The 39 functions 0136 made signed-in only, with their parameter names. */
const SIGNED_IN_ONLY = [
  ['accept_event_invitation', { p_event_id: null }],
  ['add_manual_participant', { p_event_id: null, p_name: null, p_gender: null }],
  ['blast_email_recipients', { p_blast_id: null }],
  ['block_user', { p_target: null }],
  ['can_review_community', { p_community_id: null }],
  ['chat_channel_spec', { p_kind: null, p_id: null }],
  ['claim_waitlist_spot', { p_event_id: null }],
  ['community_plan', { c: null }],
  ['decline_event_invitation', { p_event_id: null }],
  ['decline_partner_request', { p_request_id: null }],
  ['event_result_summary', { p_event_id: null }],
  ['event_roster_csv', { p_event_id: null }],
  ['finish_event', { p_event_id: null, p_finish_message: null, p_counts_override: null }],
  ['generate_next_round', { p_event_id: null }],
  ['get_player_profile', { p_target: null }],
  ['join_event', { p_event_id: null }],
  ['leave_event', { p_event_id: null }],
  ['leave_waiting_list', { p_event_id: null }],
  ['list_followers', { p_user: null, p_search: null, p_limit: null, p_offset: null }],
  ['list_following', { p_user: null, p_search: null, p_limit: null, p_offset: null }],
  ['mark_all_paid', { p_event_id: null }],
  ['mark_paid', { p_participant_id: null, p_paid: null }],
  ['organizer_mark_confirmed', { p_participant_id: null }],
  ['organizer_remove_from_team', { p_event_id: null, p_participant_id: null }],
  ['organizer_switch_players', { p_event_id: null, p_a: null, p_b: null }],
  ['post_event_result', { p_event_id: null }],
  ['register_push_token', { p_expo_token: null, p_platform: null }],
  ['retry_blast', { p_blast_id: null }],
  ['set_event_ranking', { p_event_id: null, p_enabled: null }],
  ['set_event_timer', { p_event_id: null, p_action: null }],
  ['set_my_location', { p_lat: null, p_lng: null, p_text: null }],
  ['social_email_conflict', {}],
  ['soft_delete_account', {}],
  ['standings', { p_event_id: null }],
  ['start_event', { p_event_id: null, p_rounds: null }],
  ['start_new_season', { p_group_id: null }],
  ['submit_score', { p_match_id: null, p_side_a: null, p_side_b: null, p_not_played: null }],
  ['unblock_user', { p_target: null }],
  ['upsert_community_review', { p_community_id: null, p_rating: null, p_body: null }],
];

await run(`anon cannot execute any of the ${SIGNED_IN_ONLY.length} signed-in-only functions`, async () => {
  for (const [name, args] of SIGNED_IN_ONLY) {
    await expectError(() => anonRpc(name, args), DENIED);
  }
});

await run('signed in, the read-only ones still answer', async () => {
  // A spot check that the grant to authenticated survived: these three only read, so calling them
  // with a real session is safe. The rest are exercised by their own feature tests and the E2E suite.
  const u = await user('dg-reader');
  const profile = await rpc(u.jwt, 'get_player_profile', { p_target: u.id });
  assert(Array.isArray(profile), 'get_player_profile answers a signed-in caller');
  const followers = await rpc(u.jwt, 'list_followers', { p_user: u.id, p_search: null, p_limit: 5, p_offset: 0 });
  assert(Array.isArray(followers), 'list_followers answers a signed-in caller');
  const following = await rpc(u.jwt, 'list_following', { p_user: u.id, p_search: null, p_limit: 5, p_offset: 0 });
  assert(Array.isArray(following), 'list_following answers a signed-in caller');
});
