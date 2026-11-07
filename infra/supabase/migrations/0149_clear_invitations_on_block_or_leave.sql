-- 0149_clear_invitations_on_block_or_leave.sql
-- PAD-152 (plan PAD-151, found in PAD-99). An invitation grants sight of a private event
-- (event_is_visible, is_event_invitee accept a row of ANY status) and nothing cleared it when the
-- invitee was blocked or left the group. Backend only; no client change.
--
--   1. _clear_event_invitation(event, user): deletes the invitation (any status, any date), settles
--      the open event_invite notification as 0127 does, removes an 'invited' roster row (and the
--      player's partner requests). Silent: no notification, no activity call. interested, confirmed
--      and waiting_list rows and contact-only invitations are left alone.
--   2. AFTER DELETE on group_members: clears every event of that group (not on a group/profile cascade).
--   3. AFTER INSERT on blocks: clears, in both directions, events where the other person is the
--      organizer or the inviter (and 'invited' rows where they are the organizer).
--   4. _invitee_in_scope guards the two inserts that would write an invitation back:
--      _reset_invitation_after_leave (0112) and organizer_remove_participant to_invited (0127).
--
-- No one-off delete and no helper call at the top level: the hosted leftovers stay with PAD-99.

begin;

create or replace function _clear_event_invitation(p_event_id uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  delete from event_invitations where event_id = p_event_id and invitee_id = p_user;
  update notifications set cta_done = true, read_at = coalesce(read_at, now())
    where event_id = p_event_id and user_id = p_user and type = 'event_invite' and not cta_done;
  if exists (select 1 from event_participants
             where event_id = p_event_id and user_id = p_user and status = 'invited') then
    delete from event_participants where event_id = p_event_id and user_id = p_user and status = 'invited';
    delete from partner_requests where event_id = p_event_id and requester_id = p_user and status = 'pending';
    update partner_requests set status = 'declined', responded_at = now(), closed_by_system = true
      where event_id = p_event_id and target_id = p_user and status = 'pending';
  end if;
end; $$;
revoke execute on function _clear_event_invitation(uuid, uuid) from public, anon, authenticated;

-- In scope: not blocked with the organizer, and a group member when the event has a group.
create or replace function _invitee_in_scope(p_event_id uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events e
    where e.id = p_event_id
      and not notif_blocked(e.organizer_id, p_user)
      and (e.group_id is null
           or exists (select 1 from group_members gm where gm.group_id = e.group_id and gm.user_id = p_user)));
$$;
revoke execute on function _invitee_in_scope(uuid, uuid) from public, anon, authenticated;

create or replace function _clear_invitations_on_group_leave() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ev uuid;
begin
  -- A cascade from deleting the group or the profile is not a departure (as track_group_departure, 0108).
  if not exists (select 1 from groups where id = old.group_id)
     or not exists (select 1 from profiles where id = old.user_id) then
    return old;
  end if;
  for v_ev in
    select e.id from events e
    where e.group_id = old.group_id
      and (exists (select 1 from event_invitations i where i.event_id = e.id and i.invitee_id = old.user_id)
           or exists (select 1 from event_participants p
                      where p.event_id = e.id and p.user_id = old.user_id and p.status = 'invited'))
  loop
    perform _clear_event_invitation(v_ev, old.user_id);
  end loop;
  return old;
end; $$;
revoke execute on function _clear_invitations_on_group_leave() from public, anon, authenticated;

create or replace function _clear_invitations_on_block() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ev uuid; v_pair uuid[]; v_a uuid; v_b uuid;
begin
  foreach v_pair slice 1 in array array[array[new.blocker_id, new.blocked_id], array[new.blocked_id, new.blocker_id]] loop
    v_a := v_pair[1]; v_b := v_pair[2];   -- v_a is the invitee, v_b the organizer or inviter
    for v_ev in
      select e.id from events e
      where exists (select 1 from event_invitations i
                    where i.event_id = e.id and i.invitee_id = v_a
                      and (e.organizer_id = v_b or i.invited_by = v_b))
         or (e.organizer_id = v_b and exists (select 1 from event_participants p
                    where p.event_id = e.id and p.user_id = v_a and p.status = 'invited'))
    loop
      perform _clear_event_invitation(v_ev, v_a);
    end loop;
  end loop;
  return new;
end; $$;
revoke execute on function _clear_invitations_on_block() from public, anon, authenticated;

create trigger trg_clear_invitations_on_group_leave after delete on group_members
  for each row execute function _clear_invitations_on_group_leave();
create trigger trg_clear_invitations_on_block after insert on blocks
  for each row execute function _clear_invitations_on_block();

create or replace function _reset_invitation_after_leave(p_event_id uuid, p_user uuid, p_create boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_ev events%rowtype;
begin
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null or p_user is null then return; end if;
  -- On a public group event only a GROUP MEMBER's invitation is a leftover of the old auto-invite;
  -- an explicit invitation to someone outside the group is kept and reset like a private one.
  if not v_ev.is_private and v_ev.group_id is not null
     and exists (select 1 from group_members gm where gm.group_id = v_ev.group_id and gm.user_id = p_user) then
    delete from event_invitations where event_id = p_event_id and invitee_id = p_user;
  elsif exists (select 1 from event_invitations where event_id = p_event_id and invitee_id = p_user) then
    update event_invitations set status = 'pending', responded_at = null
      where event_id = p_event_id and invitee_id = p_user;
  elsif p_create and v_ev.is_private and _invitee_in_scope(p_event_id, p_user) then   -- NEW (0149)
    insert into event_invitations (event_id, invitee_id, status, invited_by)
      values (p_event_id, p_user, 'pending', v_ev.organizer_id);
  end if;
end; $$;
revoke execute on function _reset_invitation_after_leave(uuid, uuid, boolean) from public, anon, authenticated;

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
      elsif _invitee_in_scope(v_event, v_target_user) then   -- NEW (0149)
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

do $$
declare p text;
begin
  foreach p in array array['public._clear_event_invitation(uuid, uuid)', 'public._invitee_in_scope(uuid, uuid)',
      'public._clear_invitations_on_group_leave()', 'public._clear_invitations_on_block()',
      'public._reset_invitation_after_leave(uuid, uuid, boolean)'] loop
    if has_function_privilege('anon', p, 'execute') or has_function_privilege('authenticated', p, 'execute') then
      raise exception '0149: % is executable by anon/authenticated', p; end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.organizer_remove_participant(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.organizer_remove_participant(uuid, text)', 'execute') then
    raise exception '0149: organizer_remove_participant must be executable by authenticated only'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_clear_invitations_on_group_leave' and tgrelid = 'public.group_members'::regclass)
     or not exists (select 1 from pg_trigger where tgname = 'trg_clear_invitations_on_block' and tgrelid = 'public.blocks'::regclass) then
    raise exception '0149: trigger missing'; end if;
  if position('_invitee_in_scope' in pg_get_functiondef('public._reset_invitation_after_leave(uuid, uuid, boolean)'::regprocedure)) = 0
     or position('_invitee_in_scope' in pg_get_functiondef('public.organizer_remove_participant(uuid, text)'::regprocedure)) = 0 then
    raise exception '0149: a guarded body is missing _invitee_in_scope'; end if;
end $$;

commit;
