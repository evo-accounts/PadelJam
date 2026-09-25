-- 0111_event_roster_integrity.sql
-- UX Audit — Events, plan PR 1 (docs/audit/2026-09-25-ux-events-plan.md, bugs B1–B6).
--
--   B1  choose_partner checked nothing about the partner: any uuid, a non-invitee of a private
--       event, a blocked user or someone already paired could be confirmed, and a caller who was
--       already paired could form a second team.
--   B2  accept_event_invitation, choose_partner, request_partner and accept_partner_request
--       ignored the 6 h sign-up cut-off (and two of them the 'scheduled' status) that join_event
--       enforces. One helper, _assert_can_confirm, now carries that rule for every self-join path.
--   B3  accept_partner_request declined the REQUESTER's other requests but left the ACCEPTER's
--       other incoming requests pending, and never checked the requester was still available.
--   B4  leave_event left the leaver's sent requests pending, so a later accept re-confirmed
--       someone who had left (JM-15).
--   B5  The target could PATCH partner_requests.status directly, skipping every RPC side effect,
--       and a requester had no way to withdraw.
--   B6  The partner picker listed raw group members — blocked users and people already paired
--       included. event_partner_candidates returns only the users the caller may pick or ask.
--
-- Every redefined function is its latest body (accept_event_invitation 0081, request_partner 0051,
-- leave_event 0093, choose_partner / accept_partner_request / decline_partner_request 0047) plus
-- the lines marked NEW. Error codes are unchanged; one is added: request_stale.
--
-- Two request outcomes, used consistently:
--   declined  the target said no, or the system closed it (a pair formed, the requester is gone).
--   deleted   the requester cancelled it (withdraw_partner_request, leave_event). Deleting rather
--             than declining lets the requester ask the same person again later, which the
--             (event, requester, target) unique key would otherwise block for good.

begin;

-- ---------------------------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------------------------

