-- 0121_manage_integrity.sql
-- UX Audit — Manage Event, plan PR "0121 — manage integrity" (docs/audit/2026-09-29-ux-manage-event-plan.md):
-- bugs B1–B7, B9 and decision D8.
--
--   B1  Organizers could INSERT/UPDATE/DELETE `events` and `event_series` straight through PostgREST:
--       0040 granted every privilege to authenticated and 0044's policies only required
--       organizer_id = auth.uid(). A PATCH changed modality, group, status, counts_for_ranking or
--       deleted_at past every RPC guard; an event_series PATCH skipped the recurring cap. Every app
--       write goes through a SECURITY DEFINER RPC (create_event, update_event, cancel_event,
--       duplicate_event, start_event, finish_event, materialize_occurrence, …) — the only client
--       queries on either table are SELECTs (packages/api/src/events/queries.ts), and the seeds and
--       db tests write them with the service role. So INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES
--       and TRIGGER are revoked from anon and authenticated (SELECT stays) and the now-dead
--       insert/update/delete policies are dropped. SECURITY DEFINER functions run as the owner and
--       are unaffected; FK actions (groups → events on delete set null) do not check grants.
--   B2  Organizer roster RPCs had no event-status check (removing a player mid-event cascades
--       match_players and corrupts standings) and several took no roster lock. One helper,
--       _organizer_roster_guard, now takes the `event_roster:` lock (the one every join path takes)
--       and THEN reads the event, so a start or cancel that commits first is seen:
--         organizer_remove_participant, add_manual_participant, organizer_mark_confirmed,
--         organizer_assign_to_team, organizer_remove_from_team, organizer_switch_players
--                              → the event must be 'scheduled' (new code event_not_editable);
--         mark_paid, mark_all_paid
--                              → 'scheduled', 'in_progress' or 'completed'. DECISION: payments are
--                                settled after the games too — plan D16 keeps "Paid" on the
--                                completed dashboard — so only a cancelled event refuses them.
--       A soft-deleted event raises event_not_found. Participant rows are re-read under the lock.
--   B3  organizer_switch_players accepted participants of another event: both must belong to
--       p_event_id (participant_not_found). organizer_remove_from_team checks the same.
--   B4  add_manual_participant now follows create_event's guest rules (0113): name trimmed, 1..60
--       characters (blank keeps name_required, longer is invalid_guest_name); on a mixed event a
--       male/female gender (guest_gender_required — was gender_required, the caller's-profile code),
--       elsewhere anything but male/female is stored as null (the column's CHECK refused 'other'
--       with a raw 23514); event_full past capacity, gender_full past a mixed half
--       (_mixed_gender_full); a guest beyond the regular spots is stand-by. The organizer is
--       building the roster, so a guest who does not fit is refused, not waitlisted — exactly as the
--       wizard's guests. (0112's "organizer override is unrestricted" now applies to
--       organizer_mark_confirmed only; 0122 narrows that one.)
--   B5  mark_all_paid marks confirmed participants only (was every row: waiting, interested, invited).
--   B6  finish_event requires 'in_progress' (new code event_not_in_progress), read under its
--       `event:finish:` lock. A scheduled or cancelled event can no longer publish results, and a
--       second finish of a completed event is refused instead of re-publishing (its notification
--       guard is therefore always true and is dropped).
--   B7  start_event takes the `event_roster:` lock BEFORE its `event:` lock (no function takes the
--       two in the other order: generate_next_round takes `event:` only, the join paths
--       `event_roster:` only), then re-reads the event. Its blocking rules are unchanged (0122).
--       For the lock to close the race the join paths must read the status AFTER it, so
--       _assert_can_confirm (0111) — which accept_event_invitation, choose_partner,
--       choose_guest_partner, accept_partner_request and request_partner call before locking — now
--       takes the roster lock itself and is VOLATILE (a STABLE function would read with its caller's
--       pre-lock snapshot). Advisory locks are re-entrant, so the callers' own lock is a no-op.
--       join_event and claim_waitlist_spot read the status themselves and are redefined to go
--       through the helper.
--   B9  _materialize_next and duplicate_event seat an 'organizing_and_playing' organizer as
--       confirmed, as create_event does (a duplicate's organizer is the caller).
--   D8  The organizer is always eligible for their own event: join_event skips the private-invitee
--       (not_invited) and public-group-member (forbidden) checks for events.organizer_id, and
--       _may_enter_team_flow — the one gate of choose_partner, choose_guest_partner,
--       request_partner, accept_partner_request and event_partner_candidates — admits them. The
--       organizer joining a public group event is not added to the group/community (they run it).
--       DECISION: every other join rule still applies to the organizer — status, the 6 h cut-off,
--       capacity, the mixed halves and the waiting list. There is no organizer override on the
--       self-join paths today (the only override is organizer_mark_confirmed, which skips capacity),
--       so the audit's "at any point" is read as "whatever the invitation list says", not "past the
--       cut-off"; the organizer can still seat themselves late through the roster tools.
--       _partner_available is unchanged: an organizer who does not play (no participant row) is
--       still not offered to others as a partner.
--
-- Every redefined function is its latest body (organizer_remove_participant, join_event,
-- claim_waitlist_spot, _may_enter_team_flow 0112; organizer_mark_confirmed, add_manual_participant,
-- mark_paid, mark_all_paid, organizer_assign_to_team, organizer_remove_from_team,
-- organizer_switch_players 0081; _assert_can_confirm 0111; start_event 0092; finish_event 0093;
-- _materialize_next, duplicate_event 0117) plus the lines marked NEW.
-- New error codes: event_not_editable, event_not_in_progress.

begin;

-- ---------------------------------------------------------------------------------------------
-- B1: no direct writes to events / event_series
-- ---------------------------------------------------------------------------------------------
revoke insert, update, delete, truncate, references, trigger on events from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on event_series from anon, authenticated;

drop policy if exists "events: insert" on events;
drop policy if exists "events: update" on events;
drop policy if exists "events: delete" on events;
drop policy if exists "event_series: insert" on event_series;
drop policy if exists "event_series: update" on event_series;
drop policy if exists "event_series: delete" on event_series;

-- ---------------------------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------------------------

-- B2: the organizer roster tools' gate. Takes the roster lock FIRST, then reads the event, so a
-- start / cancel that committed while we waited is seen. Volatile on purpose (fresh snapshot).
create or replace function _organizer_roster_guard(p_event_id uuid, p_payments boolean default false)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_status text; v_deleted timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  select status, deleted_at into v_status, v_deleted from events where id = p_event_id;
  if v_status is null or v_deleted is not null then
    raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_status = 'scheduled' then return; end if;
  if p_payments and v_status in ('in_progress', 'completed') then return; end if;
  raise exception 'event_not_editable' using errcode='P0001';
end; $$;
revoke execute on function _organizer_roster_guard(uuid, boolean) from public, anon, authenticated;

-- B7: _assert_can_confirm (0111 body) — now takes the roster lock before reading, and is VOLATILE.
create or replace function _assert_can_confirm(p_event_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_status text; v_starts timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));  -- NEW (B7)
  select status, starts_at into v_status, v_starts from events where id = p_event_id and deleted_at is null;
  if v_status is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_status <> 'scheduled' then raise exception 'event_closed' using errcode='P0001'; end if;
  if now() > v_starts - interval '6 hours' then raise exception 'event_closed' using errcode='P0001'; end if;
