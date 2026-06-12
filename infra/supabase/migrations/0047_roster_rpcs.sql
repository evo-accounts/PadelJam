-- 0047_roster_rpcs.sql
-- Events module Phase 1: roster RPCs (join/leave/partner/invite/organizer ops).
-- All SECURITY DEFINER; auth/validation errors raised with errcode P0001 and stable codes.

create or replace function join_event(p_event_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype;
        v_confirmed int; v_cap int; v_reg int; v_status text; v_standby boolean := false; v_pos int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'event_closed' using errcode='P0001'; end if;
  if now() > v_ev.starts_at - interval '6 hours' then raise exception 'event_closed' using errcode='P0001'; end if;
  if v_ev.is_private and not is_event_invitee(p_event_id, v_user) then raise exception 'not_invited' using errcode='P0001'; end if;
  if not v_ev.is_private and v_ev.group_id is not null and not is_group_member(v_ev.group_id) then
    raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.specification = 'team' then raise exception 'use_team_join' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  if exists (select 1 from event_participants where event_id=p_event_id and user_id=v_user) then
    raise exception 'already_joined' using errcode='P0001'; end if;

  v_reg := v_ev.num_courts * 4;
  v_cap := event_capacity(p_event_id);
  select count(*) into v_confirmed from event_participants where event_id=p_event_id and status='confirmed';
  if v_confirmed >= v_cap then
    v_status := 'waiting_list';
    select coalesce(max(waiting_list_position),0)+1 into v_pos from event_participants
      where event_id=p_event_id and status='waiting_list';
  else
    v_status := 'confirmed'; v_standby := (v_confirmed >= v_reg);
  end if;

  insert into event_participants (event_id, user_id, status, is_standby, waiting_list_position, confirmed_at, joined_at, invited_by)
  values (p_event_id, v_user, v_status, v_standby,
    case when v_status='waiting_list' then v_pos end,
    case when v_status='confirmed' then now() end, now(), v_ev.organizer_id);

  if not v_ev.is_private and v_ev.group_id is not null then
    insert into community_members (community_id, user_id, role)
      values (event_group_community(p_event_id), v_user, 'member') on conflict do nothing;
    insert into group_members (group_id, user_id) values (v_ev.group_id, v_user) on conflict do nothing;
  end if;
  update event_invitations set status='accepted', responded_at=now()
    where event_id=p_event_id and invitee_id=v_user and status='pending';
  return v_status;
end; $$;

create or replace function leave_event(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_pid uuid;
        v_team event_teams%rowtype; v_partner_pid uuid; v_partner_user uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if now() > v_ev.starts_at - interval '12 hours' then raise exception 'leave_deadline_passed' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  select id into v_pid from event_participants where event_id=p_event_id and user_id=v_user;
  if v_pid is null then raise exception 'not_participant' using errcode='P0001'; end if;

  if v_ev.specification = 'team' then
    -- find the team row holding the caller's slot; demote the partner to invited.
    for v_team in select * from event_teams where event_id=p_event_id and (player_a_id=v_pid or player_b_id=v_pid) loop
      if v_team.player_a_id = v_pid then v_partner_pid := v_team.player_b_id;
      else v_partner_pid := v_team.player_a_id; end if;
      update event_teams set
        player_a_id = case when player_a_id=v_pid then null else player_a_id end,
        player_b_id = case when player_b_id=v_pid then null else player_b_id end,
        is_confirmed = false
        where id = v_team.id;
      if v_partner_pid is not null then
        select user_id into v_partner_user from event_participants where id = v_partner_pid;
        delete from event_participants where id = v_partner_pid;
        if v_partner_user is not null then
          update event_teams set
            player_a_id = case when player_a_id=v_partner_pid then null else player_a_id end,
            player_b_id = case when player_b_id=v_partner_pid then null else player_b_id end
            where event_id=p_event_id;
          if exists (select 1 from event_invitations where event_id=p_event_id and invitee_id=v_partner_user) then
            update event_invitations set status='pending', responded_at=null
              where event_id=p_event_id and invitee_id=v_partner_user;
          else
            insert into event_invitations (event_id, invitee_id, status, invited_by)
              values (p_event_id, v_partner_user, 'pending', v_ev.organizer_id);
          end if;
        end if;
      end if;
    end loop;
  end if;

  delete from event_participants where id = v_pid;
  -- JM-08: do NOT auto-promote the waiting list; just renumber to stay contiguous.
  with ranked as (
    select id, row_number() over (order by waiting_list_position, joined_at) as rn
    from event_participants where event_id=p_event_id and status='waiting_list')
  update event_participants ep set waiting_list_position = ranked.rn
    from ranked where ep.id = ranked.id and ep.waiting_list_position <> ranked.rn;
end; $$;

create or replace function choose_partner(p_event_id uuid, p_partner_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype;
        v_confirmed int; v_cap int; v_caller_pid uuid; v_partner_pid uuid; v_team int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'event_closed' using errcode='P0001'; end if;
  if v_ev.specification <> 'team' then raise exception 'not_a_team_event' using errcode='P0001'; end if;
  if not (is_event_invitee(p_event_id, v_user) or is_event_participant(p_event_id, v_user)) then
    raise exception 'forbidden' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  v_cap := event_capacity(p_event_id);
  select count(*) into v_confirmed from event_participants
    where event_id=p_event_id and status='confirmed'
      and user_id is distinct from v_user and user_id is distinct from p_partner_user;
  if v_confirmed + 2 > v_cap then raise exception 'event_full' using errcode='P0001'; end if;

  insert into event_participants (event_id, user_id, status, confirmed_at, joined_at, invited_by)
    values (p_event_id, v_user, 'confirmed', now(), now(), v_ev.organizer_id)
    on conflict (event_id, user_id) do update set status='confirmed', confirmed_at=now()
    returning id into v_caller_pid;
  insert into event_participants (event_id, user_id, status, confirmed_at, joined_at, invited_by)
    values (p_event_id, p_partner_user, 'confirmed', now(), now(), v_user)
    on conflict (event_id, user_id) do update set status='confirmed', confirmed_at=now()
    returning id into v_partner_pid;

  select coalesce(max(team_number),0)+1 into v_team from event_teams where event_id=p_event_id;
  insert into event_teams (event_id, team_number, player_a_id, player_b_id, is_confirmed)
    values (p_event_id, v_team, v_caller_pid, v_partner_pid, true);

  update event_invitations set status='accepted', responded_at=now()
    where event_id=p_event_id and invitee_id in (v_user, p_partner_user) and status='pending';
end; $$;

create or replace function request_partner(p_event_id uuid, p_targets uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_t uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.specification <> 'team' then raise exception 'not_a_team_event' using errcode='P0001'; end if;

  insert into event_participants (event_id, user_id, status, joined_at, invited_by)
    values (p_event_id, v_user, 'interested', now(), v_ev.organizer_id)
    on conflict (event_id, user_id) do update set status='interested';

  foreach v_t in array p_targets loop
    insert into partner_requests (event_id, requester_id, target_id, status)
      values (p_event_id, v_user, v_t, 'pending')
      on conflict (event_id, requester_id, target_id) do nothing;
  end loop;
end; $$;

create or replace function accept_partner_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_req partner_requests%rowtype; v_ev events%rowtype;
        v_confirmed int; v_cap int; v_req_pid uuid; v_target_pid uuid; v_team int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_req from partner_requests where id = p_request_id;
  if v_req.id is null or v_req.target_id <> v_user then raise exception 'request_not_found' using errcode='P0001'; end if;
  select * into v_ev from events where id = v_req.event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||v_req.event_id::text, 0));
  v_cap := event_capacity(v_req.event_id);
  select count(*) into v_confirmed from event_participants
    where event_id=v_req.event_id and status='confirmed'
      and user_id is distinct from v_req.requester_id and user_id is distinct from v_req.target_id;
  if v_confirmed + 2 > v_cap then raise exception 'event_full' using errcode='P0001'; end if;

  update partner_requests set status='accepted', responded_at=now() where id = p_request_id;
  -- decline the requester's OTHER pending requests on this event
  update partner_requests set status='declined', responded_at=now()
    where event_id=v_req.event_id and requester_id=v_req.requester_id and status='pending' and id <> p_request_id;

  insert into event_participants (event_id, user_id, status, confirmed_at, joined_at, invited_by)
    values (v_req.event_id, v_req.requester_id, 'confirmed', now(), now(), v_ev.organizer_id)
    on conflict (event_id, user_id) do update set status='confirmed', confirmed_at=now()
    returning id into v_req_pid;
  insert into event_participants (event_id, user_id, status, confirmed_at, joined_at, invited_by)
    values (v_req.event_id, v_req.target_id, 'confirmed', now(), now(), v_req.requester_id)
    on conflict (event_id, user_id) do update set status='confirmed', confirmed_at=now()
    returning id into v_target_pid;

  select coalesce(max(team_number),0)+1 into v_team from event_teams where event_id=v_req.event_id;
  insert into event_teams (event_id, team_number, player_a_id, player_b_id, is_confirmed)
    values (v_req.event_id, v_team, v_req_pid, v_target_pid, true);
end; $$;

create or replace function decline_partner_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from partner_requests where id=p_request_id and target_id=v_user) then
    raise exception 'request_not_found' using errcode='P0001'; end if;
  update partner_requests set status='declined', responded_at=now()
    where id=p_request_id and target_id=v_user;
end; $$;

create or replace function invite_to_event(p_event_id uuid, p_invitees jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_inv jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if jsonb_typeof(p_invitees) = 'array' then
    for v_inv in select * from jsonb_array_elements(p_invitees) loop
      insert into event_invitations (event_id, invitee_id, invitee_name, invitee_email, invitee_phone, invited_by)
      values (p_event_id, nullif(v_inv->>'invitee_id','')::uuid, v_inv->>'name', v_inv->>'email', v_inv->>'phone', v_user)
      on conflict do nothing;
    end loop;
  end if;
end; $$;

create or replace function accept_event_invitation(p_event_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype;
        v_confirmed int; v_cap int; v_status text; v_pos int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from event_invitations where event_id=p_event_id and invitee_id=v_user and status='pending') then
    raise exception 'invitation_not_found' using errcode='P0001'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));

  if v_ev.specification = 'team' then
    insert into event_participants (event_id, user_id, status, joined_at, invited_by)
      values (p_event_id, v_user, 'interested', now(), v_ev.organizer_id)
      on conflict (event_id, user_id) do update set status='interested';
    update event_invitations set status='accepted', responded_at=now()
      where event_id=p_event_id and invitee_id=v_user and status='pending';
    return 'interested';
  end if;

  if exists (select 1 from event_participants where event_id=p_event_id and user_id=v_user) then
    update event_invitations set status='accepted', responded_at=now()
      where event_id=p_event_id and invitee_id=v_user and status='pending';
    return (select status from event_participants where event_id=p_event_id and user_id=v_user);
  end if;

  v_cap := event_capacity(p_event_id);
  select count(*) into v_confirmed from event_participants where event_id=p_event_id and status='confirmed';
  if v_confirmed >= v_cap then
    v_status := 'waiting_list';
    select coalesce(max(waiting_list_position),0)+1 into v_pos from event_participants
      where event_id=p_event_id and status='waiting_list';
  else
    v_status := 'confirmed';
  end if;

  insert into event_participants (event_id, user_id, status, is_standby, waiting_list_position, confirmed_at, joined_at, invited_by)
  values (p_event_id, v_user, v_status,
    case when v_status='confirmed' then (v_confirmed >= v_ev.num_courts*4) else false end,
    case when v_status='waiting_list' then v_pos end,
    case when v_status='confirmed' then now() end, now(), v_ev.organizer_id);

  if not v_ev.is_private and v_ev.group_id is not null then
    insert into community_members (community_id, user_id, role)
      values (event_group_community(p_event_id), v_user, 'member') on conflict do nothing;
    insert into group_members (group_id, user_id) values (v_ev.group_id, v_user) on conflict do nothing;
  end if;
  update event_invitations set status='accepted', responded_at=now()
    where event_id=p_event_id and invitee_id=v_user and status='pending';
  return v_status;
