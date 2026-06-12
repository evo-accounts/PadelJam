-- 0051_events_security_hardening.sql
-- Phase 8 security review hardening. Fixes 4 exploitable findings, all of which
-- stem from authenticated being able to bypass the SECURITY DEFINER RPC layer.
--
--   C1 + C2  Direct table writes (grants + unguarded "event_matches: score" policy)
--            let a players_submit_results participant PATCH event_matches directly via
--            PostgREST, forging scores and resetting submitted_by, bypassing
--            submit_score's advisory-lock + first-submitter lock. ALL writes to the
--            engine/roster/ranking tables go through SECURITY DEFINER RPCs (which run
--            as the function owner and bypass both RLS and role grants), so the direct
--            authenticated DML grants are unnecessary -> revoke them.
--   M3       _persist_round_matches / _build_fours_arrangement are internal SECURITY
--            DEFINER helpers with no organizer check but were granted to authenticated,
--            so a user could call _persist_round_matches(...) to inject arbitrary
--            matches. The parent RPCs call them as the function owner, so revoking
--            from authenticated does not break the internal calls.
--   H1       request_partner had no eligibility gate: any user knowing a team event's
--            UUID could insert themselves as 'interested' and spam partner-requests
--            (incl. against a PRIVATE event they were never invited to -> existence
--            oracle + spam). Mirror choose_partner's eligibility gate.
--   M2       duplicate_event only checked is_event_organizer; a user who lost
--            community-admin could still duplicate a group event into that group.
--            Re-apply create_event's community-admin gate for group events.

begin;

-- ---------------------------------------------------------------------------
-- C1 + C2: revoke direct DML on the RPC-mediated tables; drop the score policy.
-- (select grants and the intended "respond" policies on event_invitations /
--  partner_requests are deliberately left intact; service_role is untouched.)
-- ---------------------------------------------------------------------------
revoke insert, update, delete on event_participants    from authenticated;
revoke insert, update, delete on event_teams           from authenticated;
revoke insert, update, delete on event_rounds          from authenticated;
revoke insert, update, delete on event_matches         from authenticated;
revoke insert, update, delete on match_players         from authenticated;
revoke insert, update, delete on round_rest            from authenticated;
revoke insert, update, delete on group_event_results   from authenticated;

drop policy if exists "event_matches: score" on event_matches;

-- ---------------------------------------------------------------------------
-- M3: lock the internal match-engine helpers down to the function owner only.
-- (parent RPCs start_event/generate_next_round/persist_round are SECURITY
--  DEFINER and call these as the owner, so internal calls keep working.)
-- ---------------------------------------------------------------------------
revoke execute on function _persist_round_matches(uuid, uuid, jsonb) from authenticated, public;
revoke execute on function _build_fours_arrangement(uuid[])          from authenticated, public;

-- ---------------------------------------------------------------------------
-- H1: request_partner gains a caller- and target-eligibility gate mirroring
-- choose_partner. Caller must be an invitee/participant of the team event, the
-- event must be 'scheduled', and we only insert a partner_requests row for
-- targets that are themselves eligible (ineligible targets skipped silently).
-- ---------------------------------------------------------------------------
create or replace function request_partner(p_event_id uuid, p_targets uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_t uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.specification <> 'team' then raise exception 'not_a_team_event' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'event_closed' using errcode='P0001'; end if;
  if not (is_event_invitee(p_event_id, v_user) or is_event_participant(p_event_id, v_user)) then
    raise exception 'forbidden' using errcode='P0001'; end if;

  insert into event_participants (event_id, user_id, status, joined_at, invited_by)
    values (p_event_id, v_user, 'interested', now(), v_ev.organizer_id)
    on conflict (event_id, user_id) do update set status='interested';

  foreach v_t in array p_targets loop
    -- only request a target that is itself eligible for this event.
    if is_event_invitee(p_event_id, v_t) or is_event_participant(p_event_id, v_t) then
      insert into partner_requests (event_id, requester_id, target_id, status)
        values (p_event_id, v_user, v_t, 'pending')
        on conflict (event_id, requester_id, target_id) do nothing;
    end if;
  end loop;
end; $$;

-- ---------------------------------------------------------------------------
-- M2: duplicate_event re-checks community-admin for group events, mirroring
-- create_event's gate (community_id lookup + is_community_admin).
-- ---------------------------------------------------------------------------
create or replace function duplicate_event(p_event_id uuid, p_overrides jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_src events%rowtype;
  v_new uuid;
  v_cid uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  select * into v_src from events where id = p_event_id;
  if v_src.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;

  -- M2: re-apply create_event's community-admin gate for group events.
  if v_src.group_id is not null then
    select community_id into v_cid from groups where id = v_src.group_id and archived_at is null;
    if v_cid is null then raise exception 'group_not_found' using errcode='P0001'; end if;
    if not is_community_admin(v_cid) then raise exception 'forbidden' using errcode='P0001'; end if;
  end if;

  insert into events (group_id, series_id, organizer_id, event_type, specification, scoring_mode,
    scoring_value, venue_id, manual_location_name, manual_location_address, has_location, num_courts,
    starts_at, duration_minutes, allow_standby, standby_spots, is_private, entrance_fee_enabled,
    entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number, players_submit_results,
    organizer_role, name, description, thumbnail_path, counts_for_ranking, status,
    finished_early, finish_message, published_at)
  values (v_src.group_id, v_src.series_id, v_user, v_src.event_type, v_src.specification, v_src.scoring_mode,
    v_src.scoring_value, v_src.venue_id, v_src.manual_location_name, v_src.manual_location_address,
    v_src.has_location, v_src.num_courts,
    coalesce(nullif(p_overrides->>'starts_at','')::timestamptz, now()),
    v_src.duration_minutes, v_src.allow_standby, v_src.standby_spots, v_src.is_private, v_src.entrance_fee_enabled,
    v_src.entrance_fee_amount, v_src.entrance_fee_method, v_src.entrance_fee_mba_number, v_src.players_submit_results,
    v_src.organizer_role, coalesce(p_overrides->>'name', v_src.name), v_src.description,
    coalesce(p_overrides->>'thumbnail_path', v_src.thumbnail_path), v_src.counts_for_ranking, 'scheduled',
    false, null, null)
  returning id into v_new;

  -- JM-39: copy invitations only (reset to pending); do NOT copy participants/waiting-list.
  insert into event_invitations (event_id, invitee_id, invitee_name, invitee_email, invitee_phone, status, invited_by)
  select v_new, invitee_id, invitee_name, invitee_email, invitee_phone, 'pending', v_user
  from event_invitations where event_id = p_event_id;

  return v_new;
end; $$;

commit;
