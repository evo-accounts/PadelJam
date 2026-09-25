-- 0112_event_join_rules.sql
-- UX Audit — Events, plan PR 2 (docs/audit/2026-09-25-ux-events-plan.md): decisions 1, 4, 5, 6, 8 and
-- bugs B7, B8, B10, plus the follow-ups from the review of 0111 (#207).
--
--   D4  Waiting list first. notify_waitlist_spot offers a freed spot to EVERY waiter who could take it,
--       at once; claim_waitlist_spot stays first-come; nobody is confirmed automatically. While
--       anyone who could take a spot is waiting, a newcomer's join_event / accept_event_invitation
--       goes to the END of the list even if a spot is free (B8).
--   D5  Public group events send no invitations. create_event, materialize_occurrence and
--       duplicate_event notify every group member but the organizer with the new `event_created`
--       type instead. Existing PENDING invitations on public scheduled events are deleted below.
--   B7  On a public team event any member of its group may enter the team flow (request_partner,
--       choose_partner, being chosen) without an invitation. One gate, _may_enter_team_flow, now
--       guards choose_partner, request_partner and event_partner_candidates alike.
--   D6  Interested players stay interested when the event fills. A pair that forms when there are
--       not two free spots — or while anyone is already waiting — goes onto the waiting list
--       TOGETHER, and claim_waitlist_spot on a team event claims two spots for the pair.
--   D8  Mixed events split capacity per gender: event_capacity()/2 each (integer division, so an odd
--       stand-by spot on a mixed event stays unused — a mixed event must balance to start anyway).
--       join_event / accept_event_invitation waitlist a player whose half is full; claim refuses
--       `gender_full`; every path refuses `gender_required` when the profile has no gender. Guests
--       count by guest_gender. Pair paths are team-only and team and mixed are exclusive
--       specifications, so they need no gender rule. Organizer overrides stay unrestricted.
--   D1  leave_event: a partner still loses the spot, and now also gets a `partner_left` notification.
--   B10 The leaver's own invitation returns to `pending` on a private event, so the Invited state
--       comes back. On a public group event there is no invitation: any left over is deleted.
--       The same applies to a partner who loses their spot (on a public event they see Join).
--   my_events gains 'pending' and p_include_past; 'going' includes waiting_list and interested.
--   event_invited_players: the read-only Invited tab (decision 14).
--
-- Review of 0111 (#207):
--   R1  accept_partner_request flips the request with `and status = 'pending'` under the roster lock
--       and raises request_not_found if a withdraw won; withdraw_partner_request takes the same lock.
--   R2  A request closed by the system (a pair formed, a partner dropped) no longer blocks asking the
--       same person again: partner_requests.closed_by_system marks those rows and request_partner
--       re-opens them (and accepted rows, whose team has since broken up). A target's own decline
--       stays sticky. Rows the 0111 clean-up declined predate the column and stay sticky too.
--   R3  = B7 above (one gate for the three RPCs).
--   R5  accept_partner_request's staleness backstop matches _partner_available: the requester must
--       be a participant who is not paired or waiting (was: status 'interested' only).
--   R6  organizer_remove_participant withdraws the removed player's pending sent requests (as B4).
--
-- WAITING PAIRS — representation. Both players are ordinary event_participants rows with
-- status 'waiting_list' at CONSECUTIVE waiting_list_positions (the pair queues as one unit; the
-- renumbering in leave_event / leave_waiting_list / claim keeps them adjacent), each pointing at the
-- other through the new event_participants.pair_participant_id. There is NO event_teams row until
-- the pair claims: event_teams keeps meaning "a team holding spots", so start_event, the live
-- screens and the organizer team tools see nothing new. On claim the two rows are confirmed, a
-- confirmed event_teams row is created and pair_participant_id is cleared. If either player leaves
-- (leave_event or leave_waiting_list) the other loses their place too, as a confirmed partner does.
--
-- Every redefined function is its latest body (0111 for accept_event_invitation, choose_partner,
-- request_partner, accept_partner_request, withdraw_partner_request, leave_event,
-- event_partner_candidates, _partner_available; 0093 for notify_waitlist_spot, claim_waitlist_spot,
-- organizer_remove_participant; 0098 for create_event, duplicate_event; 0086 materialize_occurrence;
-- 0090 my_events; 0047 join_event, leave_waiting_list) plus the lines marked NEW.
-- New error code: gender_full. choose_partner and accept_partner_request now return the caller's
-- resulting status ('confirmed' | 'waiting_list') instead of void.

begin;

-- ---------------------------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------------------------

-- New notification types; every existing one kept (latest list: 0093).
alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'event_invite','group_invite','community_invite',
  'community_request_accepted','follow','follow_joined_event','event_cancelled','event_updated',
  'participant_confirmed','waitlist_spot','results_published',
  'event_created','partner_left'));                                                   -- NEW

-- D6: a waiting pair (see the header).
alter table event_participants
  add column if not exists pair_participant_id uuid references event_participants(id) on delete set null;
comment on column event_participants.pair_participant_id is
  'Set only on a team event''s waiting pair: both rows are waiting_list at consecutive positions and point at each other. Cleared when the pair claims (an event_teams row takes over).';

-- R2: closed by the system (pair formed / partner dropped) rather than by the target's decline.
alter table partner_requests add column if not exists closed_by_system boolean not null default false;

-- ---------------------------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------------------------

-- D8: is this gender's half of a mixed event's capacity taken?
create or replace function _mixed_gender_full(p_event_id uuid, p_gender text) returns boolean
language sql stable security definer set search_path = public as $$
  select count(*) >= event_capacity(p_event_id) / 2
  from event_participants ep left join profiles pr on pr.id = ep.user_id
  where ep.event_id = p_event_id and ep.status = 'confirmed'
    and coalesce(pr.gender, ep.guest_gender) = p_gender;
$$;
revoke execute on function _mixed_gender_full(uuid, text) from public, anon, authenticated;

-- B8: is anyone waiting who could take the spot a newcomer is after? On a mixed event only the
-- newcomer's own gender queues ahead of them (a woman waiting cannot take a man's spot).
create or replace function _has_waiters(p_event_id uuid, p_gender text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from event_participants ep left join profiles pr on pr.id = ep.user_id
    where ep.event_id = p_event_id and ep.status = 'waiting_list'
      and (p_gender is null or coalesce(pr.gender, ep.guest_gender) = p_gender));