end; $$;

create or replace function decline_event_invitation(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update event_invitations set status='declined', responded_at=now()
    where event_id=p_event_id and invitee_id=v_user and status='pending';
end; $$;

create or replace function organizer_mark_confirmed(p_participant_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select event_id into v_event from event_participants where id = p_participant_id;
  if v_event is null then raise exception 'participant_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  -- organizer override: no capacity check
  update event_participants set status='confirmed', confirmed_at=now(), waiting_list_position=null
    where id = p_participant_id;
end; $$;

create or replace function organizer_remove_participant(p_participant_id uuid, p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid; v_target_user uuid; v_org uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_mode not in ('to_invited','from_event') then raise exception 'invalid_mode' using errcode='P0001'; end if;
  select event_id, user_id into v_event, v_target_user from event_participants where id = p_participant_id;
  if v_event is null then raise exception 'participant_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  select organizer_id into v_org from events where id = v_event;

  delete from event_participants where id = p_participant_id;
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
end; $$;

create or replace function add_manual_participant(p_event_id uuid, p_name text, p_gender text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_spec text; v_pid uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if coalesce(btrim(p_name),'') = '' then raise exception 'name_required' using errcode='P0001'; end if;
  select specification into v_spec from events where id = p_event_id;
  if v_spec = 'mixed' and p_gender is null then raise exception 'gender_required' using errcode='P0001'; end if;
  insert into event_participants (event_id, guest_name, guest_gender, status, confirmed_at, joined_at, invited_by)
    values (p_event_id, btrim(p_name), p_gender, 'confirmed', now(), now(), v_user)
    returning id into v_pid;
  return v_pid;
end; $$;

create or replace function mark_paid(p_participant_id uuid, p_paid boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select event_id into v_event from event_participants where id = p_participant_id;
  if v_event is null then raise exception 'participant_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  update event_participants set has_paid=p_paid, paid_at = case when p_paid then now() else null end
    where id = p_participant_id;
end; $$;

create or replace function mark_all_paid(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  update event_participants set has_paid=true, paid_at=now()
    where event_id=p_event_id and has_paid=false;
end; $$;

create or replace function leave_waiting_list(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  delete from event_participants
    where event_id=p_event_id and user_id=v_user and status='waiting_list';
  with ranked as (
    select id, row_number() over (order by waiting_list_position, joined_at) as rn
    from event_participants where event_id=p_event_id and status='waiting_list')
  update event_participants ep set waiting_list_position = ranked.rn
    from ranked where ep.id = ranked.id and ep.waiting_list_position <> ranked.rn;
end; $$;

grant execute on function join_event, leave_event, choose_partner, request_partner,
  accept_partner_request, decline_partner_request, invite_to_event, accept_event_invitation,
  decline_event_invitation, organizer_mark_confirmed, organizer_remove_participant,
  add_manual_participant, mark_paid, mark_all_paid, leave_waiting_list to authenticated;
