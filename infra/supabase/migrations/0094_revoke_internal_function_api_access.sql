-- Internal SQL helpers were reachable through PostgREST as `/rest/v1/rpc/<name>`.
--
-- Why `revoke execute ... from public` was not enough:
--   0030 runs `alter default privileges in schema public grant execute on functions to anon,
--   authenticated`. Every function created since then therefore carries EXPLICIT grants to anon
--   and authenticated on top of the implicit PUBLIC grant Postgres gives every new function.
--   `revoke ... from public` (0051, 0071, 0076) removes only the implicit PUBLIC grant; the
--   explicit anon/authenticated grants survive it and PostgREST keeps exposing the function.
--   0051 revoked from `authenticated, public`, which still left anon in.
--   The only revoke that closes the door is `from public, anon, authenticated` (0093 does this
--   for notify_waitlist_spot).
--
-- What qualifies as internal: a non-trigger function that is only ever called from inside
-- SECURITY DEFINER bodies (those run as the function owner, so no grant is needed), is never
-- called by a client, and appears in no RLS policy or view. Policy expressions run as the calling
-- role and DO need the grant, so is_community_admin, is_group_admin, event_is_visible & co. stay,
-- and so does group_community_id (used by the group_members policies) even though no client calls it.
-- Check with: select polname from pg_policy where pg_get_expr(polqual, polrelid) ~ '<name>\(';
-- Trigger functions cannot be called through PostgREST and are out of scope.
--
-- Rule for future migrations: right after creating an internal helper, add
--   revoke execute on function <name>(<args>) from public, anon, authenticated;
-- `from public` alone is not enough while 0030's default privileges are in force.

-- Underscore-prefixed helpers.
revoke execute on function _build_fours_arrangement(uuid[])                  from public, anon, authenticated;
revoke execute on function _persist_round_matches(uuid, uuid, jsonb)         from public, anon, authenticated;
revoke execute on function _reconcile_team(uuid)                             from public, anon, authenticated;
revoke execute on function _clear_team_slot(uuid, uuid)                      from public, anon, authenticated;
revoke execute on function _csv_field(text)                                  from public, anon, authenticated;

-- SECURITY DEFINER writer with a caller-chosen user id: any authenticated user could add anyone
-- (themselves included) to any community, private ones included, bypassing invitations.
revoke execute on function add_member_to_community(uuid, uuid)               from public, anon, authenticated;

-- Trigger-support and RPC-support helpers.
revoke execute on function notif_blocked(uuid, uuid)                         from public, anon, authenticated;
revoke execute on function viewer_distance_m(geography)                      from public, anon, authenticated;
revoke execute on function placement_points(integer)                         from public, anon, authenticated;
revoke execute on function account_plan(uuid)                                from public, anon, authenticated;
revoke execute on function community_plan(uuid)                              from public, anon, authenticated;
revoke execute on function event_group_community(uuid)                       from public, anon, authenticated;
revoke execute on function event_capacity(uuid)                              from public, anon, authenticated;
revoke execute on function is_event_invitee(uuid, uuid)                      from public, anon, authenticated;
revoke execute on function is_event_participant(uuid, uuid)                  from public, anon, authenticated;

-- Self-check so a partial paste into the hosted SQL editor cannot silently leave one open.
do $$
declare v_open text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_open
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('_build_fours_arrangement','_persist_round_matches','_reconcile_team','_clear_team_slot',
                      '_csv_field','add_member_to_community','notif_blocked','viewer_distance_m','placement_points',
                      'account_plan','community_plan','event_group_community','event_capacity',
                      'is_event_invitee','is_event_participant')
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if v_open is not null then
    raise exception 'internal helpers still executable by anon/authenticated: %', v_open;
  end if;
end $$;
