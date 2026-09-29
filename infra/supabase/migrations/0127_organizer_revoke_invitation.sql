-- 0127_organizer_revoke_invitation.sql
-- UX Audit — Manage Event, plan PR "M3 — mobile team management" (UX-MEVT-10, 14, 15, 26;
-- docs/audit/2026-09-29-ux-manage-event-plan.md). Stacked on 0121/0122. The server side of the
-- mobile Teams / Players tabs.
--
--   R1  organizer_revoke_invitation(event, invitation) — the Invited tab's "Remove" on a PENDING
--       invitation that has no participant row (event_invited_players). Direct writes to
--       event_invitations are revoked since 0122 and organizer_remove_participant needs a roster
--       row, so until now such an invitee could not be withdrawn at all. Organizer only, scheduled
--       event (0121's _organizer_roster_guard). The invitation is deleted; the invitee's unanswered
--       event_invite notification is settled (its Join CTA would answer invitation_not_found) and
--       nobody is notified. Logged as 'removed' with detail.mode = 'invitation'. An invitee who
--       already has a roster row is organizer_remove_participant's (invitee_in_roster).
--
--   R2  organizer_switch_with_invitee(event, participant, user) — the Switch player sheet's
--       "invited" branch (UX-MEVT-15): the invitee takes the participant's team slot and the
--       participant goes back to Invited, in ONE transaction. The invitee may have a roster row
--       (invited / interested / waiting) or only a pending invitation, in which case the row is
--       created; the pending invitation is accepted. The swap itself is organizer_switch_players'
--       (the pair is reconciled: both confirmed when complete). The invitee is told
--       (organizer_confirmed) when they end up confirmed.
--
--   R3  organizer_assign_to_team (0121 body):
--         - a taken slot is refused (slot_taken). It used to overwrite the occupant, who was left
--           'confirmed' with no team — drag-and-drop and the "+" only target empty slots, and a
--           stale screen must not silently displace someone;
--         - the team bound follows the event's capacity: 1..greatest(num_courts * 2,
--           floor(capacity / 2), highest existing team). Stand-by pairs have teams too, and the
--           player flow numbers new pairs max + 1, so a team past num_courts * 2 can already exist;
--         - completing a pair past capacity is refused (event_full) — the assignment never pushes
--           the confirmed count over the event's capacity.
--       organizer_add_guest_to_team (0122 body) takes the same team bound. organizer_confirm_invitee
--       delegates to organizer_assign_to_team and inherits R3.
--
--   R4  organizer_remove_participant (0122 body): removing a player who sat in a team no longer
--       leaves the teammate 'confirmed' in a half-empty team still marked is_confirmed (the slot
--       FK nulls on delete; nothing reconciled it). The team is reconciled after the delete, as
--       organizer_remove_from_team does: the teammate goes to 'invited' (0071's rule for a lone
--       occupant, pinned by tests/organizer_team.sql).
--
-- MEVT-14 "Remove on an Interested player sends them back to Invited" needs no change:
-- organizer_remove_participant(…, 'to_invited') works on an interested row (it withdraws their
-- pending partner requests and reopens the invitation). A public group event has no invited state
-- (D3), so there the client offers "Remove from event" only.

begin;

-- ---------------------------------------------------------------------------------------------
-- The organizer's team bound (R3)
-- ---------------------------------------------------------------------------------------------
create or replace function _organizer_team_count(p_event_id uuid) returns int
language sql stable security definer set search_path = public as $$
  select greatest(e.num_courts * 2,
                  event_capacity(e.id) / 2,
                  coalesce((select max(t.team_number) from event_teams t where t.event_id = e.id), 0))
  from events e where e.id = p_event_id;