end; $$;
revoke execute on function _assert_can_confirm(uuid) from public, anon, authenticated;

-- D8: _may_enter_team_flow (0112 body) + the event's organizer.
create or replace function _may_enter_team_flow(p_event_id uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_event_invitee(p_event_id, p_user) or is_event_participant(p_event_id, p_user)
    or exists (select 1 from events ev join group_members gm on gm.group_id = ev.group_id
               where ev.id = p_event_id and ev.is_private = false and gm.user_id = p_user)
    or exists (select 1 from events ev where ev.id = p_event_id and ev.organizer_id = p_user);  -- NEW (D8)
$$;
revoke execute on function _may_enter_team_flow(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- D8 + B7: join_event (0112 body)
-- ---------------------------------------------------------------------------------------------
create or replace function join_event(p_event_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype;
        v_confirmed int; v_cap int; v_reg int; v_status text; v_standby boolean := false; v_pos int;
        v_gender text; v_gender_full boolean := false;
        v_is_org boolean;                                                             -- NEW (D8)
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  -- NEW (B7): lock, then status + cut-off (event_not_found / event_closed as before).
  perform _assert_can_confirm(p_event_id);
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  v_is_org := v_ev.organizer_id = v_user;                                             -- NEW (D8)
  if not v_is_org and v_ev.is_private and not is_event_invitee(p_event_id, v_user) then
    raise exception 'not_invited' using errcode='P0001'; end if;
  if not v_is_org and not v_ev.is_private and v_ev.group_id is not null
     and not is_group_member(v_ev.group_id) then
    raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.specification = 'team' then raise exception 'use_team_join' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  if exists (select 1 from event_participants where event_id=p_event_id and user_id=v_user) then
    raise exception 'already_joined' using errcode='P0001'; end if;

  -- D8 (0112): a mixed event needs the joiner's gender, and a full half waitlists them.
  if v_ev.specification = 'mixed' then
    select gender into v_gender from profiles where id = v_user;
    if v_gender is null then raise exception 'gender_required' using errcode='P0001'; end if;
    v_gender_full := _mixed_gender_full(p_event_id, v_gender);
  end if;

  v_reg := v_ev.num_courts * 4;
  v_cap := event_capacity(p_event_id);
  select count(*) into v_confirmed from event_participants where event_id=p_event_id and status='confirmed';
  if v_confirmed >= v_cap
     or v_gender_full
     or _has_waiters(p_event_id, v_gender) then
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

  if not v_ev.is_private and v_ev.group_id is not null and not v_is_org then          -- NEW (D8: not the organizer)
    insert into community_members (community_id, user_id, role)
      values (event_group_community(p_event_id), v_user, 'member') on conflict do nothing;
    insert into group_members (group_id, user_id) values (v_ev.group_id, v_user) on conflict do nothing;
  end if;
  update event_invitations set status='accepted', responded_at=now()
    where event_id=p_event_id and invitee_id=v_user and status='pending';
  if v_status = 'waiting_list' then perform notify_waitlist_spot(p_event_id, null); end if;
  return v_status;
end; $$;

-- ---------------------------------------------------------------------------------------------
-- B7: claim_waitlist_spot (0112 body) — status and cut-off read under the roster lock
-- ---------------------------------------------------------------------------------------------
create or replace function claim_waitlist_spot(p_event_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_pid uuid; v_confirmed int; v_reg int;
        v_cap int; v_pair uuid; v_pair_user uuid; v_gender text; v_team int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  perform _assert_can_confirm(p_event_id);                                            -- NEW (B7; was read before the lock)
  select * into v_ev from events where id = p_event_id and deleted_at is null;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  select id, pair_participant_id into v_pid, v_pair from event_participants
    where event_id = p_event_id and user_id = v_user and status = 'waiting_list';
  if v_pid is null then raise exception 'not_on_waiting_list' using errcode='P0001'; end if;

  v_reg := v_ev.num_courts * 4;
  v_cap := event_capacity(p_event_id);
  select count(*) into v_confirmed from event_participants where event_id = p_event_id and status = 'confirmed';

  if v_ev.specification = 'team' then
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
    where user_id in (v_user, v_pair_user) and event_id = p_event_id
      and type = 'waitlist_spot' and not cta_done;
  update notifications n set read_at = now()
    from event_participants ep
    where n.event_id = p_event_id and n.type = 'waitlist_spot' and n.read_at is null and not n.cta_done
      and ep.event_id = p_event_id and ep.user_id = n.user_id and ep.status = 'waiting_list'
      and not _waiter_can_claim(p_event_id, ep.id);
  perform notify_waitlist_spot(p_event_id, null);
  return 'confirmed';
end; $$;

-- ---------------------------------------------------------------------------------------------
-- B2: organizer_mark_confirmed (0081 body)
-- ---------------------------------------------------------------------------------------------
create or replace function organizer_mark_confirmed(p_participant_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select event_id into v_event from event_participants where id = p_participant_id;
  if v_event is null then raise exception 'participant_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform _organizer_roster_guard(v_event);                                           -- NEW (B2)
  if not exists (select 1 from event_participants where id = p_participant_id) then  -- NEW (re-read under the lock)
    raise exception 'participant_not_found' using errcode='P0001'; end if;
  -- organizer override: no capacity check
  update event_participants set status='confirmed', confirmed_at=now(), waiting_list_position=null
    where id = p_participant_id;
  insert into event_activity (event_id, actor_id, action, detail)
  select v_event, v_user, 'confirmed', jsonb_build_object('target_name', coalesce(p.full_name, ep.guest_name))
  from event_participants ep left join profiles p on p.id = ep.user_id
  where ep.id = p_participant_id;
end; $$;

-- ---------------------------------------------------------------------------------------------
-- B2: organizer_remove_participant (0112 body)
-- ---------------------------------------------------------------------------------------------
create or replace function organizer_remove_participant(p_participant_id uuid, p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid; v_target_user uuid; v_org uuid; v_target_name text;
        v_was_confirmed boolean;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_mode not in ('to_invited','from_event') then raise exception 'invalid_mode' using errcode='P0001'; end if;
  select event_id into v_event from event_participants where id = p_participant_id;
  if v_event is null then raise exception 'participant_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform _organizer_roster_guard(v_event);                                           -- NEW (B2)
  -- NEW: the row is read under the lock (a concurrent removal or leave may have taken it).
  select user_id, status = 'confirmed' into v_target_user, v_was_confirmed
    from event_participants where id = p_participant_id;
  if not found then raise exception 'participant_not_found' using errcode='P0001'; end if;
  select organizer_id into v_org from events where id = v_event;

  select coalesce(p.full_name, ep.guest_name) into v_target_name
    from event_participants ep left join profiles p on p.id = ep.user_id where ep.id = p_participant_id;

  delete from event_participants where id = p_participant_id;
  if v_target_user is not null then
    delete from partner_requests where event_id=v_event and requester_id=v_target_user and status='pending';
    update partner_requests set status='declined', responded_at=now(), closed_by_system=true
      where event_id=v_event and target_id=v_target_user and status='pending';
  end if;
  if p_mode = 'to_invited' and v_target_user is not null
     and exists (select 1 from events e join group_members gm on gm.group_id = e.group_id
                 where e.id = v_event and not e.is_private and gm.user_id = v_target_user) then
    delete from event_invitations where event_id=v_event and invitee_id=v_target_user;
  elsif p_mode = 'to_invited' then
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
  perform _renumber_waiting_list(v_event);
  perform notify_waitlist_spot(v_event, v_user);
end; $$;

-- ---------------------------------------------------------------------------------------------
-- B2 + B4: add_manual_participant (0081 body) — create_event's guest rules
-- ---------------------------------------------------------------------------------------------
create or replace function add_manual_participant(p_event_id uuid, p_name text, p_gender text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_pid uuid;
        v_name text := btrim(p_name);                                                 -- NEW
        v_gender text; v_cap int; v_reg int; v_confirmed int;                         -- NEW
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if coalesce(v_name,'') = '' then raise exception 'name_required' using errcode='P0001'; end if;
  if char_length(v_name) > 60 then raise exception 'invalid_guest_name' using errcode='P0001'; end if;  -- NEW (0113 cap)
  perform _organizer_roster_guard(p_event_id);                                        -- NEW (B2)
  select * into v_ev from events where id = p_event_id;

  -- NEW (B4): as create_event's guests (0113).
  if v_ev.specification = 'mixed' then
    if p_gender is null or p_gender not in ('male','female') then
      raise exception 'guest_gender_required' using errcode='P0001'; end if;
    v_gender := p_gender;
  else
    v_gender := case when p_gender in ('male','female') then p_gender end;
  end if;
  v_cap := event_capacity(p_event_id);
  v_reg := v_ev.num_courts * 4;
  select count(*) into v_confirmed from event_participants where event_id = p_event_id and status = 'confirmed';
  if v_confirmed >= v_cap then raise exception 'event_full' using errcode='P0001'; end if;
  if v_ev.specification = 'mixed' and _mixed_gender_full(p_event_id, v_gender) then
    raise exception 'gender_full' using errcode='P0001'; end if;

  insert into event_participants (event_id, guest_name, guest_gender, status, is_standby, confirmed_at, joined_at, invited_by)
    values (p_event_id, v_name, v_gender, 'confirmed', v_confirmed >= v_reg, now(), now(), v_user)
    returning id into v_pid;
  insert into event_activity (event_id, actor_id, action, detail)
  values (p_event_id, v_user, 'guest_added', jsonb_build_object('guest_name', v_name));
  return v_pid;
end; $$;

-- ---------------------------------------------------------------------------------------------
-- B2: mark_paid (0081 body) — any status but cancelled (see the header)
-- ---------------------------------------------------------------------------------------------
create or replace function mark_paid(p_participant_id uuid, p_paid boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select event_id into v_event from event_participants where id = p_participant_id;
  if v_event is null then raise exception 'participant_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform _organizer_roster_guard(v_event, true);                                     -- NEW (B2)
  update event_participants set has_paid=p_paid, paid_at = case when p_paid then now() else null end
    where id = p_participant_id;
  insert into event_activity (event_id, actor_id, action, detail)
  select v_event, v_user, case when p_paid then 'marked_paid' else 'marked_unpaid' end,
         jsonb_build_object('target_name', coalesce(p.full_name, ep.guest_name))
  from event_participants ep left join profiles p on p.id = ep.user_id where ep.id = p_participant_id;
end; $$;

-- ---------------------------------------------------------------------------------------------
-- B2 + B5: mark_all_paid (0081 body) — confirmed participants only
-- ---------------------------------------------------------------------------------------------
create or replace function mark_all_paid(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform _organizer_roster_guard(p_event_id, true);                                  -- NEW (B2)
  update event_participants set has_paid=true, paid_at=now()
    where event_id=p_event_id and has_paid=false
      and status='confirmed';                                                         -- NEW (B5)
  insert into event_activity (event_id, actor_id, action, detail)
  values (p_event_id, v_user, 'marked_all_paid', '{}'::jsonb);
end; $$;

-- ---------------------------------------------------------------------------------------------
-- B2: organizer_assign_to_team (0081 body)
-- ---------------------------------------------------------------------------------------------
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
  perform _organizer_roster_guard(p_event_id);                                        -- NEW (B2; was the bare lock below)
  select * into v_ev from events where id = p_event_id;                               -- NEW (re-read under the lock)
  if v_ev.specification <> 'team' then raise exception 'not_a_team_event' using errcode='P0001'; end if;
  if p_slot not in ('a','b') then raise exception 'invalid_slot' using errcode='P0001'; end if;
  if p_team_number < 1 or p_team_number > v_ev.num_courts * 2 then
    raise exception 'invalid_team' using errcode='P0001'; end if;
  if not exists (select 1 from event_participants where id = p_participant_id and event_id = p_event_id) then
    raise exception 'participant_not_found' using errcode='P0001'; end if;

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
  insert into event_activity (event_id, actor_id, action, detail)
  select p_event_id, v_user, 'team_assigned',
         jsonb_build_object('target_name', coalesce(p.full_name, ep.guest_name), 'team_number', p_team_number)
  from event_participants ep left join profiles p on p.id = ep.user_id where ep.id = p_participant_id;
end; $$;

-- ---------------------------------------------------------------------------------------------
-- B2 + B3: organizer_remove_from_team (0081 body)
-- ---------------------------------------------------------------------------------------------
create or replace function organizer_remove_from_team(p_event_id uuid, p_participant_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform _organizer_roster_guard(p_event_id);                                        -- NEW (B2; was the bare lock)
  if not exists (select 1 from event_participants where id = p_participant_id and event_id = p_event_id) then
    raise exception 'participant_not_found' using errcode='P0001'; end if;           -- NEW (B3)
  perform _clear_team_slot(p_event_id, p_participant_id);
  update event_participants
    set status='invited', confirmed_at=null, waiting_list_position=null, is_standby=false
    where id = p_participant_id and event_id = p_event_id;
  insert into event_activity (event_id, actor_id, action, detail)
  select p_event_id, v_user, 'team_removed', jsonb_build_object('target_name', coalesce(p.full_name, ep.guest_name))
  from event_participants ep left join profiles p on p.id = ep.user_id where ep.id = p_participant_id;
end; $$;

-- ---------------------------------------------------------------------------------------------
-- B2 + B3: organizer_switch_players (0081 body)
-- ---------------------------------------------------------------------------------------------
create or replace function organizer_switch_players(p_event_id uuid, p_a uuid, p_b uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
        a_team uuid; a_slot text; b_team uuid; b_slot text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform _organizer_roster_guard(p_event_id);                                        -- NEW (B2; was the bare lock)
  -- NEW (B3): both players must be participants of THIS event.
  if not exists (select 1 from event_participants where id = p_a and event_id = p_event_id)
     or not exists (select 1 from event_participants where id = p_b and event_id = p_event_id) then
    raise exception 'participant_not_found' using errcode='P0001'; end if;
  if p_a = p_b then return; end if;

  select id, case when player_a_id=p_a then 'a' when player_b_id=p_a then 'b' end
    into a_team, a_slot from event_teams
    where event_id=p_event_id and (player_a_id=p_a or player_b_id=p_a);
  select id, case when player_a_id=p_b then 'a' when player_b_id=p_b then 'b' end
    into b_team, b_slot from event_teams
    where event_id=p_event_id and (player_a_id=p_b or player_b_id=p_b);

  -- Same-team swap is a no-op (the pair is unchanged) and the sequential single-slot UPDATEs
  -- would transiently set both slots equal, tripping the et_distinct CHECK. Skip it.
  if a_team is not null and a_team = b_team then return; end if;

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

  update event_participants
    set status='invited', confirmed_at=null, waiting_list_position=null, is_standby=false
    where id in (p_a, p_b) and event_id=p_event_id
      and not exists (
        select 1 from event_teams
        where event_id=p_event_id
          and (player_a_id=event_participants.id or player_b_id=event_participants.id));

  insert into event_activity (event_id, actor_id, action, detail)
  values (p_event_id, v_user, 'team_switched', '{}'::jsonb);
end; $$;

-- ---------------------------------------------------------------------------------------------
-- B7: start_event (0092 body) — roster lock first, then the event read again under both locks.
-- Blocking rules unchanged (0122 replaces them).
-- ---------------------------------------------------------------------------------------------
create or replace function start_event(p_event_id uuid, p_rounds jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_ev events%rowtype;
  v_confirmed int;
  v_teams int;
  v_play int;
  v_ordered uuid[];
  v_rest uuid[];
  v_round_id uuid;
  v_round jsonb;
  v_rest_pid text;
  v_rn int;
  v_men int;
  v_women int;
  v_unknown int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'event_not_scheduled' using errcode='P0001'; end if;

  -- NEW (B7): the roster lock every join path takes, BEFORE the match-engine lock.
  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('event:'||p_event_id::text, 0));
  -- NEW: re-read under the locks (a cancel, an edit or a second start may have committed first).
  select * into v_ev from events where id = p_event_id;
  if v_ev.deleted_at is not null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'event_not_scheduled' using errcode='P0001'; end if;

  if v_ev.specification = 'mixed' then
    select
      count(*) filter (where coalesce(pr.gender, ep.guest_gender) = 'male'),
      count(*) filter (where coalesce(pr.gender, ep.guest_gender) = 'female'),
      count(*) filter (where coalesce(pr.gender, ep.guest_gender) is null)
      into v_men, v_women, v_unknown
    from event_participants ep
    left join profiles pr on pr.id = ep.user_id
    where ep.event_id = p_event_id and ep.status = 'confirmed';
    if v_unknown > 0 then raise exception 'mixed_gender_missing' using errcode='P0001'; end if;
    if v_men <> v_women then raise exception 'mixed_unbalanced' using errcode='P0001'; end if;
  end if;

  select count(*) into v_confirmed from event_participants
    where event_id = p_event_id and status = 'confirmed';
  if v_confirmed < v_ev.num_courts * 4 then raise exception 'setup_incomplete' using errcode='P0001'; end if;
  if v_ev.specification = 'team' then
    select count(*) into v_teams from event_teams where event_id = p_event_id and is_confirmed;
    if v_teams < v_ev.num_courts * 2 then raise exception 'setup_incomplete' using errcode='P0001'; end if;
  end if;

  update events set status = 'in_progress' where id = p_event_id;

  if p_rounds is not null and jsonb_typeof(p_rounds) = 'array' then
    -- Client-built schedule (Americano / Up&Down bootstrapped client-side).
    for v_round in select * from jsonb_array_elements(p_rounds) loop
      v_rn := (v_round->>'round_number')::int;
      insert into event_rounds (event_id, round_number, status, generated_at)
      values (p_event_id, v_rn,
              case when v_rn = 1 then 'active' else 'pending' end, now())
      returning id into v_round_id;
      perform _persist_round_matches(p_event_id, v_round_id, v_round->'matches');
      for v_rest_pid in select * from jsonb_array_elements_text(coalesce(v_round->'rests','[]'::jsonb)) loop
        insert into round_rest (round_id, participant_id) values (v_round_id, v_rest_pid::uuid);
      end loop;
    end loop;
    return;
  end if;

  -- Server-side bootstrap of ROUND 1 (Mexicano, or any type without a client schedule).
  -- Seed order: non-standby first then standby; within each, by group-ranking
  -- (sum ranking_points desc in the group's OPEN season) when grouped, else random.
  if v_ev.group_id is not null then
    select array_agg(p.id order by p.is_standby asc, coalesce(gr.pts,0) desc, p.joined_at asc)
      into v_ordered
    from event_participants p
    left join (
      select ger.user_id, sum(ger.ranking_points) pts
      from group_event_results ger
      join group_seasons gs on gs.id = ger.group_season_id
      where gs.group_id = v_ev.group_id and gs.ended_at is null
      group by ger.user_id
    ) gr on gr.user_id = p.user_id
    where p.event_id = p_event_id and p.status = 'confirmed';
  else
    select array_agg(p.id order by p.is_standby asc, random())
      into v_ordered
    from event_participants p
    where p.event_id = p_event_id and p.status = 'confirmed';
  end if;

  -- Playing set = largest multiple of 4 that fits courts and confirmed count.
  v_play := least(v_ev.num_courts * 4, (array_length(v_ordered,1) / 4) * 4);
  -- Tail rests this round.
  if array_length(v_ordered,1) > v_play then
    v_rest := v_ordered[v_play+1 : array_length(v_ordered,1)];
  end if;

  insert into event_rounds (event_id, round_number, status, generated_at)
  values (p_event_id, 1, 'active', now())
  returning id into v_round_id;

  perform _persist_round_matches(p_event_id, v_round_id,
    _build_fours_arrangement((v_ordered)[1:v_play]));

  if v_rest is not null then
    insert into round_rest (round_id, participant_id)
    select v_round_id, unnest(v_rest);
  end if;
end; $$;

-- ---------------------------------------------------------------------------------------------
-- B6: finish_event (0093 body) — only an event in progress can publish results
-- ---------------------------------------------------------------------------------------------
create or replace function finish_event(p_event_id uuid, p_finish_message text default null, p_counts_override boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_ev events%rowtype;
  v_early boolean;
  v_counts boolean;
  v_season uuid;
  v_actor text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event:finish:'||p_event_id::text, 0));
  -- NEW (B6): read the status under the lock, so of two concurrent finishes only one publishes.
  select * into v_ev from events where id = p_event_id;
  if v_ev.deleted_at is not null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.status <> 'in_progress' then raise exception 'event_not_in_progress' using errcode='P0001'; end if;

  v_early := exists (
    select 1 from event_matches m where m.event_id = p_event_id and m.status = 'pending');

  if v_ev.is_private or v_ev.group_id is null then
    v_counts := false;
  else
    v_counts := coalesce(p_counts_override, v_ev.counts_for_ranking);
  end if;

  update events set
    status = 'completed',
    published_at = coalesce(published_at, now()),
    finish_message = p_finish_message,
    finished_early = v_early,
    counts_for_ranking = v_counts
  where id = p_event_id;

  if v_counts then
    select id into v_season from group_seasons
      where group_id = v_ev.group_id and ended_at is null;
    if v_season is not null then
      delete from group_event_results where event_id = p_event_id;
      insert into group_event_results (group_season_id, event_id, user_id, final_placement, ranking_points)
      select v_season, p_event_id, p.user_id, s.rank, placement_points(s.rank)
      from standings(p_event_id) s
      join event_participants p on p.id = s.entity_id
      where p.user_id is not null;
    end if;
  end if;

  -- Every confirmed player with an account, the organizer included when they played. The event was
  -- in progress, so this runs once (the 0093 "not completed yet" guard is implied by B6).
  select full_name into v_actor from profiles where id = v_user;
  insert into notifications (user_id, type, actor_id, event_id, actor_name, entity_name)
  select ep.user_id, 'results_published', v_user, p_event_id, v_actor, v_ev.name
  from event_participants ep
  where ep.event_id = p_event_id and ep.status = 'confirmed' and ep.user_id is not null
    and not notif_blocked(ep.user_id, v_user);
end; $$;

-- ---------------------------------------------------------------------------------------------
-- B9: _materialize_next (0117 body) + the organizer who plays is seated
-- ---------------------------------------------------------------------------------------------
create or replace function _materialize_next(p_after_event_id uuid, p_actor uuid, p_target timestamptz default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_src  events%rowtype;
  v_target timestamptz;
  v_existing uuid;
  v_new uuid;
begin
  select * into v_src from events where id = p_after_event_id and deleted_at is null;
  if v_src.id is null or v_src.series_id is null then
    raise exception 'event_not_found' using errcode='P0001';
  end if;
  if v_src.venue_id is not null
     and not exists (select 1 from venues where id = v_src.venue_id and deleted_at is null) then
    raise exception 'venue_not_found' using errcode='P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('series_materialize:' || v_src.series_id::text, 0));

  v_target := coalesce(p_target, _series_slot(v_src.starts_at, 1));

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
      status, counts_for_ranking, location_point, location_text,
      manual_court_names
    )
    select
      group_id, series_id, organizer_id, event_type, specification, scoring_mode, scoring_value,
      venue_id, manual_location_name, manual_location_address, has_location, num_courts,
      v_target, duration_minutes, allow_standby, standby_spots, is_private,
      entrance_fee_enabled, entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number,
      players_submit_results, organizer_role, name, description, thumbnail_path,
      'scheduled', counts_for_ranking, location_point, location_text,
      manual_court_names
    from events where id = p_after_event_id
    returning id into v_new;
  exception when unique_violation then
    select id into v_existing from events
     where series_id = v_src.series_id and starts_at = v_target and deleted_at is null;
    return v_existing;
  end;

  insert into event_courts (event_id, court_id)
  select v_new, court_id from event_courts where event_id = p_after_event_id
  on conflict do nothing;

  -- NEW (B9): an organizer who plays is seated, as create_event does.
  if v_src.organizer_role = 'organizing_and_playing' then
    insert into event_participants (event_id, user_id, status, confirmed_at, joined_at)
    values (v_new, v_src.organizer_id, 'confirmed', now(), now())
    on conflict (event_id, user_id) do nothing;
  end if;

  if v_src.group_id is not null and not v_src.is_private then
    perform _notify_event_created(v_new);
  else
    insert into event_invitations (event_id, invitee_id, invitee_name, invitee_email, invitee_phone,
                                   status, invited_by, invited_at)
    select v_new, ei.invitee_id, ei.invitee_name, ei.invitee_email, ei.invitee_phone,
           'pending', p_actor, now()
    from event_invitations ei
    where ei.event_id = p_after_event_id
      and ei.status <> 'declined'
      and ei.invitee_id is distinct from v_src.organizer_id                             -- NEW (never invite the organizer)
      and (ei.invitee_id is null
           or exists (select 1 from profiles p where p.id = ei.invitee_id and p.deleted_at is null));
  end if;

  return v_new;
end; $$;
revoke execute on function _materialize_next(uuid, uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- B9: duplicate_event (0117 body) + the organizer who plays is seated
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
  if v_src.venue_id is not null
     and not exists (select 1 from venues where id = v_src.venue_id and deleted_at is null) then
    raise exception 'venue_not_found' using errcode='P0001';
  end if;

  insert into events (group_id, series_id, organizer_id, event_type, specification, scoring_mode,
    scoring_value, venue_id, manual_location_name, manual_location_address, has_location, num_courts,
    starts_at, duration_minutes, allow_standby, standby_spots, is_private, entrance_fee_enabled,
    entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number, players_submit_results,
    organizer_role, name, description, thumbnail_path, counts_for_ranking, status,
    finished_early, finish_message, published_at,
    manual_court_names)
  values (v_src.group_id,
    null,
    v_user, v_src.event_type, v_src.specification, v_src.scoring_mode,
    v_src.scoring_value, v_src.venue_id, v_src.manual_location_name, v_src.manual_location_address,
    v_src.has_location, v_src.num_courts,
    coalesce(nullif(p_overrides->>'starts_at','')::timestamptz, now()),
    v_src.duration_minutes, v_src.allow_standby, v_src.standby_spots, v_src.is_private, v_src.entrance_fee_enabled,
    v_src.entrance_fee_amount, v_src.entrance_fee_method, v_src.entrance_fee_mba_number, v_src.players_submit_results,
    v_src.organizer_role, coalesce(p_overrides->>'name', v_src.name), v_src.description,
    coalesce(p_overrides->>'thumbnail_path', v_src.thumbnail_path), v_src.counts_for_ranking, 'scheduled',
    false, null, null,
    v_src.manual_court_names)
  returning id into v_new;

  insert into event_courts (event_id, court_id)
  select v_new, court_id from event_courts where event_id = p_event_id
  on conflict do nothing;

  -- NEW (B9): an organizer who plays is seated, as create_event does.
  if v_src.organizer_role = 'organizing_and_playing' then
    insert into event_participants (event_id, user_id, status, confirmed_at, joined_at)
    values (v_new, v_user, 'confirmed', now(), now())
    on conflict (event_id, user_id) do nothing;
  end if;

  if v_src.group_id is not null and not v_src.is_private then
    perform _notify_event_created(v_new);
  else
    insert into event_invitations (event_id, invitee_id, invitee_name, invitee_email, invitee_phone, status, invited_by)
    select v_new, invitee_id, invitee_name, invitee_email, invitee_phone, 'pending', v_user
    from event_invitations where event_id = p_event_id
      and invitee_id is distinct from v_user;                                           -- NEW (never invite the organizer)
  end if;

  return v_new;
end; $$;
revoke execute on function duplicate_event(uuid, jsonb) from public, anon, authenticated;
grant execute on function duplicate_event(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Self-check (a partial paste into the hosted SQL editor must not pass silently)
-- ---------------------------------------------------------------------------------------------
do $$
declare r text; t text; p text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach t in array array['public.events', 'public.event_series'] loop
      foreach p in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(r, t, p) then
          raise exception '0121: % still holds % on %', r, p, t;
        end if;
      end loop;
    end loop;
  end loop;
  if not has_table_privilege('authenticated', 'public.events', 'SELECT')
     or not has_table_privilege('authenticated', 'public.event_series', 'SELECT') then
    raise exception '0121: authenticated lost SELECT on events / event_series';
  end if;
  if exists (select 1 from pg_policy where polrelid in ('public.events'::regclass, 'public.event_series'::regclass)
             and polcmd <> 'r') then
    raise exception '0121: a write policy is left on events / event_series';
  end if;
  foreach p in array array['public._organizer_roster_guard(uuid, boolean)', 'public._assert_can_confirm(uuid)',
                           'public._may_enter_team_flow(uuid, uuid)',
                           'public._materialize_next(uuid, uuid, timestamptz)'] loop
    if has_function_privilege('anon', p, 'execute') or has_function_privilege('authenticated', p, 'execute') then
      raise exception '0121: % is executable by anon/authenticated', p;
    end if;
  end loop;
  if (select provolatile from pg_proc where oid = 'public._assert_can_confirm(uuid)'::regprocedure) <> 'v' then
    raise exception '0121: _assert_can_confirm must be volatile (it locks, then reads)';
  end if;
end $$;

commit;
