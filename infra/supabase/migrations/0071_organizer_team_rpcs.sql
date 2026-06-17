-- 5G-3 (JM-29..32): organizer-driven team management for team-spec events.
-- Pairing rule: a full team (both slots) => is_confirmed + both 'confirmed';
-- a lone occupant => 'invited' (unpaired). "Remove from team" keeps players in the event.

-- Internal helper: recompute one team's is_confirmed + occupant statuses.
create or replace function _reconcile_team(p_team_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_a uuid; v_b uuid; v_full boolean;
begin
  select player_a_id, player_b_id into v_a, v_b from event_teams where id = p_team_id;
  v_full := (v_a is not null and v_b is not null);
  update event_teams set is_confirmed = v_full where id = p_team_id;
  if v_full then
    update event_participants
      set status='confirmed', confirmed_at=now(), waiting_list_position=null, is_standby=false
      where id in (v_a, v_b);
  elsif coalesce(v_a, v_b) is not null then
    update event_participants
      set status='invited', confirmed_at=null, waiting_list_position=null, is_standby=false
      where id = coalesce(v_a, v_b);
  end if;
end; $$;

-- Internal helper: remove a participant from whatever team slot it occupies (move semantics),
-- reconciling the vacated team (which may demote a now-lone partner to invited).
create or replace function _clear_team_slot(p_event_id uuid, p_participant_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_team_id uuid;
begin
  for v_team_id in
    select id from event_teams
    where event_id = p_event_id and (player_a_id = p_participant_id or player_b_id = p_participant_id)
  loop
    update event_teams set
      player_a_id = case when player_a_id = p_participant_id then null else player_a_id end,
      player_b_id = case when player_b_id = p_participant_id then null else player_b_id end
      where id = v_team_id;
    perform _reconcile_team(v_team_id);
  end loop;
end; $$;

create or replace function organizer_assign_to_team(
  p_event_id uuid, p_participant_id uuid, p_team_number int, p_slot text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_team_id uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.specification <> 'team' then raise exception 'not_a_team_event' using errcode='P0001'; end if;
  if p_slot not in ('a','b') then raise exception 'invalid_slot' using errcode='P0001'; end if;
  if p_team_number < 1 or p_team_number > v_ev.num_courts * 2 then
    raise exception 'invalid_team' using errcode='P0001'; end if;
  if not exists (select 1 from event_participants where id = p_participant_id and event_id = p_event_id) then
    raise exception 'participant_not_found' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));

  perform _clear_team_slot(p_event_id, p_participant_id);

  select id into v_team_id from event_teams where event_id=p_event_id and team_number=p_team_number;
  if v_team_id is null then
    insert into event_teams (event_id, team_number, is_confirmed)
      values (p_event_id, p_team_number, false) returning id into v_team_id;
  end if;

  if p_slot = 'a' then
    update event_teams set player_a_id = p_participant_id where id = v_team_id;
  else
    update event_teams set player_b_id = p_participant_id where id = v_team_id;
  end if;

  perform _reconcile_team(v_team_id);
end; $$;

create or replace function organizer_remove_from_team(p_event_id uuid, p_participant_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  perform _clear_team_slot(p_event_id, p_participant_id);
  update event_participants
    set status='invited', confirmed_at=null, waiting_list_position=null, is_standby=false
    where id = p_participant_id and event_id = p_event_id;
end; $$;

create or replace function organizer_switch_players(p_event_id uuid, p_a uuid, p_b uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
        a_team uuid; a_slot text; b_team uuid; b_slot text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if p_a = p_b then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));

  select id, case when player_a_id=p_a then 'a' when player_b_id=p_a then 'b' end
    into a_team, a_slot from event_teams
    where event_id=p_event_id and (player_a_id=p_a or player_b_id=p_a);
  select id, case when player_a_id=p_b then 'a' when player_b_id=p_b then 'b' end
    into b_team, b_slot from event_teams
    where event_id=p_event_id and (player_a_id=p_b or player_b_id=p_b);

  -- Same-team swap is a no-op (the pair is unchanged) and the sequential single-slot UPDATEs
  -- would transiently set both slots equal, tripping the et_distinct CHECK. Skip it.
  if a_team is not null and a_team = b_team then return; end if;

  -- write B into A's old slot, A into B's old slot (no-op if that player had no slot)
  if a_team is not null then
    if a_slot='a' then update event_teams set player_a_id=p_b where id=a_team;
    else update event_teams set player_b_id=p_b where id=a_team; end if;
  end if;
  if b_team is not null then
    if b_slot='a' then update event_teams set player_a_id=p_a where id=b_team;
    else update event_teams set player_b_id=p_a where id=b_team; end if;
  end if;

  if a_team is not null then perform _reconcile_team(a_team); end if;
  if b_team is not null and b_team is distinct from a_team then perform _reconcile_team(b_team); end if;

  -- either player now in no slot => invited
  update event_participants
    set status='invited', confirmed_at=null, waiting_list_position=null, is_standby=false
    where id in (p_a, p_b) and event_id=p_event_id
      and not exists (
        select 1 from event_teams
        where event_id=p_event_id
          and (player_a_id=event_participants.id or player_b_id=event_participants.id));
end; $$;

-- Internal helpers must not be client-callable.
revoke execute on function _reconcile_team(uuid), _clear_team_slot(uuid, uuid) from public;
grant execute on function organizer_assign_to_team(uuid, uuid, int, text),
  organizer_remove_from_team(uuid, uuid), organizer_switch_players(uuid, uuid, uuid) to authenticated;

-- Extend the 5G-2 activity allow-list with team actions (re-create the function with the
-- additional organizer actions; body otherwise identical to 0070).
create or replace function log_event_activity(
  p_event_id uuid, p_action text, p_detail jsonb default '{}'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_organizer_actions text[] := array[
    'confirmed','removed','guest_added','marked_paid','marked_unpaid','marked_all_paid',
    'team_assigned','team_switched','team_removed'];
  v_self_actions text[] := array['joined','left'];
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not (p_action = any(v_organizer_actions) or p_action = any(v_self_actions)) then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  if p_action = any(v_organizer_actions) then
    if not is_event_organizer(p_event_id, v_user) then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;
  else
    if not event_is_visible(p_event_id, v_user) then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;
  end if;
  insert into event_activity (event_id, actor_id, action, detail)
  values (p_event_id, v_user, p_action, coalesce(p_detail, '{}'::jsonb));
end; $$;
