-- Takes EXECUTE away from the API roles on 56 SECURITY DEFINER functions that do not need it.
-- Supabase's security advisor lists every SECURITY DEFINER function in an exposed schema that anon
-- (lint 0028) or authenticated (lint 0029) may execute — 70 and 164 of them here. Most are meant
-- to be called: they are this app's RPCs, and each checks the caller itself. But migration 0030's
-- `alter default privileges ... grant execute on functions to anon, authenticated`, and Postgres's
-- own default grant to PUBLIC, put EVERY function on that list the moment it was created, whether
-- or not anyone was meant to call it. This file removes the grants nobody uses, one function at a
-- time, from a triage of all 161 (each body read, every caller found, anon reach tested; the
-- reasoning is in the PR). What is left on the advisor's list after this is the app's real API.
--
-- PUBLIC IS NAMED IN EVERY REVOKE. Nearly all of these hold `=X` (PUBLIC) as well as explicit anon
-- and authenticated grants. Revoking from anon alone would leave anon executing through PUBLIC —
-- 0094 learned this the hard way.
--
-- 1. SIGNED-IN ONLY — anon loses EXECUTE on 39 functions.
--    Each is an action or a read that only makes sense with a session: every caller is a screen
--    behind sign-in (web /app/* is behind middleware, mobile routes unauthenticated users to (auth))
--    or an edge function that forwards the caller's own JWT. Most already refused a session-less
--    caller in their body; that was the only thing standing between them and anon. Three did NOT,
--    and leaked through the grant:
--      get_player_profile                 any player's profile, to anyone holding the public key;
--      list_followers / list_following    any player's follow graph, crawlable from one id.
--    profiles and follows are readable only by signed-in users under RLS; these SECURITY DEFINER
--    functions skipped that. standings(uuid) also loses anon: 0125 kept the anon grant it inherited
--    and masked identities around it, but nothing signed-out calls it, and it returned any event's
--    scoreboard to anon.
--
-- 2. INTERNAL — anon AND authenticated lose EXECUTE on 5 functions.
--    Called only from other SECURITY DEFINER functions or triggers (which run as the owner and need
--    no grant), or not at all:
--      community_has_feature, community_limit   plan helpers behind group/member/event caps;
--      account_has_feature                      took any user id, so it told anyone another user's
--                                               Jammer+ status — the reason 0094 already closed
--                                               account_plan(uuid). The app reads its own plan
--                                               through account_plan_of_caller (0095);
--      may_create_event                         called only inside the event-creation functions;
--      persist_round                            no caller left anywhere.
--    Their only client wrappers (packages/features entitlements, used by nothing but the unused
--    packages/authz) were already dead.
--
-- 3. TRIGGERS — anon and authenticated lose EXECUTE on the 12 trigger functions.
--    A trigger function cannot be called as an RPC, and a trigger fires whether or not the role
--    whose statement fired it may EXECUTE the function (verified on the local stack before this file
--    was written). The grants only ever put them on the advisor's list.
--
-- NOT CHANGED, on purpose:
--   * the 11 helpers RLS policies call (is_community_member, event_is_visible, …): the policies
--     apply to every role, so anon must be able to run them or its reads of events, groups and
--     communities would fail with an error instead of returning nothing;
--   * auth_methods_for, which anon must call before signing in (0096);
--   * the 3 PostGIS st_estimatedextent overloads: they belong to supabase_admin, so only Supabase
--     can change their grants (same as spatial_ref_sys, 0133);
--   * the default privileges themselves. Every function created from now on still arrives with
--     anon and authenticated EXECUTE, so a new internal helper needs its own revoke, as 0094 says.

-- 1. Signed-in only ----------------------------------------------------------------------------
revoke execute on function accept_event_invitation(uuid) from public, anon;
revoke execute on function add_manual_participant(uuid,text,text) from public, anon;
revoke execute on function blast_email_recipients(uuid) from public, anon;
revoke execute on function block_user(uuid) from public, anon;
revoke execute on function can_review_community(uuid) from public, anon;
revoke execute on function chat_channel_spec(text,uuid) from public, anon;
revoke execute on function claim_waitlist_spot(uuid) from public, anon;
revoke execute on function community_plan(uuid) from public, anon;
revoke execute on function decline_event_invitation(uuid) from public, anon;
revoke execute on function decline_partner_request(uuid) from public, anon;
revoke execute on function event_result_summary(uuid) from public, anon;
revoke execute on function event_roster_csv(uuid) from public, anon;
revoke execute on function finish_event(uuid,text,boolean) from public, anon;
revoke execute on function generate_next_round(uuid) from public, anon;
revoke execute on function get_player_profile(uuid) from public, anon;
revoke execute on function join_event(uuid) from public, anon;
revoke execute on function leave_event(uuid) from public, anon;
revoke execute on function leave_waiting_list(uuid) from public, anon;
revoke execute on function list_followers(uuid,text,integer,integer) from public, anon;
revoke execute on function list_following(uuid,text,integer,integer) from public, anon;
revoke execute on function mark_all_paid(uuid) from public, anon;
revoke execute on function mark_paid(uuid,boolean) from public, anon;
revoke execute on function organizer_mark_confirmed(uuid) from public, anon;
revoke execute on function organizer_remove_from_team(uuid,uuid) from public, anon;
revoke execute on function organizer_switch_players(uuid,uuid,uuid) from public, anon;
revoke execute on function post_event_result(uuid) from public, anon;
revoke execute on function register_push_token(text,text) from public, anon;
revoke execute on function retry_blast(uuid) from public, anon;
revoke execute on function set_event_ranking(uuid,boolean) from public, anon;
revoke execute on function set_event_timer(uuid,text) from public, anon;
revoke execute on function set_my_location(double precision,double precision,text) from public, anon;
revoke execute on function social_email_conflict() from public, anon;
revoke execute on function soft_delete_account() from public, anon;
revoke execute on function standings(uuid) from public, anon;
revoke execute on function start_event(uuid,jsonb) from public, anon;
revoke execute on function start_new_season(uuid) from public, anon;
revoke execute on function submit_score(uuid,integer,integer,boolean) from public, anon;
revoke execute on function unblock_user(uuid) from public, anon;
revoke execute on function upsert_community_review(uuid,smallint,text) from public, anon;
-- Already held explicitly; restated so the outcome does not depend on how each grant arrived.
grant execute on function accept_event_invitation(uuid) to authenticated;
grant execute on function add_manual_participant(uuid,text,text) to authenticated;
grant execute on function blast_email_recipients(uuid) to authenticated;
grant execute on function block_user(uuid) to authenticated;
grant execute on function can_review_community(uuid) to authenticated;
grant execute on function chat_channel_spec(text,uuid) to authenticated;
grant execute on function claim_waitlist_spot(uuid) to authenticated;
grant execute on function community_plan(uuid) to authenticated;
grant execute on function decline_event_invitation(uuid) to authenticated;
grant execute on function decline_partner_request(uuid) to authenticated;
grant execute on function event_result_summary(uuid) to authenticated;
grant execute on function event_roster_csv(uuid) to authenticated;
grant execute on function finish_event(uuid,text,boolean) to authenticated;
grant execute on function generate_next_round(uuid) to authenticated;
grant execute on function get_player_profile(uuid) to authenticated;
grant execute on function join_event(uuid) to authenticated;
grant execute on function leave_event(uuid) to authenticated;
grant execute on function leave_waiting_list(uuid) to authenticated;
grant execute on function list_followers(uuid,text,integer,integer) to authenticated;
grant execute on function list_following(uuid,text,integer,integer) to authenticated;
grant execute on function mark_all_paid(uuid) to authenticated;
grant execute on function mark_paid(uuid,boolean) to authenticated;
grant execute on function organizer_mark_confirmed(uuid) to authenticated;
grant execute on function organizer_remove_from_team(uuid,uuid) to authenticated;
grant execute on function organizer_switch_players(uuid,uuid,uuid) to authenticated;
grant execute on function post_event_result(uuid) to authenticated;
grant execute on function register_push_token(text,text) to authenticated;
grant execute on function retry_blast(uuid) to authenticated;
grant execute on function set_event_ranking(uuid,boolean) to authenticated;
grant execute on function set_event_timer(uuid,text) to authenticated;
grant execute on function set_my_location(double precision,double precision,text) to authenticated;
grant execute on function social_email_conflict() to authenticated;
grant execute on function soft_delete_account() to authenticated;
grant execute on function standings(uuid) to authenticated;
grant execute on function start_event(uuid,jsonb) to authenticated;
grant execute on function start_new_season(uuid) to authenticated;
grant execute on function submit_score(uuid,integer,integer,boolean) to authenticated;
grant execute on function unblock_user(uuid) to authenticated;
grant execute on function upsert_community_review(uuid,smallint,text) to authenticated;

-- 2. Internal ----------------------------------------------------------------------------------
revoke execute on function account_has_feature(uuid,text) from public, anon, authenticated;
revoke execute on function community_has_feature(uuid,text) from public, anon, authenticated;
revoke execute on function community_limit(uuid,text) from public, anon, authenticated;
revoke execute on function may_create_event(uuid) from public, anon, authenticated;
revoke execute on function persist_round(jsonb) from public, anon, authenticated;

-- 3. Triggers ----------------------------------------------------------------------------------
revoke execute on function enforce_group_cap() from public, anon, authenticated;
revoke execute on function enforce_recurring_events_cap() from public, anon, authenticated;
revoke execute on function notify_on_community_invite() from public, anon, authenticated;
revoke execute on function notify_on_event_invite() from public, anon, authenticated;
revoke execute on function notify_on_follow() from public, anon, authenticated;
revoke execute on function notify_on_group_invite() from public, anon, authenticated;
revoke execute on function notify_on_join_accepted() from public, anon, authenticated;
revoke execute on function notify_on_participant_confirmed() from public, anon, authenticated;
revoke execute on function notify_on_participant_join() from public, anon, authenticated;
revoke execute on function notify_push() from public, anon, authenticated;
revoke execute on function record_password_set() from public, anon, authenticated;
revoke execute on function sync_profile_contact() from public, anon, authenticated;

-- Self-check, in the spirit of 0094/0097/0101/0132–0135. The hosted database is updated by pasting
-- this file into the dashboard SQL editor; a grant that survives would be silent. The editor runs
-- the whole paste as one transaction, so if this raises, nothing above it lands.
do $$
declare v_fn regprocedure;
begin
  foreach v_fn in array array[
    'public.accept_event_invitation(uuid)',
    'public.add_manual_participant(uuid,text,text)',
    'public.blast_email_recipients(uuid)',
    'public.block_user(uuid)',
    'public.can_review_community(uuid)',
    'public.chat_channel_spec(text,uuid)',
    'public.claim_waitlist_spot(uuid)',
    'public.community_plan(uuid)',
    'public.decline_event_invitation(uuid)',
    'public.decline_partner_request(uuid)',
    'public.event_result_summary(uuid)',
    'public.event_roster_csv(uuid)',
    'public.finish_event(uuid,text,boolean)',
    'public.generate_next_round(uuid)',
    'public.get_player_profile(uuid)',
    'public.join_event(uuid)',
    'public.leave_event(uuid)',
    'public.leave_waiting_list(uuid)',
    'public.list_followers(uuid,text,integer,integer)',
    'public.list_following(uuid,text,integer,integer)',
    'public.mark_all_paid(uuid)',
    'public.mark_paid(uuid,boolean)',
    'public.organizer_mark_confirmed(uuid)',
    'public.organizer_remove_from_team(uuid,uuid)',
    'public.organizer_switch_players(uuid,uuid,uuid)',
    'public.post_event_result(uuid)',
    'public.register_push_token(text,text)',
    'public.retry_blast(uuid)',
    'public.set_event_ranking(uuid,boolean)',
    'public.set_event_timer(uuid,text)',
    'public.set_my_location(double precision,double precision,text)',
    'public.social_email_conflict()',
    'public.soft_delete_account()',
    'public.standings(uuid)',
    'public.start_event(uuid,jsonb)',
    'public.start_new_season(uuid)',
    'public.submit_score(uuid,integer,integer,boolean)',
    'public.unblock_user(uuid)',
    'public.upsert_community_review(uuid,smallint,text)'
  ]::regprocedure[] loop
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'anon can still execute %', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'authenticated lost %, which signed-in screens call', v_fn;
    end if;
  end loop;

  foreach v_fn in array array[
    'public.account_has_feature(uuid,text)',
    'public.community_has_feature(uuid,text)',
    'public.community_limit(uuid,text)',
    'public.may_create_event(uuid)',
    'public.persist_round(jsonb)',
    'public.enforce_group_cap()',
    'public.enforce_recurring_events_cap()',
    'public.notify_on_community_invite()',
    'public.notify_on_event_invite()',
    'public.notify_on_follow()',
    'public.notify_on_group_invite()',
    'public.notify_on_join_accepted()',
    'public.notify_on_participant_confirmed()',
    'public.notify_on_participant_join()',
    'public.notify_push()',
    'public.record_password_set()',
    'public.sync_profile_contact()'
  ]::regprocedure[] loop
    if has_function_privilege('anon', v_fn, 'execute')
       or has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'an API role can still execute %', v_fn;
    end if;
  end loop;

  -- What must NOT change: the pre-auth lookup, and the RLS helpers anon's reads depend on.
  if not has_function_privilege('anon', 'public.auth_methods_for(text)', 'execute') then
    raise exception 'anon lost auth_methods_for — "Try another way" cannot run before sign-in';
  end if;
  foreach v_fn in array array[
    'public.event_is_visible(uuid,uuid)', 'public.is_community_member(uuid)',
    'public.community_is_public(uuid)', 'public.is_group_member(uuid)'
  ]::regprocedure[] loop
    if not has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'anon lost %, which an RLS policy calls for every role', v_fn;
    end if;
  end loop;
end $$;