$$;
revoke execute on function _has_waiters(uuid, text) from public, anon, authenticated;

-- D4/D6/D8: could this waiting-list row claim a spot right now? One rule for who is offered a spot
-- (notify_waitlist_spot) and whose standing offer has gone stale (claim_waitlist_spot).
create or replace function _waiter_can_claim(p_event_id uuid, p_pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when e.specification = 'team'
        then ep.pair_participant_id is not null and f.free >= 2
      when e.specification = 'mixed'
        then coalesce(pr.gender, ep.guest_gender) is not null and f.free >= 1
             and not _mixed_gender_full(e.id, coalesce(pr.gender, ep.guest_gender))
      else f.free >= 1
    end
    from events e
    join event_participants ep on ep.id = p_pid and ep.event_id = e.id and ep.status = 'waiting_list'
    left join profiles pr on pr.id = ep.user_id
    cross join lateral (
      select event_capacity(e.id)
             - (select count(*) from event_participants c where c.event_id = e.id and c.status = 'confirmed')::int
             as free) f
    where e.id = p_event_id), false);
$$;
revoke execute on function _waiter_can_claim(uuid, uuid) from public, anon, authenticated;

-- B7/R3: may this user enter a team event's partner flow (choose, ask, list candidates)? An invitee,
-- a participant, or — on a public group event — a member of its group, invited or not.
create or replace function _may_enter_team_flow(p_event_id uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_event_invitee(p_event_id, p_user) or is_event_participant(p_event_id, p_user)
    or exists (select 1 from events ev join group_members gm on gm.group_id = ev.group_id
               where ev.id = p_event_id and ev.is_private = false and gm.user_id = p_user);
$$;
revoke execute on function _may_enter_team_flow(uuid, uuid) from public, anon, authenticated;

-- D5: tell a public group's members (but the organizer) that an event was created.
create or replace function _notify_event_created(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_ev events%rowtype; v_actor text;
begin
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null or v_ev.group_id is null or v_ev.is_private then return; end if;
  select full_name into v_actor from profiles where id = v_ev.organizer_id;
  insert into notifications (user_id, type, actor_id, event_id, group_id, actor_name, entity_name)
  select gm.user_id, 'event_created', v_ev.organizer_id, v_ev.id, v_ev.group_id, v_actor, v_ev.name
  from group_members gm
  join profiles p on p.id = gm.user_id and p.deleted_at is null
  where gm.group_id = v_ev.group_id and gm.user_id <> v_ev.organizer_id
    and not notif_blocked(gm.user_id, v_ev.organizer_id);
end; $$;
revoke execute on function _notify_event_created(uuid) from public, anon, authenticated;

-- B10: what a player's invitation becomes when they leave (or lose their spot). Private event: back
-- to pending (created when p_create — a dropped partner always had one, the organizer never did).
-- Public group event: there are no invitations any more, so a leftover one is deleted.
create or replace function _reset_invitation_after_leave(p_event_id uuid, p_user uuid, p_create boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_ev events%rowtype;
begin
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null or p_user is null then return; end if;
  if v_ev.is_private then
    if exists (select 1 from event_invitations where event_id = p_event_id and invitee_id = p_user) then
      update event_invitations set status = 'pending', responded_at = null
        where event_id = p_event_id and invitee_id = p_user;
    elsif p_create then
      insert into event_invitations (event_id, invitee_id, status, invited_by)
        values (p_event_id, p_user, 'pending', v_ev.organizer_id);
    end if;
  elsif v_ev.group_id is not null then
    delete from event_invitations where event_id = p_event_id and invitee_id = p_user;
  end if;
end; $$;
revoke execute on function _reset_invitation_after_leave(uuid, uuid, boolean) from public, anon, authenticated;

-- D1: the player left behind loses their spot (a confirmed team slot or a waiting-pair place),
-- their invitation is reset (B10), their pending asks go, and they are told. Returns whether they
-- held a confirmed spot. Caller holds the roster lock.
create or replace function _drop_partner(p_event_id uuid, p_partner_pid uuid, p_leaver uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_partner_user uuid; v_was boolean; v_name text; v_group uuid; v_actor text;
begin
  select user_id, status = 'confirmed' into v_partner_user, v_was
    from event_participants where id = p_partner_pid and event_id = p_event_id;
  if not found then return false; end if;
  delete from event_participants where id = p_partner_pid;   -- event_teams slots / pair links: on delete set null
  if v_partner_user is not null then
    perform _reset_invitation_after_leave(p_event_id, v_partner_user, true);
    delete from partner_requests where event_id = p_event_id and requester_id = v_partner_user and status = 'pending';
    if not notif_blocked(v_partner_user, p_leaver) then
      select name, group_id into v_name, v_group from events where id = p_event_id;
      select full_name into v_actor from profiles where id = p_leaver;
      insert into notifications (user_id, type, actor_id, event_id, group_id, actor_name, entity_name)
        values (v_partner_user, 'partner_left', p_leaver, p_event_id, v_group, v_actor, v_name);
    end if;
  end if;
  return coalesce(v_was, false);
end; $$;
revoke execute on function _drop_partner(uuid, uuid, uuid) from public, anon, authenticated;

-- Keep waiting-list positions contiguous (same ordering every roster RPC already used).
create or replace function _renumber_waiting_list(p_event_id uuid) returns void
language sql security definer set search_path = public as $$
  with ranked as (
    select id, row_number() over (order by waiting_list_position, joined_at, id) as rn
    from event_participants where event_id = p_event_id and status = 'waiting_list')
  update event_participants ep set waiting_list_position = ranked.rn
    from ranked where ep.id = ranked.id and ep.waiting_list_position <> ranked.rn;
$$;
revoke execute on function _renumber_waiting_list(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- D4: notify_waitlist_spot (0093 body) — broadcast instead of first-waiter-only
-- ---------------------------------------------------------------------------------------------
create or replace function notify_waitlist_spot(p_event_id uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_actor text; v_name text;
begin
  select full_name into v_actor from profiles where id = p_actor;
  select name into v_name from events where id = p_event_id;
  -- NEW: every waiter who could claim (a pair only when two spots are free; a mixed-event waiter only
  -- when their half has room), at once. Dedupe is per waiter: an unread, unactioned offer already
  -- standing is not repeated for the same free spot. Once read (or marked stale by a claim that
  -- filled the event), the next freed spot produces a fresh offer (JM-08: the waiter must act).
  insert into notifications (user_id, type, actor_id, event_id, ref_id, actor_name, entity_name)
  select ep.user_id, 'waitlist_spot', p_actor, p_event_id, ep.id, v_actor, v_name
  from event_participants ep
  where ep.event_id = p_event_id and ep.status = 'waiting_list' and ep.user_id is not null
    and _waiter_can_claim(p_event_id, ep.id)
    and (p_actor is null or not notif_blocked(ep.user_id, p_actor))
    and not exists (select 1 from notifications n
                    where n.user_id = ep.user_id and n.event_id = p_event_id and n.type = 'waitlist_spot'
                      and n.read_at is null and not n.cta_done)
  order by ep.waiting_list_position, ep.joined_at;
end; $$;
revoke execute on function notify_waitlist_spot(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- B8 + D8: join_event (0047 body)
-- ---------------------------------------------------------------------------------------------
create or replace function join_event(p_event_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype;
        v_confirmed int; v_cap int; v_reg int; v_status text; v_standby boolean := false; v_pos int;
        v_gender text; v_gender_full boolean := false;                                -- NEW
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

  -- NEW (D8): a mixed event needs the joiner's gender, and a full half waitlists them.
  if v_ev.specification = 'mixed' then
    select gender into v_gender from profiles where id = v_user;
    if v_gender is null then raise exception 'gender_required' using errcode='P0001'; end if;
    v_gender_full := _mixed_gender_full(p_event_id, v_gender);
  end if;

  v_reg := v_ev.num_courts * 4;
  v_cap := event_capacity(p_event_id);
  select count(*) into v_confirmed from event_participants where event_id=p_event_id and status='confirmed';
  if v_confirmed >= v_cap
     or v_gender_full                                                                 -- NEW (D8)
     or _has_waiters(p_event_id, v_gender) then                                       -- NEW (B8)
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

-- ---------------------------------------------------------------------------------------------
-- B8 + D8: accept_event_invitation (0111 body)
-- ---------------------------------------------------------------------------------------------
create or replace function accept_event_invitation(p_event_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype;
        v_confirmed int; v_cap int; v_status text; v_pos int;
        v_gender text; v_gender_full boolean := false;                                -- NEW
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from event_invitations where event_id=p_event_id and invitee_id=v_user and status='pending') then
    raise exception 'invitation_not_found' using errcode='P0001'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  perform _assert_can_confirm(p_event_id);

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));

  insert into event_activity (event_id, actor_id, action, detail)
  values (p_event_id, v_user, 'invite_accepted', '{}'::jsonb);

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

  -- NEW (D8): as join_event. The invitation stays pending when the gender is missing.
  if v_ev.specification = 'mixed' then
    select gender into v_gender from profiles where id = v_user;
    if v_gender is null then raise exception 'gender_required' using errcode='P0001'; end if;
    v_gender_full := _mixed_gender_full(p_event_id, v_gender);
  end if;

  v_cap := event_capacity(p_event_id);
  select count(*) into v_confirmed from event_participants where event_id=p_event_id and status='confirmed';
  if v_confirmed >= v_cap
     or v_gender_full                                                                 -- NEW (D8)
     or _has_waiters(p_event_id, v_gender) then                                       -- NEW (B8)
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

-- ---------------------------------------------------------------------------------------------
-- D4 + D6 + D8: claim_waitlist_spot (0093 body)
-- ---------------------------------------------------------------------------------------------
create or replace function claim_waitlist_spot(p_event_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_pid uuid; v_confirmed int; v_reg int;
        v_cap int; v_pair uuid; v_pair_user uuid; v_gender text; v_team int;         -- NEW
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'event_closed' using errcode='P0001'; end if;
  if now() > v_ev.starts_at - interval '6 hours' then raise exception 'event_closed' using errcode='P0001'; end if;
  -- REMOVED (D6): team events no longer refuse — a waiting pair claims two spots below.

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  select id, pair_participant_id into v_pid, v_pair from event_participants                -- NEW (pair)
    where event_id = p_event_id and user_id = v_user and status = 'waiting_list';
  if v_pid is null then raise exception 'not_on_waiting_list' using errcode='P0001'; end if;

  v_reg := v_ev.num_courts * 4;
  v_cap := event_capacity(p_event_id);
  select count(*) into v_confirmed from event_participants where event_id = p_event_id and status = 'confirmed';

  if v_ev.specification = 'team' then
    -- NEW (D6): only a waiting pair can claim, and it takes two spots at once.
    if v_pair is null or not exists (select 1 from event_participants
                                     where id = v_pair and event_id = p_event_id and status = 'waiting_list') then
      raise exception 'use_team_join' using errcode='P0001'; end if;
    if v_confirmed + 2 > v_cap then raise exception 'spot_taken' using errcode='P0001'; end if;
    select user_id into v_pair_user from event_participants where id = v_pair;
    update event_participants set
      status = 'confirmed', is_standby = false, waiting_list_position = null, confirmed_at = now(),
      pair_participant_id = null
      where id in (v_pid, v_pair);
    select coalesce(max(team_number),0)+1 into v_team from event_teams where event_id = p_event_id;
    insert into event_teams (event_id, team_number, player_a_id, player_b_id, is_confirmed)
      values (p_event_id, v_team, v_pid, v_pair, true);
  else
    -- NEW (D8): a mixed-event waiter claims only a spot in their own half.
    if v_ev.specification = 'mixed' then
      select gender into v_gender from profiles where id = v_user;
      if v_gender is null then raise exception 'gender_required' using errcode='P0001'; end if;
      if _mixed_gender_full(p_event_id, v_gender) then raise exception 'gender_full' using errcode='P0001'; end if;
    end if;
    if v_confirmed >= v_cap then raise exception 'spot_taken' using errcode='P0001'; end if;
    update event_participants set
      status = 'confirmed', is_standby = (v_confirmed >= v_reg),
      waiting_list_position = null, confirmed_at = now()
      where id = v_pid;
  end if;

  perform _renumber_waiting_list(p_event_id);
  update notifications set cta_done = true, read_at = coalesce(read_at, now())
    where user_id in (v_user, v_pair_user) and event_id = p_event_id                         -- NEW (the partner's offer too)
      and type = 'waitlist_spot' and not cta_done;
  -- NEW (D4): everyone was offered the spot at once. Offers that can no longer be claimed are stale:
  -- mark them read so the next freed spot sends a fresh one (the per-waiter dedupe skips unread
  -- offers). Anyone who can still claim keeps theirs, and anyone newly able to claim is offered.
  update notifications n set read_at = now()
    from event_participants ep
    where n.event_id = p_event_id and n.type = 'waitlist_spot' and n.read_at is null and not n.cta_done
      and ep.event_id = p_event_id and ep.user_id = n.user_id and ep.status = 'waiting_list'
      and not _waiter_can_claim(p_event_id, ep.id);
  perform notify_waitlist_spot(p_event_id, null);
  return 'confirmed';
end; $$;

-- ---------------------------------------------------------------------------------------------
-- B7 + D6 + R2: choose_partner (0111 body). Returns 'confirmed' | 'waiting_list' (was void).
-- ---------------------------------------------------------------------------------------------
drop function if exists choose_partner(uuid, uuid);
create function choose_partner(p_event_id uuid, p_partner_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype;
        v_confirmed int; v_cap int; v_caller_pid uuid; v_partner_pid uuid; v_team int;
        v_status text; v_pos int;                                                     -- NEW
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  perform _assert_can_confirm(p_event_id);
  if v_ev.specification <> 'team' then raise exception 'not_a_team_event' using errcode='P0001'; end if;
  if not _may_enter_team_flow(p_event_id, v_user) then                                -- NEW (B7; was invitee/participant)
    raise exception 'forbidden' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  if _is_paired_or_waiting(p_event_id, v_user) then
    raise exception 'already_joined' using errcode='P0001'; end if;
  if not _partner_available(p_event_id, v_user, p_partner_user) then
    raise exception 'partner_unavailable' using errcode='P0001'; end if;

  v_cap := event_capacity(p_event_id);
  select count(*) into v_confirmed from event_participants
    where event_id=p_event_id and status='confirmed'
      and user_id is distinct from v_user and user_id is distinct from p_partner_user;

  -- NEW (D6 + B8): no room for two, or someone already queued → the pair waits together
  -- (was: raise event_full).
  if v_confirmed + 2 > v_cap
     or exists (select 1 from event_participants where event_id=p_event_id and status='waiting_list') then
    v_status := 'waiting_list';
    select coalesce(max(waiting_list_position),0) into v_pos from event_participants
      where event_id=p_event_id and status='waiting_list';
    insert into event_participants (event_id, user_id, status, waiting_list_position, joined_at, invited_by)
      values (p_event_id, v_user, 'waiting_list', v_pos + 1, now(), v_ev.organizer_id)
      on conflict (event_id, user_id) do update set status='waiting_list',
        waiting_list_position=excluded.waiting_list_position, confirmed_at=null, is_standby=false
      returning id into v_caller_pid;
    insert into event_participants (event_id, user_id, status, waiting_list_position, joined_at, invited_by)
      values (p_event_id, p_partner_user, 'waiting_list', v_pos + 2, now(), v_user)
      on conflict (event_id, user_id) do update set status='waiting_list',
        waiting_list_position=excluded.waiting_list_position, confirmed_at=null, is_standby=false
      returning id into v_partner_pid;
    update event_participants set pair_participant_id =
      case when id = v_caller_pid then v_partner_pid else v_caller_pid end
      where id in (v_caller_pid, v_partner_pid);
  else
    v_status := 'confirmed';
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
  end if;

  update event_invitations set status='accepted', responded_at=now()
    where event_id=p_event_id and invitee_id in (v_user, p_partner_user) and status='pending';

  update partner_requests set status='declined', responded_at=now(), closed_by_system=true   -- NEW (R2)
    where event_id=p_event_id and status='pending'
      and (requester_id in (v_user, p_partner_user) or target_id in (v_user, p_partner_user));
  return v_status;                                                                    -- NEW
end; $$;
revoke execute on function choose_partner(uuid, uuid) from public, anon, authenticated;
grant execute on function choose_partner(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- B7 + R2: request_partner (0111 body)
-- ---------------------------------------------------------------------------------------------
create or replace function request_partner(p_event_id uuid, p_targets uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_t uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.specification <> 'team' then raise exception 'not_a_team_event' using errcode='P0001'; end if;
  perform _assert_can_confirm(p_event_id);
  if not _may_enter_team_flow(p_event_id, v_user) then                                -- NEW (B7; was invitee/participant)
    raise exception 'forbidden' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  if _is_paired_or_waiting(p_event_id, v_user) then
    raise exception 'already_joined' using errcode='P0001'; end if;

  insert into event_participants (event_id, user_id, status, joined_at, invited_by)
    values (p_event_id, v_user, 'interested', now(), v_ev.organizer_id)
    on conflict (event_id, user_id) do update set status='interested';

  foreach v_t in array coalesce(p_targets, '{}'::uuid[]) loop
    if _partner_available(p_event_id, v_user, v_t) then
      -- NEW (R2): a request the system closed (a pair formed, a partner dropped) or an accepted one
      -- whose team has since broken up is re-opened. The target's own decline stays sticky.
      insert into partner_requests (event_id, requester_id, target_id, status)
        values (p_event_id, v_user, v_t, 'pending')
        on conflict (event_id, requester_id, target_id) do update
          set status = 'pending', responded_at = null, created_at = now(), closed_by_system = false
          where partner_requests.status <> 'pending'
            and (partner_requests.closed_by_system or partner_requests.status = 'accepted');
    end if;
  end loop;
end; $$;

-- ---------------------------------------------------------------------------------------------
-- D6 + R1 + R2 + R5: accept_partner_request (0111 body). Returns 'confirmed' | 'waiting_list'.
-- ---------------------------------------------------------------------------------------------
drop function if exists accept_partner_request(uuid);
create function accept_partner_request(p_request_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_req partner_requests%rowtype; v_ev events%rowtype;
        v_confirmed int; v_cap int; v_req_pid uuid; v_target_pid uuid; v_team int;
        v_status text; v_pos int;                                                     -- NEW
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_req from partner_requests where id = p_request_id;
  if v_req.id is null or v_req.target_id <> v_user or v_req.status <> 'pending' then
    raise exception 'request_not_found' using errcode='P0001'; end if;
  select * into v_ev from events where id = v_req.event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  perform _assert_can_confirm(v_req.event_id);

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||v_req.event_id::text, 0));
  if _is_paired_or_waiting(v_req.event_id, v_user) then
    raise exception 'already_joined' using errcode='P0001'; end if;
  -- NEW (R5): same rule as _partner_available — a participant who is not paired or waiting.
  if not is_event_participant(v_req.event_id, v_req.requester_id)
     or _is_paired_or_waiting(v_req.event_id, v_req.requester_id)
     or notif_blocked(v_req.requester_id, v_user) then
    raise exception 'request_stale' using errcode='P0001'; end if;

  -- NEW (R1): re-checked under the lock, BEFORE anything is written. A withdraw that committed
  -- after the first read deleted the row, so nothing matches and the whole call rolls back.
  update partner_requests set status='accepted', responded_at=now()
    where id = p_request_id and status = 'pending';
  if not found then raise exception 'request_not_found' using errcode='P0001'; end if;
  update partner_requests set status='declined', responded_at=now(), closed_by_system=true   -- NEW (R2)
    where event_id=v_req.event_id and status='pending' and id <> p_request_id
      and (requester_id in (v_req.requester_id, v_req.target_id)
           or target_id in (v_req.requester_id, v_req.target_id));

  v_cap := event_capacity(v_req.event_id);
  select count(*) into v_confirmed from event_participants
    where event_id=v_req.event_id and status='confirmed'
      and user_id is distinct from v_req.requester_id and user_id is distinct from v_req.target_id;

  -- NEW (D6 + B8): as choose_partner — no room for two, or a queue → the pair waits together.
  if v_confirmed + 2 > v_cap
     or exists (select 1 from event_participants where event_id=v_req.event_id and status='waiting_list') then
    v_status := 'waiting_list';
    select coalesce(max(waiting_list_position),0) into v_pos from event_participants
      where event_id=v_req.event_id and status='waiting_list';
    insert into event_participants (event_id, user_id, status, waiting_list_position, joined_at, invited_by)
      values (v_req.event_id, v_req.requester_id, 'waiting_list', v_pos + 1, now(), v_ev.organizer_id)
      on conflict (event_id, user_id) do update set status='waiting_list',
        waiting_list_position=excluded.waiting_list_position, confirmed_at=null, is_standby=false
      returning id into v_req_pid;
    insert into event_participants (event_id, user_id, status, waiting_list_position, joined_at, invited_by)
      values (v_req.event_id, v_req.target_id, 'waiting_list', v_pos + 2, now(), v_req.requester_id)
      on conflict (event_id, user_id) do update set status='waiting_list',
        waiting_list_position=excluded.waiting_list_position, confirmed_at=null, is_standby=false
      returning id into v_target_pid;
    update event_participants set pair_participant_id =
      case when id = v_req_pid then v_target_pid else v_req_pid end
      where id in (v_req_pid, v_target_pid);
  else
    v_status := 'confirmed';
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
  end if;

  update event_invitations set status='accepted', responded_at=now()
    where event_id=v_req.event_id and invitee_id in (v_req.requester_id, v_req.target_id) and status='pending';
  return v_status;                                                                    -- NEW
end; $$;
revoke execute on function accept_partner_request(uuid) from public, anon, authenticated;
grant execute on function accept_partner_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- R1: withdraw_partner_request (0111 body + the roster lock)
-- ---------------------------------------------------------------------------------------------
create or replace function withdraw_partner_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid;                                      -- NEW (v_event)
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  -- NEW (R1): serialise with accept_partner_request on the same event.
  select event_id into v_event from partner_requests where id = p_request_id and requester_id = v_user;
  if v_event is null then raise exception 'request_not_found' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||v_event::text, 0));
  delete from partner_requests where id=p_request_id and requester_id=v_user and status='pending';
  if not found then raise exception 'request_not_found' using errcode='P0001'; end if;
end; $$;
revoke execute on function withdraw_partner_request(uuid) from public, anon, authenticated;
grant execute on function withdraw_partner_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- D1 + B10 + D6: leave_event (0111 body)
-- ---------------------------------------------------------------------------------------------
create or replace function leave_event(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_pid uuid;
        v_team event_teams%rowtype; v_partner_pid uuid;
        v_was_confirmed boolean;
        v_pair uuid; v_freed boolean := false;                                        -- NEW
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if now() > v_ev.starts_at - interval '12 hours' then raise exception 'leave_deadline_passed' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  select id, status = 'confirmed', pair_participant_id into v_pid, v_was_confirmed, v_pair   -- NEW (pair)
    from event_participants where event_id=p_event_id and user_id=v_user;
  if v_pid is null then raise exception 'not_participant' using errcode='P0001'; end if;

  if v_ev.specification = 'team' then
    -- the partner in the caller's team loses the spot (D1).
    for v_team in select * from event_teams where event_id=p_event_id and (player_a_id=v_pid or player_b_id=v_pid) loop
      if v_team.player_a_id = v_pid then v_partner_pid := v_team.player_b_id;
      else v_partner_pid := v_team.player_a_id; end if;
      update event_teams set
        player_a_id = case when player_a_id=v_pid then null else player_a_id end,
        player_b_id = case when player_b_id=v_pid then null else player_b_id end,
        is_confirmed = false
        where id = v_team.id;
      if v_partner_pid is not null then
        -- NEW: one helper for the partner — row deleted, invitation reset (private) or removed
        -- (public, B10), pending asks withdrawn, partner_left sent (D1).
        if _drop_partner(p_event_id, v_partner_pid, v_user) then v_freed := true; end if;
      end if;
    end loop;
    -- NEW (D6): a waiting pair loses its place together.
    if v_pair is not null then perform _drop_partner(p_event_id, v_pair, v_user); end if;
  end if;

  delete from partner_requests where event_id=p_event_id and requester_id=v_user and status='pending';

  delete from event_participants where id = v_pid;
  perform _reset_invitation_after_leave(p_event_id, v_user, false);                  -- NEW (B10)
  -- JM-08: do NOT auto-promote the waiting list; just renumber to stay contiguous.
  perform _renumber_waiting_list(p_event_id);
  if v_was_confirmed or v_freed then perform notify_waitlist_spot(p_event_id, v_user); end if;   -- NEW (v_freed)
end; $$;

-- ---------------------------------------------------------------------------------------------
-- D6 + B10: leave_waiting_list (0047 body)
-- ---------------------------------------------------------------------------------------------
create or replace function leave_waiting_list(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
        v_pid uuid; v_pair uuid;                                                      -- NEW
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  select id, pair_participant_id into v_pid, v_pair from event_participants           -- NEW
    where event_id=p_event_id and user_id=v_user and status='waiting_list';
  if v_pid is null then return; end if;                                               -- NEW (was a silent no-op delete)
  if v_pair is not null then perform _drop_partner(p_event_id, v_pair, v_user); end if;   -- NEW (D6)
  delete from event_participants where id = v_pid;
  perform _reset_invitation_after_leave(p_event_id, v_user, false);                  -- NEW (B10)
  perform _renumber_waiting_list(p_event_id);
end; $$;

-- ---------------------------------------------------------------------------------------------
-- R6: organizer_remove_participant (0093 body + the removed player's pending asks withdrawn)
-- ---------------------------------------------------------------------------------------------
create or replace function organizer_remove_participant(p_participant_id uuid, p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid; v_target_user uuid; v_org uuid; v_target_name text;
        v_was_confirmed boolean;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_mode not in ('to_invited','from_event') then raise exception 'invalid_mode' using errcode='P0001'; end if;
  select event_id, user_id, status = 'confirmed' into v_event, v_target_user, v_was_confirmed
    from event_participants where id = p_participant_id;
  if v_event is null then raise exception 'participant_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  select organizer_id into v_org from events where id = v_event;

  select coalesce(p.full_name, ep.guest_name) into v_target_name
    from event_participants ep left join profiles p on p.id = ep.user_id where ep.id = p_participant_id;

  delete from event_participants where id = p_participant_id;
  -- NEW (R6): as leave_event (B4) — the removed player's asks cannot re-confirm them later.
  if v_target_user is not null then
    delete from partner_requests where event_id=v_event and requester_id=v_target_user and status='pending';
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
  insert into event_activity (event_id, actor_id, action, detail)
  values (v_event, v_user, 'removed', jsonb_build_object('target_name', v_target_name, 'mode', p_mode));
  perform _renumber_waiting_list(v_event);                                            -- NEW (a removed waiter left a gap)
  if v_was_confirmed then perform notify_waitlist_spot(v_event, v_user); end if;
end; $$;

-- ---------------------------------------------------------------------------------------------
-- B7/R3: event_partner_candidates (0111 body, gate from the shared helper)
-- ---------------------------------------------------------------------------------------------
create or replace function event_partner_candidates(p_event_id uuid)
returns table (id uuid, full_name text, avatar_url text, participant_status text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_user uuid := auth.uid(); v_ev events%rowtype;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events e where e.id = p_event_id and e.deleted_at is null;
  if v_ev.id is null or not event_is_visible(p_event_id, v_user) then
    raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.specification <> 'team' then raise exception 'not_a_team_event' using errcode='P0001'; end if;
  if not _may_enter_team_flow(p_event_id, v_user) then                                -- NEW (same gate as choose/request)
    raise exception 'forbidden' using errcode='P0001'; end if;

  return query
  with pool as (
    select ep.user_id as uid from event_participants ep where ep.event_id = p_event_id and ep.user_id is not null
    union
    select i.invitee_id from event_invitations i where i.event_id = p_event_id and i.invitee_id is not null
    union
    select gm.user_id from group_members gm
      where v_ev.is_private = false and v_ev.group_id is not null and gm.group_id = v_ev.group_id
  )
  select p.id, p.full_name, p.avatar_url,
         (select ep2.status from event_participants ep2 where ep2.event_id = p_event_id and ep2.user_id = p.id)
  from pool
  join profiles p on p.id = pool.uid
  where _partner_available(p_event_id, v_user, pool.uid)
  order by p.full_name nulls last, p.id;
end; $$;
revoke execute on function event_partner_candidates(uuid) from public, anon, authenticated;
grant execute on function event_partner_candidates(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- D5: create_event (0098 body) — public group events notify instead of inviting
-- ---------------------------------------------------------------------------------------------
create or replace function create_event(p_payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_group uuid := nullif(p_payload->>'group_id','')::uuid;
  v_private boolean := coalesce((p_payload->>'is_private')::boolean, false);
  v_spec text := p_payload->>'specification';
  v_org_role text := p_payload->>'organizer_role';
  v_recurring boolean := (p_payload->'series') is not null and (p_payload->'series') <> 'null'::jsonb;
  v_event uuid; v_series uuid; v_cid uuid; v_inv jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if v_group is not null then
    select community_id into v_cid from groups where id = v_group and archived_at is null;
    if v_cid is null then raise exception 'group_not_found' using errcode='P0001'; end if;
    if not may_create_event(v_cid) then raise exception 'forbidden' using errcode='P0001'; end if;
    if (select is_private from groups where id = v_group) and not is_group_member(v_group) then
      raise exception 'forbidden' using errcode='P0001'; end if;
  end if;
  if v_group is null then v_private := true; end if;
  if coalesce(btrim(p_payload->>'name'),'') = '' then raise exception 'name_required' using errcode='P0001'; end if;
  if (p_payload->>'event_type') not in ('americano','mexicano','up_and_down')
     or v_spec not in ('classic','mixed','team')
     or (p_payload->>'scoring_mode') not in ('points','time','classic')
     or v_org_role not in ('organizing_only','organizing_and_playing') then
    raise exception 'invalid_event_config' using errcode='P0001'; end if;

  if v_recurring then
    if v_group is null then raise exception 'series_requires_group' using errcode='P0001'; end if;
    insert into event_series (group_id, organizer_id, day_of_week, start_time, duration_minutes, invite_lead_days)
    values (v_group, v_user, (p_payload->'series'->>'day_of_week')::int,
            (p_payload->'series'->>'start_time')::time, (p_payload->'series'->>'duration_minutes')::int,
            (p_payload->'series'->>'invite_lead_days')::int)
    returning id into v_series;
  end if;

  insert into events (group_id, series_id, organizer_id, event_type, specification, scoring_mode,
    scoring_value, venue_id, manual_location_name, manual_location_address, has_location, num_courts,
    starts_at, duration_minutes, allow_standby, standby_spots, is_private, entrance_fee_enabled,
    entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number, players_submit_results,
    organizer_role, name, description, thumbnail_path, location_point, location_text, counts_for_ranking)
  values (v_group, v_series, v_user, p_payload->>'event_type', v_spec, p_payload->>'scoring_mode',
    nullif(p_payload->>'scoring_value','')::int, nullif(p_payload->>'venue_id','')::uuid,
    p_payload->>'manual_location_name', p_payload->>'manual_location_address',
    coalesce((p_payload->>'has_location')::boolean,false), (p_payload->>'num_courts')::int,
    (p_payload->>'starts_at')::timestamptz, (p_payload->>'duration_minutes')::int,
    coalesce((p_payload->>'allow_standby')::boolean,false), nullif(p_payload->>'standby_spots','')::int,
    v_private, coalesce((p_payload->>'entrance_fee_enabled')::boolean,false),
    nullif(p_payload->>'entrance_fee_amount','')::numeric, nullif(p_payload->>'entrance_fee_method',''),
    p_payload->>'entrance_fee_mba_number', coalesce((p_payload->>'players_submit_results')::boolean,false),
    v_org_role, p_payload->>'name', p_payload->>'description', p_payload->>'thumbnail_path',
    case
        when p_payload->>'location_lat' is not null and p_payload->>'location_lng' is not null
        then st_setsrid(st_makepoint((p_payload->>'location_lng')::float8, (p_payload->>'location_lat')::float8), 4326)::geography
      end,
    nullif(p_payload->>'location_text',''),
    (v_group is not null and v_private = false))
  returning id into v_event;

  if jsonb_typeof(p_payload->'court_ids') = 'array' then
    insert into event_courts (event_id, court_id)
    select v_event, (c)::uuid from jsonb_array_elements_text(p_payload->'court_ids') c on conflict do nothing;
  end if;

  if v_org_role = 'organizing_and_playing' then
    insert into event_participants (event_id, user_id, status, confirmed_at, joined_at)
    values (v_event, v_user, 'confirmed', now(), now());
  end if;

  if v_group is not null and v_private = false then
    -- NEW (D5): no invitations for a public group event (was: one per member but the organizer).
    -- Members are told the event exists and see Join.
    perform _notify_event_created(v_event);
  else
    if jsonb_typeof(p_payload->'invitees') = 'array' then
      for v_inv in select * from jsonb_array_elements(p_payload->'invitees') loop
        insert into event_invitations (event_id, invitee_id, invitee_name, invitee_email, invitee_phone, invited_by)
        values (v_event, nullif(v_inv->>'invitee_id','')::uuid, v_inv->>'name', v_inv->>'email', v_inv->>'phone', v_user);
      end loop;
    end if;
  end if;
  return v_event;
end; $$;

-- ---------------------------------------------------------------------------------------------
-- D5: materialize_occurrence (0086 body)
-- ---------------------------------------------------------------------------------------------
create or replace function materialize_occurrence(p_after_event_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_src  events%rowtype;
  v_s    event_series%rowtype;
  v_target timestamptz;
  v_existing uuid;
  v_new uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_src from events where id = p_after_event_id and deleted_at is null;
  if v_src.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_src.series_id is null then raise exception 'event_not_found' using errcode='P0001'; end if;

  select * into v_s from event_series where id = v_src.series_id;
  if v_s.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_s.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if not v_s.is_active or v_s.deleted_at is not null then
    raise exception 'series_inactive' using errcode='P0001';
  end if;

  v_target := v_src.starts_at + interval '7 days';

  select id into v_existing from events
   where series_id = v_src.series_id and starts_at = v_target and deleted_at is null;
  if v_existing is not null then return v_existing; end if;

  begin
    insert into events (
      group_id, series_id, organizer_id, event_type, specification, scoring_mode, scoring_value,
      venue_id, manual_location_name, manual_location_address, has_location, num_courts,
      starts_at, duration_minutes, allow_standby, standby_spots, is_private,
      entrance_fee_enabled, entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number,
      players_submit_results, organizer_role, name, description, thumbnail_path,
      status, counts_for_ranking, location_point, location_text
    )
    select
      group_id, series_id, organizer_id, event_type, specification, scoring_mode, scoring_value,
      venue_id, manual_location_name, manual_location_address, has_location, num_courts,
      v_target, duration_minutes, allow_standby, standby_spots, is_private,
      entrance_fee_enabled, entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number,
      players_submit_results, organizer_role, name, description, thumbnail_path,
      'scheduled', counts_for_ranking, location_point, location_text
    from events where id = p_after_event_id
    returning id into v_new;
  exception when unique_violation then
    select id into v_existing from events
     where series_id = v_src.series_id and starts_at = v_target and deleted_at is null;
    return v_existing;
  end;

  if v_src.group_id is not null and not v_src.is_private then
    -- NEW (D5): a public group occurrence invites nobody; the group is told instead.
    perform _notify_event_created(v_new);
  else
    -- Copy invitations only (as fresh pending); confirmed participants are NOT copied.
    insert into event_invitations (event_id, invitee_id, invitee_name, invitee_email, invitee_phone,
                                   status, invited_by, invited_at)
    select v_new, invitee_id, invitee_name, invitee_email, invitee_phone,
           'pending', v_user, now()
    from event_invitations where event_id = p_after_event_id;
  end if;

  return v_new;
end; $$;

-- ---------------------------------------------------------------------------------------------
-- D5: duplicate_event (0098 body)
-- ---------------------------------------------------------------------------------------------
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

  if v_src.group_id is not null then
    select community_id into v_cid from groups where id = v_src.group_id and archived_at is null;
    if v_cid is null then raise exception 'group_not_found' using errcode='P0001'; end if;
    if not may_create_event(v_cid) then raise exception 'forbidden' using errcode='P0001'; end if;
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

  if v_src.group_id is not null and not v_src.is_private then
    -- NEW (D5): a public group copy invites nobody; the group is told instead.
    perform _notify_event_created(v_new);
  else
    -- JM-39: copy invitations only (reset to pending); do NOT copy participants/waiting-list.
    insert into event_invitations (event_id, invitee_id, invitee_name, invitee_email, invitee_phone, status, invited_by)
    select v_new, invitee_id, invitee_name, invitee_email, invitee_phone, 'pending', v_user
    from event_invitations where event_id = p_event_id;
  end if;

  return v_new;
end; $$;

-- ---------------------------------------------------------------------------------------------
-- UX-JEVT-01: my_events (0090 body) + 'pending' + p_include_past; 'going' widened
--
--   organizing  events I organize.
--   going       events where I hold a roster row: confirmed, waiting_list or interested (NEW; was
--               confirmed only).
--   pending     NEW: events with a pending invitation for me that I can still answer (scheduled,
--               before the 6 h cut-off) and where I hold no roster row. An invitation stops being
--               "pending" once it cannot be accepted, so past ones never show, whatever the toggle.
--   all         the union of the three.
--
--   Window, p_include_past = false (default, unchanged): in progress, or scheduled through the
--   booked slot plus a 3 h grace window (0090).
--   p_include_past = true: also completed events and scheduled events past that window. Cancelled
--   events are never listed (as before) — their players already got an event_cancelled notification,
--   and the event itself stays reachable from it.
--   Ordering: current events first, soonest first (unchanged); then past events, most recent first.
-- ---------------------------------------------------------------------------------------------
drop function if exists my_events(text, int, int);
create function my_events(
  p_filter text default 'all',
  p_limit  int  default 20,
  p_offset int  default 0,
  p_include_past boolean default false                                               -- NEW
)
returns setof events
language sql stable security definer set search_path = public as $$
  select e.*
  from events e
  cross join lateral (
    select case when p_filter in ('organizing','going','pending') then p_filter else 'all' end as f   -- NEW ('pending')
  ) nf
  cross join lateral (
    select (e.status = 'in_progress'
            or (e.status = 'scheduled'
                and e.starts_at + make_interval(mins => e.duration_minutes) + interval '3 hours' >= now())) as cur
  ) w
  where e.deleted_at is null
    and (w.cur or (p_include_past and e.status in ('scheduled','completed')))          -- NEW (past)
    and (
      (nf.f in ('all','organizing') and e.organizer_id = auth.uid())
      or
      (nf.f in ('all','going') and exists (
        select 1 from event_participants ep
        where ep.event_id = e.id
          and ep.user_id = auth.uid()
          and ep.status in ('confirmed','waiting_list','interested')                  -- NEW (was confirmed)
      ))
      or
      (nf.f in ('all','pending')                                                      -- NEW
        and e.status = 'scheduled' and now() <= e.starts_at - interval '6 hours'
        and exists (select 1 from event_invitations i
                    where i.event_id = e.id and i.invitee_id = auth.uid() and i.status = 'pending')
        and not exists (select 1 from event_participants ep2
                        where ep2.event_id = e.id and ep2.user_id = auth.uid()))
    )
  order by w.cur desc,                                                                 -- NEW
           case when w.cur then e.starts_at end asc,
           case when not w.cur then e.starts_at end desc,
           e.id
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;
revoke execute on function my_events(text, int, int, boolean) from public, anon, authenticated;
grant execute on function my_events(text, int, int, boolean) to authenticated;
comment on function my_events(text, int, int, boolean) is
  'The viewer''s events by tab (all | organizing | going | pending). Going = confirmed, waiting list or interested; pending = an invitation still answerable. Current events first (scheduled through the slot + 3h grace, or in progress), soonest first; p_include_past adds completed and older scheduled events, most recent first. Cancelled never listed.';

-- ---------------------------------------------------------------------------------------------
-- UX-JEVT-08 / decision 14: who is invited and has not answered, for anyone who can see the event.
-- Explicit profile columns only (never phone/email); manual invitees by name; blocked either way
-- and deleted accounts left out; someone already on the roster is not "invited".
-- ---------------------------------------------------------------------------------------------
create or replace function event_invited_players(p_event_id uuid)
returns table (invitation_id uuid, user_id uuid, full_name text, avatar_url text,
               invitee_name text, invited_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not event_is_visible(p_event_id, v_user) then
    raise exception 'event_not_found' using errcode='P0001'; end if;
  return query
  select i.id, i.invitee_id, p.full_name, p.avatar_url,
         case when i.invitee_id is null then i.invitee_name end, i.invited_at
  from event_invitations i
  left join profiles p on p.id = i.invitee_id
  where i.event_id = p_event_id and i.status = 'pending'
    and (i.invitee_id is null
         or (p.id is not null and p.deleted_at is null and not notif_blocked(v_user, i.invitee_id)))
    and not exists (select 1 from event_participants ep
                    where ep.event_id = p_event_id and ep.user_id = i.invitee_id)
  order by coalesce(p.full_name, i.invitee_name) nulls last, i.id;
end; $$;
revoke execute on function event_invited_players(uuid) from public, anon, authenticated;
grant execute on function event_invited_players(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- One-off (D5): public group events carry no invitations. Delete the PENDING ones on scheduled
-- events (answered ones are history and stay). Their unanswered `event_invite` notifications would
-- now offer a Join CTA that calls accept_event_invitation → invitation_not_found, so they become
-- `event_created` notifications: same event, no CTA, and the event screen shows Join.
-- ---------------------------------------------------------------------------------------------
with gone as (
  delete from event_invitations i
  using events e
  where e.id = i.event_id and i.status = 'pending'
    and e.group_id is not null and e.is_private = false
    and e.status = 'scheduled' and e.deleted_at is null
  returning i.event_id, i.invitee_id
)
update notifications n set type = 'event_created'
from gone
where n.event_id = gone.event_id and n.user_id = gone.invitee_id
  and n.type = 'event_invite' and not n.cta_done;

-- Self-check so a partial paste into the hosted SQL editor cannot silently leave a helper open.
do $$
declare v_open text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_open
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('_mixed_gender_full','_has_waiters','_waiter_can_claim','_may_enter_team_flow',
                      '_notify_event_created','_reset_invitation_after_leave','_drop_partner',
                      '_renumber_waiting_list','notify_waitlist_spot')
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if v_open is not null then
    raise exception 'internal helpers still executable by anon/authenticated: %', v_open;
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'my_events'
             and pronargs = 3) then
    raise exception 'the 3-argument my_events overload is still present';
  end if;
  if has_function_privilege('anon', 'public.event_invited_players(uuid)', 'execute') then
    raise exception 'event_invited_players is executable by anon';
  end if;
end $$;

commit;