-- B2: the single "may a player still enter this event" rule. Same test and code as join_event.
create or replace function _assert_can_confirm(p_event_id uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare v_status text; v_starts timestamptz;
begin
  select status, starts_at into v_status, v_starts from events where id = p_event_id and deleted_at is null;
  if v_status is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_status <> 'scheduled' then raise exception 'event_closed' using errcode='P0001'; end if;
  if now() > v_starts - interval '6 hours' then raise exception 'event_closed' using errcode='P0001'; end if;
end; $$;
revoke execute on function _assert_can_confirm(uuid) from public, anon, authenticated;

-- A user holds a team slot or a waiting-list place on this event: they cannot be paired again.
create or replace function _is_paired_or_waiting(p_event_id uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from event_participants ep
    where ep.event_id = p_event_id and ep.user_id = p_user
      and (ep.status = 'waiting_list'
           or exists (select 1 from event_teams t
                      where t.event_id = p_event_id and ep.id in (t.player_a_id, t.player_b_id))));
$$;
revoke execute on function _is_paired_or_waiting(uuid, uuid) from public, anon, authenticated;

-- B1/B6: may p_caller pick or ask p_user as a partner on this event?
--   eligible  a participant already (interested, or confirmed without a team — the organizer who
--             plays), an invitee who has not declined, or — on a public group event — a member of
--             that group other than the organizer who has not declined (create_event invites every
--             member but the organizer, so this mirrors that list and covers later joiners);
--   and       not the caller, a live profile, no block either way, not paired or waiting.
create or replace function _partner_available(p_event_id uuid, p_caller uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and p_user is distinct from p_caller
    and exists (select 1 from profiles p where p.id = p_user and p.deleted_at is null)
    and not notif_blocked(p_caller, p_user)
    and (
      exists (select 1 from event_participants ep where ep.event_id = p_event_id and ep.user_id = p_user)
      or exists (select 1 from event_invitations i
                 where i.event_id = p_event_id and i.invitee_id = p_user and i.status <> 'declined')
      or exists (select 1 from events ev join group_members gm on gm.group_id = ev.group_id
                 where ev.id = p_event_id and ev.is_private = false and gm.user_id = p_user
                   and gm.user_id <> ev.organizer_id
                   and not exists (select 1 from event_invitations i2
                                   where i2.event_id = p_event_id and i2.invitee_id = p_user
                                     and i2.status = 'declined')))
    and not _is_paired_or_waiting(p_event_id, p_user);
$$;
revoke execute on function _partner_available(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- B2: accept_event_invitation (0081 body + the cut-off)
-- ---------------------------------------------------------------------------------------------
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
  perform _assert_can_confirm(p_event_id);                                            -- NEW (B2)

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

-- ---------------------------------------------------------------------------------------------
-- B1 + B2: choose_partner (0047 body + partner/caller checks, cut-off, request clean-up)
-- ---------------------------------------------------------------------------------------------
create or replace function choose_partner(p_event_id uuid, p_partner_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype;
        v_confirmed int; v_cap int; v_caller_pid uuid; v_partner_pid uuid; v_team int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  perform _assert_can_confirm(p_event_id);                                            -- NEW (B2; was status only)
  if v_ev.specification <> 'team' then raise exception 'not_a_team_event' using errcode='P0001'; end if;
  if not (is_event_invitee(p_event_id, v_user) or is_event_participant(p_event_id, v_user)) then
    raise exception 'forbidden' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  -- NEW (B1): no second team for the caller, and only an eligible, unblocked, unpaired partner.
  if _is_paired_or_waiting(p_event_id, v_user) then
    raise exception 'already_joined' using errcode='P0001'; end if;
  if not _partner_available(p_event_id, v_user, p_partner_user) then
    raise exception 'partner_unavailable' using errcode='P0001'; end if;

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

  -- NEW: both players are paired now; close every pending request either of them sent or received.
  update partner_requests set status='declined', responded_at=now()
    where event_id=p_event_id and status='pending'
      and (requester_id in (v_user, p_partner_user) or target_id in (v_user, p_partner_user));
end; $$;

-- ---------------------------------------------------------------------------------------------
-- B2 + B6: request_partner (0051 body + cut-off, caller not paired, targets filtered like B1)
-- ---------------------------------------------------------------------------------------------
create or replace function request_partner(p_event_id uuid, p_targets uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_t uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.specification <> 'team' then raise exception 'not_a_team_event' using errcode='P0001'; end if;
  perform _assert_can_confirm(p_event_id);                                            -- NEW (B2; was status only)
  if not (is_event_invitee(p_event_id, v_user) or is_event_participant(p_event_id, v_user)) then
    raise exception 'forbidden' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));   -- NEW
  -- NEW: a paired (or waiting-listed) player asking again would be demoted to 'interested' below.
  if _is_paired_or_waiting(p_event_id, v_user) then
    raise exception 'already_joined' using errcode='P0001'; end if;

  insert into event_participants (event_id, user_id, status, joined_at, invited_by)
    values (p_event_id, v_user, 'interested', now(), v_ev.organizer_id)
    on conflict (event_id, user_id) do update set status='interested';

  foreach v_t in array coalesce(p_targets, '{}'::uuid[]) loop
    -- only request a target the caller may pick (B1 rules: eligible, unblocked, unpaired);
    -- anyone else is skipped silently, as before.
    if _partner_available(p_event_id, v_user, v_t) then                               -- NEW (was invitee/participant)
      insert into partner_requests (event_id, requester_id, target_id, status)
        values (p_event_id, v_user, v_t, 'pending')
        on conflict (event_id, requester_id, target_id) do nothing;
    end if;
  end loop;
end; $$;

-- ---------------------------------------------------------------------------------------------
-- B2 + B3: accept_partner_request (0047 body + cut-off, stale check, accepter's requests closed)
-- ---------------------------------------------------------------------------------------------
create or replace function accept_partner_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_req partner_requests%rowtype; v_ev events%rowtype;
        v_confirmed int; v_cap int; v_req_pid uuid; v_target_pid uuid; v_team int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_req from partner_requests where id = p_request_id;
  -- NEW: only a pending request can be accepted (an accepted one would form a second team).
  if v_req.id is null or v_req.target_id <> v_user or v_req.status <> 'pending' then
    raise exception 'request_not_found' using errcode='P0001'; end if;
  select * into v_ev from events where id = v_req.event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  perform _assert_can_confirm(v_req.event_id);                                        -- NEW (B2)

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||v_req.event_id::text, 0));
  -- NEW (B3): the accepter must be free, and the requester must still be an unpaired 'interested'
  -- player the accepter is not blocked from. A stale request raises request_stale; the sources of
  -- staleness (leave_event, a pair forming) now close requests themselves, so this is the backstop.
  if _is_paired_or_waiting(v_req.event_id, v_user) then
    raise exception 'already_joined' using errcode='P0001'; end if;
  if not exists (select 1 from event_participants
                 where event_id=v_req.event_id and user_id=v_req.requester_id and status='interested')
     or _is_paired_or_waiting(v_req.event_id, v_req.requester_id)
     or notif_blocked(v_req.requester_id, v_user) then
    raise exception 'request_stale' using errcode='P0001'; end if;

  v_cap := event_capacity(v_req.event_id);
  select count(*) into v_confirmed from event_participants
    where event_id=v_req.event_id and status='confirmed'
      and user_id is distinct from v_req.requester_id and user_id is distinct from v_req.target_id;
  if v_confirmed + 2 > v_cap then raise exception 'event_full' using errcode='P0001'; end if;

  update partner_requests set status='accepted', responded_at=now() where id = p_request_id;
  -- NEW (B3): close every other pending request either player sent or received on this event —
  -- the requester's other asks (as before) AND the accepter's other incoming ones, silently.
  update partner_requests set status='declined', responded_at=now()
    where event_id=v_req.event_id and status='pending' and id <> p_request_id
      and (requester_id in (v_req.requester_id, v_req.target_id)
           or target_id in (v_req.requester_id, v_req.target_id));

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

  -- NEW: mirror choose_partner — a confirmed player's own pending invitation is answered.
  update event_invitations set status='accepted', responded_at=now()
    where event_id=v_req.event_id and invitee_id in (v_req.requester_id, v_req.target_id) and status='pending';
end; $$;

-- ---------------------------------------------------------------------------------------------
-- B5: decline_partner_request (0047 body; NEW: only a pending request can be declined — an
-- accepted one flipped to 'declined' would leave its team standing behind a false status)
-- ---------------------------------------------------------------------------------------------
create or replace function decline_partner_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from partner_requests where id=p_request_id and target_id=v_user and status='pending') then  -- NEW (status)
    raise exception 'request_not_found' using errcode='P0001'; end if;
  update partner_requests set status='declined', responded_at=now()
    where id=p_request_id and target_id=v_user and status='pending';                -- NEW (status)
end; $$;

-- B5: the requester withdraws a pending request. Deleted, not declined (see the header).
create or replace function withdraw_partner_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  delete from partner_requests where id=p_request_id and requester_id=v_user and status='pending';
  if not found then raise exception 'request_not_found' using errcode='P0001'; end if;
end; $$;
revoke execute on function withdraw_partner_request(uuid) from public, anon, authenticated;
grant execute on function withdraw_partner_request(uuid) to authenticated;

-- B5: status changes only through the RPCs above. Inserts were already RPC-only (no policy);
-- the direct DML grants go too, as 0051 did for the other roster tables.
drop policy if exists "partner_requests: respond" on partner_requests;
revoke insert, update, delete on partner_requests from authenticated;

-- ---------------------------------------------------------------------------------------------
-- B4: leave_event (0093 body + the leaver's sent requests withdrawn)
-- ---------------------------------------------------------------------------------------------
create or replace function leave_event(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_pid uuid;
        v_team event_teams%rowtype; v_partner_pid uuid; v_partner_user uuid;
        v_was_confirmed boolean;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if now() > v_ev.starts_at - interval '12 hours' then raise exception 'leave_deadline_passed' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  select id, status = 'confirmed' into v_pid, v_was_confirmed
    from event_participants where event_id=p_event_id and user_id=v_user;
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

  -- NEW (B4): the leaver's pending asks go with them, so no later accept can re-confirm them.
  delete from partner_requests where event_id=p_event_id and requester_id=v_user and status='pending';

  delete from event_participants where id = v_pid;
  -- JM-08: do NOT auto-promote the waiting list; just renumber to stay contiguous.
  with ranked as (
    select id, row_number() over (order by waiting_list_position, joined_at) as rn
    from event_participants where event_id=p_event_id and status='waiting_list')
  update event_participants ep set waiting_list_position = ranked.rn
    from ranked where ep.id = ranked.id and ep.waiting_list_position <> ranked.rn;
  if v_was_confirmed then perform notify_waitlist_spot(p_event_id, v_user); end if;
end; $$;

-- ---------------------------------------------------------------------------------------------
-- B6: who the caller may pick (choose_partner) or ask (request_partner) on a team event
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
  -- Seeing the event (a public community's preview) is not enough: only someone who could enter
  -- it — an invitee, a participant, or a member of its public group — gets the list.
  if not (is_event_invitee(p_event_id, v_user) or is_event_participant(p_event_id, v_user)
          or (v_ev.is_private = false and v_ev.group_id is not null
              and exists (select 1 from group_members gm where gm.group_id = v_ev.group_id and gm.user_id = v_user))) then
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
-- One-off clean-up: close pending requests that are already stale under the new rules — the
-- requester left or is no longer an unpaired 'interested' player, or the target is paired.
-- ---------------------------------------------------------------------------------------------
update partner_requests pr set status='declined', responded_at=now()
where pr.status = 'pending'
  and (not exists (select 1 from event_participants ep
                   where ep.event_id = pr.event_id and ep.user_id = pr.requester_id and ep.status = 'interested')
       or _is_paired_or_waiting(pr.event_id, pr.requester_id)
       or _is_paired_or_waiting(pr.event_id, pr.target_id));

-- Self-check so a partial paste into the hosted SQL editor cannot silently leave a helper open.
do $$
declare v_open text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_open
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('_assert_can_confirm','_is_paired_or_waiting','_partner_available')
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if v_open is not null then
    raise exception 'internal helpers still executable by anon/authenticated: %', v_open;
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.partner_requests'::regclass and polcmd = 'w') then
    raise exception 'partner_requests still has an UPDATE policy';
  end if;
end $$;

commit;