$$;
revoke execute on function _organizer_team_count(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- R3: organizer_assign_to_team (0121 body)
-- ---------------------------------------------------------------------------------------------
create or replace function organizer_assign_to_team(
  p_event_id uuid, p_participant_id uuid, p_team_number int, p_slot text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_team event_teams%rowtype; v_occupant uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform _organizer_roster_guard(p_event_id);
  select * into v_ev from events where id = p_event_id;
  if v_ev.specification <> 'team' then raise exception 'not_a_team_event' using errcode='P0001'; end if;
  if p_slot is null or p_slot not in ('a','b') then raise exception 'invalid_slot' using errcode='P0001'; end if;
  if p_team_number is null or p_team_number < 1 or p_team_number > _organizer_team_count(p_event_id) then
    raise exception 'invalid_team' using errcode='P0001'; end if;                   -- NEW (R3: was num_courts * 2)
  if not exists (select 1 from event_participants where id = p_participant_id and event_id = p_event_id) then
    raise exception 'participant_not_found' using errcode='P0001'; end if;

  -- NEW (R3): never displace an occupant. The same player in the same slot is a no-op.
  select * into v_team from event_teams where event_id = p_event_id and team_number = p_team_number;
  v_occupant := case when p_slot = 'a' then v_team.player_a_id else v_team.player_b_id end;
  if v_occupant = p_participant_id then return; end if;
  if v_occupant is not null then raise exception 'slot_taken' using errcode='P0001'; end if;

  perform _clear_team_slot(p_event_id, p_participant_id);

  if v_team.id is null then
    insert into event_teams (event_id, team_number, is_confirmed)
      values (p_event_id, p_team_number, false) returning * into v_team;
  end if;
  if p_slot = 'a' then
    update event_teams set player_a_id = p_participant_id where id = v_team.id;
  else
    update event_teams set player_b_id = p_participant_id where id = v_team.id;
  end if;
  perform _reconcile_team(v_team.id);

  -- NEW (R3): a completed pair never takes the confirmed count past capacity (rolls it all back).
  if (select count(*) from event_participants where event_id = p_event_id and status = 'confirmed')
     > event_capacity(p_event_id) then
    raise exception 'event_full' using errcode='P0001'; end if;

  perform _log_activity(p_event_id, v_user, 'team_assigned',
    jsonb_build_object('target_name', _participant_label(p_participant_id), 'team_number', p_team_number));
end; $$;
revoke execute on function organizer_assign_to_team(uuid, uuid, int, text) from public, anon;
grant execute on function organizer_assign_to_team(uuid, uuid, int, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- R3: organizer_add_guest_to_team (0122 body) — the team bound only
-- ---------------------------------------------------------------------------------------------
create or replace function organizer_add_guest_to_team(
  p_event_id uuid, p_team_number int, p_slot text, p_name text, p_gender text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_name text := btrim(p_name);
        v_team event_teams%rowtype; v_other uuid; v_need int := 1;
        v_cap int; v_reg int; v_confirmed int; v_pid uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if coalesce(v_name,'') = '' then raise exception 'name_required' using errcode='P0001'; end if;
  if char_length(v_name) > 60 then raise exception 'invalid_guest_name' using errcode='P0001'; end if;
  perform _organizer_roster_guard(p_event_id);
  select * into v_ev from events where id = p_event_id;
  if v_ev.specification <> 'team' then raise exception 'not_a_team_event' using errcode='P0001'; end if;
  if p_slot is null or p_slot not in ('a','b') then raise exception 'invalid_slot' using errcode='P0001'; end if;
  if p_team_number is null or p_team_number < 1 or p_team_number > _organizer_team_count(p_event_id) then
    raise exception 'invalid_team' using errcode='P0001'; end if;                   -- NEW (R3: was num_courts * 2)

  select * into v_team from event_teams where event_id = p_event_id and team_number = p_team_number;
  if v_team.id is not null then
    if (p_slot = 'a' and v_team.player_a_id is not null) or (p_slot = 'b' and v_team.player_b_id is not null) then
      raise exception 'slot_taken' using errcode='P0001'; end if;
    v_other := case when p_slot = 'a' then v_team.player_b_id else v_team.player_a_id end;
    if v_other is not null and exists (select 1 from event_participants where id = v_other and status <> 'confirmed') then
      v_need := 2; end if;
  end if;

  v_cap := event_capacity(p_event_id);
  v_reg := v_ev.num_courts * 4;
  select count(*) into v_confirmed from event_participants where event_id = p_event_id and status = 'confirmed';
  if v_confirmed + v_need > v_cap then raise exception 'event_full' using errcode='P0001'; end if;

  insert into event_participants (event_id, guest_name, guest_gender, status, is_standby, confirmed_at, joined_at, invited_by)
    values (p_event_id, v_name, case when p_gender in ('male','female') then p_gender end,
            'confirmed', v_confirmed >= v_reg, now(), now(), v_user)
    returning id into v_pid;

  if v_team.id is null then
    insert into event_teams (event_id, team_number, is_confirmed) values (p_event_id, p_team_number, false)
      returning * into v_team;
  end if;
  if p_slot = 'a' then update event_teams set player_a_id = v_pid where id = v_team.id;
  else update event_teams set player_b_id = v_pid where id = v_team.id; end if;
  if v_other is not null then perform _reconcile_team(v_team.id); end if;

  perform _log_activity(p_event_id, v_user, 'guest_added',
    jsonb_build_object('guest_name', v_name, 'team_number', p_team_number));
  return v_pid;
end; $$;
revoke execute on function organizer_add_guest_to_team(uuid, int, text, text, text) from public, anon;
grant execute on function organizer_add_guest_to_team(uuid, int, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- R4: organizer_remove_participant (0122 body) + the removed player's team reconciled
-- ---------------------------------------------------------------------------------------------
create or replace function organizer_remove_participant(p_participant_id uuid, p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid; v_target_user uuid; v_org uuid; v_target_name text;
        v_was_confirmed boolean; v_ev events%rowtype; v_actor text; v_team uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_mode not in ('to_invited','from_event') then raise exception 'invalid_mode' using errcode='P0001'; end if;
  select event_id into v_event from event_participants where id = p_participant_id;
  if v_event is null then raise exception 'participant_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform _organizer_roster_guard(v_event);
  select user_id, status = 'confirmed' into v_target_user, v_was_confirmed
    from event_participants where id = p_participant_id;
  if not found then raise exception 'participant_not_found' using errcode='P0001'; end if;
  select * into v_ev from events where id = v_event;
  v_org := v_ev.organizer_id;
  if p_mode = 'to_invited' and v_ev.group_id is not null and not v_ev.is_private then
    raise exception 'invalid_mode' using errcode='P0001'; end if;

  v_target_name := _participant_label(p_participant_id);

  delete from event_participants where id = p_participant_id;
  -- NEW (R4): the slot FK nulled on delete; a team left half-empty (or emptied by
  -- _drop_guest_teammate) must not stay confirmed with its other half still 'confirmed'.
  for v_team in select id from event_teams
                where event_id = v_event and is_confirmed and (player_a_id is null or player_b_id is null) loop
    perform _reconcile_team(v_team);
  end loop;

  if v_target_user is not null then
    delete from partner_requests where event_id=v_event and requester_id=v_target_user and status='pending';
    update partner_requests set status='declined', responded_at=now(), closed_by_system=true
      where event_id=v_event and target_id=v_target_user and status='pending';
  end if;
  if p_mode = 'to_invited' then
    if v_target_user is not null then
      if exists (select 1 from event_invitations where event_id=v_event and invitee_id=v_target_user) then
        update event_invitations set status='pending', responded_at=null
          where event_id=v_event and invitee_id=v_target_user;
      else
        insert into event_invitations (event_id, invitee_id, status, invited_by)
          values (v_event, v_target_user, 'pending', v_org);
      end if;
    end if;
  else -- from_event
    if v_target_user is not null then
      delete from event_invitations where event_id=v_event and invitee_id=v_target_user;
    end if;
  end if;

  if v_target_user is not null and v_target_user <> v_org and not notif_blocked(v_target_user, v_user) then
    select full_name into v_actor from profiles where id = v_user;
    insert into notifications (user_id, type, actor_id, event_id, group_id, actor_name, entity_name)
    values (v_target_user, 'removed_from_event', v_user, v_event, v_ev.group_id, v_actor, v_ev.name);
  end if;
  perform _log_activity(v_event, v_user, 'removed', jsonb_build_object('target_name', v_target_name, 'mode', p_mode));
  perform _renumber_waiting_list(v_event);
  perform notify_waitlist_spot(v_event, v_user);
end; $$;
revoke execute on function organizer_remove_participant(uuid, text) from public, anon;
grant execute on function organizer_remove_participant(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- R1: organizer_revoke_invitation
-- ---------------------------------------------------------------------------------------------
create or replace function organizer_revoke_invitation(p_event_id uuid, p_invitation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_inv event_invitations%rowtype; v_name text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from events where id = p_event_id and deleted_at is null) then
    raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform _organizer_roster_guard(p_event_id);

  select * into v_inv from event_invitations
    where id = p_invitation_id and event_id = p_event_id and status = 'pending' for update;
  if v_inv.id is null then raise exception 'invitation_not_found' using errcode='P0001'; end if;
  if v_inv.invitee_id is not null and exists (
       select 1 from event_participants where event_id = p_event_id and user_id = v_inv.invitee_id) then
    raise exception 'invitee_in_roster' using errcode='P0001'; end if;

  select coalesce(p.full_name, v_inv.invitee_name) into v_name
    from (select 1) one left join profiles p on p.id = v_inv.invitee_id;

  delete from event_invitations where id = v_inv.id;
  if v_inv.invitee_id is not null then
    -- Its Join CTA would now answer invitation_not_found: settled, not deleted (it happened).
    update notifications set cta_done = true, read_at = coalesce(read_at, now())
      where event_id = p_event_id and user_id = v_inv.invitee_id and type = 'event_invite' and not cta_done;
  end if;
  perform _log_activity(p_event_id, v_user, 'removed',
    jsonb_build_object('target_name', v_name, 'mode', 'invitation'));
end; $$;
revoke execute on function organizer_revoke_invitation(uuid, uuid) from public, anon;
grant execute on function organizer_revoke_invitation(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- R2: organizer_switch_with_invitee
-- ---------------------------------------------------------------------------------------------
create or replace function organizer_switch_with_invitee(
  p_event_id uuid, p_participant_id uuid, p_user_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_pid uuid; v_before text; v_after text;
        v_actor_name text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform _organizer_roster_guard(p_event_id);
  select * into v_ev from events where id = p_event_id;
  if v_ev.specification <> 'team' then raise exception 'not_a_team_event' using errcode='P0001'; end if;
  if not exists (select 1 from event_participants where id = p_participant_id and event_id = p_event_id) then
    raise exception 'participant_not_found' using errcode='P0001'; end if;
  if not exists (select 1 from event_teams where event_id = p_event_id
                   and p_participant_id in (player_a_id, player_b_id)) then
    raise exception 'not_in_team' using errcode='P0001'; end if;

  select id, status into v_pid, v_before from event_participants
    where event_id = p_event_id and user_id = p_user_id;
  if v_pid is null then
    if not exists (select 1 from event_invitations
                   where event_id = p_event_id and invitee_id = p_user_id and status = 'pending') then
      raise exception 'invitation_not_found' using errcode='P0001'; end if;
    insert into event_participants (event_id, user_id, status, joined_at, invited_by)
      values (p_event_id, p_user_id, 'invited', now(), v_user)
      returning id into v_pid;
  end if;
  if v_pid = p_participant_id then return v_pid; end if;
  update event_invitations set status = 'accepted', responded_at = now()
    where event_id = p_event_id and invitee_id = p_user_id and status = 'pending';

  perform organizer_switch_players(p_event_id, p_participant_id, v_pid);

  -- As organizer_assign_to_team (R3): the swap never takes the confirmed count past capacity.
  if (select count(*) from event_participants where event_id = p_event_id and status = 'confirmed')
     > event_capacity(p_event_id) then
    raise exception 'event_full' using errcode='P0001'; end if;

  select status into v_after from event_participants where id = v_pid;
  if v_after = 'confirmed' and v_before is distinct from 'confirmed' and p_user_id <> v_ev.organizer_id
     and not notif_blocked(p_user_id, v_user) then
    select full_name into v_actor_name from profiles where id = v_user;
    insert into notifications (user_id, type, actor_id, event_id, group_id, actor_name, entity_name)
    values (p_user_id, 'organizer_confirmed', v_user, p_event_id, v_ev.group_id, v_actor_name, v_ev.name);
  end if;
  return v_pid;
end; $$;
revoke execute on function organizer_switch_with_invitee(uuid, uuid, uuid) from public, anon;
grant execute on function organizer_switch_with_invitee(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Self-check (a partial paste into the hosted SQL editor must not pass silently)
-- ---------------------------------------------------------------------------------------------
do $$
declare p text;
begin
  if has_function_privilege('anon', 'public._organizer_team_count(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._organizer_team_count(uuid)', 'execute') then
    raise exception '0127: _organizer_team_count is executable by anon/authenticated'; end if;
  foreach p in array array[
      'public.organizer_revoke_invitation(uuid, uuid)',
      'public.organizer_switch_with_invitee(uuid, uuid, uuid)',
      'public.organizer_assign_to_team(uuid, uuid, integer, text)',
      'public.organizer_add_guest_to_team(uuid, integer, text, text, text)',
      'public.organizer_remove_participant(uuid, text)'] loop
    if not has_function_privilege('authenticated', p, 'execute') or has_function_privilege('anon', p, 'execute') then
      raise exception '0127: % must be executable by authenticated only', p;
    end if;
  end loop;
  if position('slot_taken' in pg_get_functiondef('public.organizer_assign_to_team(uuid, uuid, integer, text)'::regprocedure)) = 0 then
    raise exception '0127: organizer_assign_to_team is not the 0127 body'; end if;
end $$;

commit;
