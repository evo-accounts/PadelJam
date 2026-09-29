-- 0122_manage_rules.sql
-- UX Audit — Manage Event, plan PR "0122 — manage rules" (docs/audit/2026-09-29-ux-manage-event-plan.md):
-- decisions D1–D4, D7, D9, D12–D15 and bugs B8, B11–B13. Stacked on 0121.
--
--   D1   start_event blocks only on: fewer than 4 confirmed (not_enough_players); a mixed event
--        with an unknown gender (mixed_gender_missing) or men ≠ women (mixed_unbalanced); a team
--        event with a confirmed player outside a complete team (teams_incomplete); an odd count
--        with stand-by off (odd_players). start_event raises the first, in that order. The full-capacity rule (setup_incomplete) is gone.
--        New start_event_check(event) → {blockers: [code…], warnings: [{code:'below_capacity',
--        open_spots}, {code:'idle_courts', idle}]} for the start sheet. Starting before starts_at
--        stays allowed. The engine already seats the largest multiple of 4 (round 1, the client
--        Americano schedule) and uses floor(n/4) courts; generate_next_round (Mexicano) assumed a
--        full house — it seated `num_courts * 4` and silently dropped the n % 4 remainder without a
--        round_rest row — and now seats least(courts * 4, floor(n / 4) * 4) and rests the rest.
--        A client-built schedule (start_event's p_rounds) is validated: every id a confirmed
--        participant of THIS event, two distinct players a side, courts 1..num_courts
--        (invalid_participant / invalid_rounds). Was: any uuid was persisted.
--   D2   organizer_mark_confirmed refuses a waiting-list player (waitlist_not_confirmable) and an
--        unpaired player of a team event (team_required — the Teams tab places them through
--        organizer_assign_to_team). It now follows the join rules the organizer builds the roster
--        with (0121's add_manual_participant): event_full past capacity, gender_full past a mixed
--        half, player_gender_required on a mixed event when the player has no gender; stand-by past
--        the regular spots. The old "organizer override: no capacity check" is gone.
--   B12  …and it accepts the pending invitation, renumbers the waiting list, settles offers that
--        can no longer be claimed, and notifies the player (new type organizer_confirmed).
--        organizer_confirm_invitee(event, user[, team, slot]) confirms a PENDING INVITEE who has no
--        participant row (the Invited tab): creates the confirmed row + accepts the invitation. On
--        a team event it takes the team and slot and delegates to organizer_assign_to_team (the
--        player is confirmed once the pair is complete — _reconcile_team's rule).
--   D3   organizer_remove_participant refuses 'to_invited' on a public group event (invalid_mode)
--        and notifies the removed player (new type removed_from_event), in both modes.
--   D9   event_participants.paid_amount numeric(10,2) (backfill: has_paid → the event's fee).
--        has_paid STAYS a stored column (every existing read keeps working) and is maintained by
--        the three writers: mark_paid(true) tops paid_amount up to the current fee, mark_paid(false)
--        zeroes it, mark_all_paid tops up the confirmed; update_event recomputes has_paid when the
--        fee changes (paid_amount >= new fee — a raise makes earlier payers Pending for the
--        difference) and logs fee_changed. DECISION: a stored column over a view/generated column —
--        a generated column cannot read the event's fee, and a view would change every select.
--   D4/B8 duplicate_event: starts_at is required (starts_at_required) and must be in the future
--        (starts_at_in_past); overrides name, thumbnail_path and — when any location key is sent —
--        the whole location (venue_id | manual_location_*, has_location, num_courts,
--        manual_court_names, court_ids, location_lat/lng/text, courts_reserved), validated as
--        update_event validates them (venue_not_found, invalid_court_names, invalid_courts).
--        NOTHING carries over: no invitations (was: copied, declined ones included), players,
--        teams or payments. The playing organizer is still seated (0121). A one-off (series_id
--        null); counts_for_ranking starts at create_event's default, not the source's.
--   D12  invite_to_event: a scheduled event only (_organizer_roster_guard); refused on a public
--        group event (invites_not_allowed); a group event invites group members only
--        (not_group_member); a group-less one any live platform user (user_not_found);
--        blocked either way (blocked); the organizer, participants and anyone already invited
--        (any status) are skipped. New event_invite_candidates(event, query, limit) → rows with a
--        `section`: group event → 'members'; group-less → 'connections' (mutual follows),
--        'following', 'others' (only with a query). Excludes the organizer, participants,
--        invitees (any status), deleted and blocked users. The organizer write policy on
--        event_invitations and the invitee "respond" policy are dropped and INSERT/UPDATE/DELETE
--        revoked (as 0111 did for partner_requests): a direct PostgREST insert skipped every one
--        of these rules. No client writes the table (packages/api only selects it).
--   D7   organizer_add_guest_to_team(event, team, slot, name, gender): a confirmed guest placed in
--        the slot (add_manual_participant's name/capacity rules; slot_taken). The pair is
--        reconciled once both slots are filled.
--   D13  events.courts_reserved (default true). create_event stores the payload's
--        `courts_reserved` (the wizard's "Have not reserved yet" sends false); update_event takes
--        the key, and a non-empty `court_ids` sets it true.
--   D14  update_event: private → public on a group event deletes the pending invitations (a group
--        member's event_invite notification becomes event_created, as 0112's cleanup did) and sends
--        event_created to the members not already participating. A group-less event stays private
--        (standalone_must_be_private — was silently forced). organizer_role is no longer editable
--        (D8: the key is ignored). update_event also takes the roster lock (its capacity checks
--        raced joins) and optional `court_ids` / `manual_court_names`.
--   B13  update_event: a bigger capacity (courts or stand-by spots) offers the new spots to the
--        waiting list (notify_waitlist_spot).
--   D15/B11 Activity is written server-side. One internal helper, _log_activity(event, actor,
--        action, detail). Triggers log what players do, whichever RPC does it:
--          event_participants  joined / waitlist_joined / waitlist_claimed / left
--          event_invitations   invited / invite_accepted / invite_declined
--          partner_requests    partner_invite_sent / partner_invite_accepted / partner_invite_declined
--          event_matches       score_entered / score_edited (organizer) / match_not_played
--          events              event_started / event_finished + results_published / event_cancelled /
--                              ranking_changed
--        The organizer's roster tools keep logging their own actions (confirmed, removed,
--        guest_added, marked_paid, …), so the participant/invitation triggers skip a row the
--        ORGANIZER changes for someone else. update_event logs event_edited (changes: details,
--        preferences, scoring, location, date) and fee_changed. recurrence_on / recurrence_off are
--        reserved for 0123 (in the action CHECK now). The explicit invite_accepted /
--        invite_declined / invited inserts are replaced by the trigger. log_event_activity
--        (client-callable, forgeable) is dropped; event_activity stays organizer-read-only.
--        DECISION: finishing IS publishing (IN-PROGRESS §8.3 "Save and publish results"), so a
--        finish logs event_finished and results_published together.
--
-- Every redefined function is its latest body (0121: organizer_mark_confirmed,
-- organizer_remove_participant, mark_paid, mark_all_paid, start_event, duplicate_event; 0113:
-- create_event, update_event, invite_to_event; 0112: accept_event_invitation; 0081:
-- decline_event_invitation; 0048: generate_next_round, _persist_round_matches) plus the lines
-- marked NEW.
-- New error codes: not_enough_players, odd_players, teams_incomplete, invalid_rounds,
-- waitlist_not_confirmable, team_required, player_gender_required, starts_at_required,
-- starts_at_in_past, invites_not_allowed, not_group_member, blocked, user_not_found,
-- slot_taken, standalone_must_be_private. (setup_incomplete is no longer raised.)
-- New notification types: organizer_confirmed, removed_from_event.
--
-- Known and left for later (outside 0122): the round engine ignores team pairs and mixed pairs
-- when it builds a round (client Americano schedule and _build_fours_arrangement both rotate
-- partners freely), and Up & Down never rotates players who rested in round 1 back in.

begin;

-- ---------------------------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------------------------

-- D13
alter table events add column if not exists courts_reserved boolean not null default true;
comment on column events.courts_reserved is
  'False when the organizer chose "Have not reserved yet" (UX-MEVT-24 pending action). Set true by picking courts.';

-- D9
alter table event_participants add column if not exists paid_amount numeric(10,2) not null default 0;
alter table event_participants drop constraint if exists ep_paid_amount_nonneg;
alter table event_participants add constraint ep_paid_amount_nonneg check (paid_amount >= 0);
comment on column event_participants.paid_amount is
  'Amount credited (UX-MEVT-05/16). has_paid = paid_amount covers the current fee; maintained by mark_paid, mark_all_paid, update_event.';

-- The fee a participant owes today (0 when the event has none).
create or replace function _event_fee(p_event_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when entrance_fee_enabled then coalesce(entrance_fee_amount, 0) else 0 end
  from events where id = p_event_id;
$$;
revoke execute on function _event_fee(uuid) from public, anon, authenticated;

update event_participants ep set paid_amount = coalesce(e.entrance_fee_amount, 0)
  from events e
  where e.id = ep.event_id and ep.has_paid and ep.paid_amount = 0;

-- New notification types; every existing one kept (latest list: 0113).
alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'event_invite','group_invite','community_invite',
  'community_request_accepted','follow','follow_joined_event','event_cancelled','event_updated',
  'participant_confirmed','waitlist_spot','results_published',
  'event_created','partner_left',
  'partner_request',
  'organizer_confirmed','removed_from_event'));                                       -- NEW

-- D15: the activity vocabulary. NOT VALID: rows written before this migration are not re-checked.
alter table event_activity drop constraint if exists event_activity_action_check;
alter table event_activity add constraint event_activity_action_check check (action in (
  -- players
  'joined','left','confirmed','removed','guest_added','waitlist_joined','waitlist_claimed',
  -- invitations
  'invited','invite_accepted','invite_declined',
  'partner_invite_sent','partner_invite_accepted','partner_invite_declined',
  -- teams (organizer tools)
  'team_assigned','team_switched','team_removed',
  -- payments
  'marked_paid','marked_unpaid','marked_all_paid','fee_changed',
  -- configuration
  'event_edited','recurrence_on','recurrence_off',
  -- the event itself
  'event_started','score_entered','score_edited','match_not_played','event_finished',
  'results_published','ranking_changed','event_cancelled')) not valid;

-- ---------------------------------------------------------------------------------------------
-- D15: the one activity writer
-- ---------------------------------------------------------------------------------------------
create or replace function _log_activity(p_event_id uuid, p_actor uuid, p_action text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- A cascade (event or account deletion) must never fail on the log.
  if p_event_id is null or not exists (select 1 from events where id = p_event_id) then return; end if;
  insert into event_activity (event_id, actor_id, action, detail)
  values (p_event_id,
          case when p_actor is not null and exists (select 1 from profiles where id = p_actor) then p_actor end,
          p_action, coalesce(p_detail, '{}'::jsonb));
end; $$;
revoke execute on function _log_activity(uuid, uuid, text, jsonb) from public, anon, authenticated;

create or replace function _participant_label(p_pid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(p.full_name, ep.guest_name)
  from event_participants ep left join profiles p on p.id = ep.user_id where ep.id = p_pid;
$$;
revoke execute on function _participant_label(uuid) from public, anon, authenticated;

-- Participants: what a player does to their own place (or a partner's, in the team flow).
-- Skipped: guests (the organizer tools log them), service-role writes (no JWT), and a row the
-- organizer changes for someone else (the organizer tool logs confirmed / removed / team_*).
create or replace function _activity_on_participant() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_org uuid; v_row event_participants%rowtype;
        v_action text; v_name text;
begin
  if TG_OP = 'DELETE' then v_row := OLD; else v_row := NEW; end if;
  if v_row.user_id is null or v_actor is null then return null; end if;
  select organizer_id into v_org from events where id = v_row.event_id;
  if v_org is null then return null; end if;
  if v_actor = v_org and v_row.user_id <> v_org then return null; end if;

  if TG_OP = 'INSERT' then
    v_action := case NEW.status when 'confirmed' then 'joined' when 'waiting_list' then 'waitlist_joined' end;
  elsif TG_OP = 'UPDATE' then
    if NEW.status is not distinct from OLD.status then return null; end if;
    v_action := case
      when NEW.status = 'confirmed' and OLD.status = 'waiting_list' then 'waitlist_claimed'
      when NEW.status = 'confirmed' then 'joined'
      when NEW.status = 'waiting_list' then 'waitlist_joined' end;
  else
    -- Only the player's own leave: a partner dropped with them is told by partner_left.
    if v_actor <> OLD.user_id then return null; end if;
    v_action := 'left';
  end if;
  if v_action is null then return null; end if;

  select full_name into v_name from profiles where id = v_row.user_id;
  perform _log_activity(v_row.event_id, v_row.user_id, v_action,
    jsonb_strip_nulls(jsonb_build_object(
      'target_name', v_name,
      'status', case when TG_OP = 'DELETE' then OLD.status end,
      'by', case when v_actor <> v_row.user_id then v_actor end)));
  return null;
end; $$;
revoke execute on function _activity_on_participant() from public, anon, authenticated;
drop trigger if exists trg_activity_on_participant on event_participants;
create trigger trg_activity_on_participant
  after insert or update of status or delete on event_participants
  for each row execute function _activity_on_participant();

-- Invitations: sent (by whoever invited), accepted / declined (by the invitee).
create or replace function _activity_on_invitation() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_org uuid; v_name text;
begin
  if NEW.invitee_id is null then return null; end if;
  select organizer_id into v_org from events where id = NEW.event_id;
  if v_org is null then return null; end if;
  select full_name into v_name from profiles where id = NEW.invitee_id;
  if TG_OP = 'INSERT' then
    -- Only an invitation the caller sends (or the scheduler, with no JWT): a partner's place reset
    -- to "invited" after the leaver took the team out (_reset_invitation_after_leave) is not one.
    if NEW.status = 'pending' and (v_actor is null or v_actor = NEW.invited_by) then
      perform _log_activity(NEW.event_id, NEW.invited_by, 'invited', jsonb_build_object('target_name', v_name));
    end if;
    return null;
  end if;
  if OLD.status <> 'pending' or NEW.status = OLD.status then return null; end if;
  -- The organizer accepting on someone's behalf (organizer_confirm_invitee) logs 'confirmed'.
  if v_actor is null or (v_actor = v_org and NEW.invitee_id <> v_org) then return null; end if;
  if NEW.status = 'accepted' then
    perform _log_activity(NEW.event_id, NEW.invitee_id, 'invite_accepted', jsonb_build_object('target_name', v_name));
  elsif NEW.status = 'declined' then
    perform _log_activity(NEW.event_id, NEW.invitee_id, 'invite_declined', jsonb_build_object('target_name', v_name));
  end if;
  return null;
end; $$;
revoke execute on function _activity_on_invitation() from public, anon, authenticated;
drop trigger if exists trg_activity_on_invitation on event_invitations;
create trigger trg_activity_on_invitation
  after insert or update of status on event_invitations
  for each row execute function _activity_on_invitation();

-- Partner invitations (team events): sent / re-sent, accepted, declined by the player (a system
-- close — someone paired elsewhere, left, was removed — is not a decline).
create or replace function _activity_on_partner_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_req text; v_tgt text;
begin
  select full_name into v_req from profiles where id = NEW.requester_id;
  select full_name into v_tgt from profiles where id = NEW.target_id;
  if NEW.status = 'pending' and (TG_OP = 'INSERT' or OLD.status <> 'pending') then
    perform _log_activity(NEW.event_id, NEW.requester_id, 'partner_invite_sent', jsonb_build_object('target_name', v_tgt));
  elsif TG_OP = 'UPDATE' and OLD.status = 'pending' and NEW.status = 'accepted' then
    perform _log_activity(NEW.event_id, NEW.target_id, 'partner_invite_accepted', jsonb_build_object('target_name', v_req));
  elsif TG_OP = 'UPDATE' and OLD.status = 'pending' and NEW.status = 'declined' and not NEW.closed_by_system then
    perform _log_activity(NEW.event_id, NEW.target_id, 'partner_invite_declined', jsonb_build_object('target_name', v_req));
  end if;
  return null;
end; $$;
revoke execute on function _activity_on_partner_request() from public, anon, authenticated;
drop trigger if exists trg_activity_on_partner_request on partner_requests;
create trigger trg_activity_on_partner_request
  after insert or update of status on partner_requests
  for each row execute function _activity_on_partner_request();

-- Scores: entered, edited by the organizer, match not played.
create or replace function _activity_on_match() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_org uuid; v_round int; v_action text;
begin
  if NEW.status = OLD.status and NEW.side_a_score is not distinct from OLD.side_a_score
     and NEW.side_b_score is not distinct from OLD.side_b_score then return null; end if;
  if NEW.status = 'pending' then return null; end if;
  select organizer_id into v_org from events where id = NEW.event_id;
  select round_number into v_round from event_rounds where id = NEW.round_id;
  v_action := case
    when NEW.status = 'not_played' then case when OLD.status = 'not_played' then null else 'match_not_played' end
    when OLD.status = 'pending' then 'score_entered'
    when v_actor is not distinct from v_org then 'score_edited'
    else 'score_entered' end;
  if v_action is null then return null; end if;
  perform _log_activity(NEW.event_id, v_actor, v_action, jsonb_build_object(
    'round_number', v_round, 'court_number', NEW.court_number,
    'side_a', NEW.side_a_score, 'side_b', NEW.side_b_score));
  return null;
end; $$;
revoke execute on function _activity_on_match() from public, anon, authenticated;
drop trigger if exists trg_activity_on_match on event_matches;
create trigger trg_activity_on_match
  after update of status, side_a_score, side_b_score on event_matches
  for each row execute function _activity_on_match();

-- The event: started, finished (+ results published), cancelled, ranking inclusion changed.
create or replace function _activity_on_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid();
begin
  if NEW.status is distinct from OLD.status then
    if NEW.status = 'in_progress' then
      perform _log_activity(NEW.id, v_actor, 'event_started', '{}'::jsonb);
    elsif NEW.status = 'completed' then
      perform _log_activity(NEW.id, v_actor, 'event_finished',
        jsonb_build_object('finished_early', NEW.finished_early, 'counts_for_ranking', NEW.counts_for_ranking));
      if NEW.published_at is not null and OLD.published_at is null then
        perform _log_activity(NEW.id, v_actor, 'results_published', '{}'::jsonb);
      end if;
    elsif NEW.status = 'cancelled' then
      perform _log_activity(NEW.id, v_actor, 'event_cancelled', '{}'::jsonb);
    end if;
  elsif NEW.counts_for_ranking is distinct from OLD.counts_for_ranking then
    perform _log_activity(NEW.id, v_actor, 'ranking_changed', jsonb_build_object('enabled', NEW.counts_for_ranking));
  end if;
  return null;
end; $$;
revoke execute on function _activity_on_event() from public, anon, authenticated;
drop trigger if exists trg_activity_on_event on events;
create trigger trg_activity_on_event
  after update of status, counts_for_ranking on events
  for each row execute function _activity_on_event();

-- B11: the forgeable client writer goes.
drop function if exists log_event_activity(uuid, text, jsonb);

-- ---------------------------------------------------------------------------------------------
-- D12: event_invitations are written by RPCs only (as partner_requests since 0111)
-- ---------------------------------------------------------------------------------------------
drop policy if exists "event_invitations: organizer" on event_invitations;
drop policy if exists "event_invitations: respond" on event_invitations;
revoke insert, update, delete, truncate, references, trigger on event_invitations from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- D1: start rules
-- ---------------------------------------------------------------------------------------------
-- What blocks a start, in the order start_event reports them (the first one is raised).
create or replace function _start_blockers(p_event_id uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare v_ev events%rowtype; v_out text[] := '{}'; v_confirmed int; v_men int; v_women int; v_unknown int;
begin
  select * into v_ev from events where id = p_event_id;
  select count(*),
         count(*) filter (where coalesce(pr.gender, ep.guest_gender) = 'male'),
         count(*) filter (where coalesce(pr.gender, ep.guest_gender) = 'female'),
         count(*) filter (where coalesce(pr.gender, ep.guest_gender) is null)
    into v_confirmed, v_men, v_women, v_unknown
  from event_participants ep left join profiles pr on pr.id = ep.user_id
  where ep.event_id = p_event_id and ep.status = 'confirmed';

  if v_confirmed < 4 then v_out := v_out || 'not_enough_players'::text; end if;
  if v_ev.specification = 'mixed' then
    if v_unknown > 0 then v_out := v_out || 'mixed_gender_missing'::text;
    elsif v_men <> v_women then v_out := v_out || 'mixed_unbalanced'::text; end if;
  end if;
  -- A team event's odd count is always an incomplete team: the specific reason is reported first.
  if v_ev.specification = 'team' and exists (
       select 1 from event_participants ep
       where ep.event_id = p_event_id and ep.status = 'confirmed'
         and not exists (select 1 from event_teams t
                         where t.event_id = p_event_id and t.is_confirmed
                           and t.player_a_id is not null and t.player_b_id is not null
                           and ep.id in (t.player_a_id, t.player_b_id))) then
    v_out := v_out || 'teams_incomplete'::text;
  end if;
  if v_confirmed % 2 = 1 and not v_ev.allow_standby then v_out := v_out || 'odd_players'::text; end if;
  return v_out;
end; $$;
revoke execute on function _start_blockers(uuid) from public, anon, authenticated;

-- The start sheet: blockers (as above) and warnings that the organizer may start past.
create or replace function start_event_check(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_confirmed int; v_open int; v_idle int;
        v_warn jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'event_not_scheduled' using errcode='P0001'; end if;

  select count(*) into v_confirmed from event_participants where event_id = p_event_id and status = 'confirmed';
  v_open := event_capacity(p_event_id) - v_confirmed;
  if v_open > 0 then
    v_warn := v_warn || jsonb_build_array(jsonb_build_object('code', 'below_capacity', 'open_spots', v_open));
  end if;
  -- Courts in use = floor(playing / 4); a full or over-full house uses every court.
  v_idle := v_ev.num_courts - least(v_ev.num_courts, v_confirmed / 4);
  if v_idle > 0 and v_confirmed >= 4 then
    v_warn := v_warn || jsonb_build_array(jsonb_build_object('code', 'idle_courts', 'idle', v_idle));
  end if;
  return jsonb_build_object('blockers', to_jsonb(_start_blockers(p_event_id)), 'warnings', v_warn);
end; $$;
revoke execute on function start_event_check(uuid) from public, anon;
grant execute on function start_event_check(uuid) to authenticated;

-- A client-built schedule: every id a confirmed participant of this event, 2 + 2 distinct players
-- a match, courts within the event's.
create or replace function _validate_rounds(p_event_id uuid, p_rounds jsonb) returns void
language plpgsql stable security definer set search_path = public as $$
declare v_courts int; v_round jsonb; v_match jsonb; v_ids text[]; v_rests text[];
begin
  select num_courts into v_courts from events where id = p_event_id;
  for v_round in select * from jsonb_array_elements(p_rounds) loop
    if jsonb_typeof(v_round) <> 'object' or (v_round->>'round_number') is null
       or jsonb_typeof(coalesce(v_round->'matches', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(v_round->'rests', '[]'::jsonb)) <> 'array' then
      raise exception 'invalid_rounds' using errcode='P0001'; end if;
    v_rests := array(select jsonb_array_elements_text(coalesce(v_round->'rests', '[]'::jsonb)));
    v_ids := v_rests;
    for v_match in select * from jsonb_array_elements(coalesce(v_round->'matches', '[]'::jsonb)) loop
      if jsonb_typeof(v_match->'side_a') is distinct from 'array' or jsonb_typeof(v_match->'side_b') is distinct from 'array'
         or jsonb_array_length(v_match->'side_a') <> 2 or jsonb_array_length(v_match->'side_b') <> 2
         or coalesce((v_match->>'court_number')::int, 0) not between 1 and v_courts then
        raise exception 'invalid_rounds' using errcode='P0001'; end if;
      v_ids := v_ids || array(select jsonb_array_elements_text(v_match->'side_a'))
                     || array(select jsonb_array_elements_text(v_match->'side_b'));
    end loop;
    -- nobody twice in one round (on two courts, or playing and resting)
    if cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x) then
      raise exception 'invalid_rounds' using errcode='P0001'; end if;
    if exists (select 1 from unnest(v_ids) x
               where x !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  or not exists (select 1 from event_participants ep
                                 where ep.id = x::uuid and ep.event_id = p_event_id and ep.status = 'confirmed')) then
      raise exception 'invalid_participant' using errcode='P0001'; end if;
  end loop;
end; $$;
revoke execute on function _validate_rounds(uuid, jsonb) from public, anon, authenticated;

-- start_event (0121 body): D1 blocking rules, validated client schedule.
create or replace function start_event(p_event_id uuid, p_rounds jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_ev events%rowtype;
  v_play int;
  v_ordered uuid[];
  v_rest uuid[];
  v_round_id uuid;
  v_round jsonb;
  v_rest_pid text;
  v_rn int;
  v_blockers text[];                                                                  -- NEW
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'event_not_scheduled' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('event:'||p_event_id::text, 0));
  select * into v_ev from events where id = p_event_id;
  if v_ev.deleted_at is not null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'event_not_scheduled' using errcode='P0001'; end if;

  -- NEW (D1): was mixed_gender_missing / mixed_unbalanced, then setup_incomplete below capacity.
  v_blockers := _start_blockers(p_event_id);
  if cardinality(v_blockers) > 0 then
    raise exception '%', v_blockers[1] using errcode='P0001'; end if;

  update events set status = 'in_progress' where id = p_event_id;

  if p_rounds is not null and jsonb_typeof(p_rounds) = 'array' then
    perform _validate_rounds(p_event_id, p_rounds);                                   -- NEW
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

  -- Playing set = largest multiple of 4 that fits courts and confirmed count; idle courts stay empty.
  v_play := least(v_ev.num_courts * 4, (array_length(v_ordered,1) / 4) * 4);
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

-- generate_next_round (0048 body): a house below capacity seats least(courts*4, floor(n/4)*4) and
-- rests the rest (was: courts*4, and the n % 4 remainder was dropped without a round_rest row).
create or replace function generate_next_round(p_event_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_ev events%rowtype;
  v_prev_round_id uuid;
  v_prev_rn int;
  v_play int;
  v_ordered uuid[];
  v_rest uuid[];
  v_arrangement jsonb;
  v_new_round_id uuid;
  v_courts int;
  v_confirmed int;                                                                    -- NEW
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.event_type = 'americano' then raise exception 'not_applicable' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event:'||p_event_id::text, 0));

  select id, round_number into v_prev_round_id, v_prev_rn
    from event_rounds where event_id = p_event_id
    order by round_number desc limit 1;
  if v_prev_round_id is null then raise exception 'no_current_round' using errcode='P0001'; end if;
  if exists (select 1 from event_matches m where m.round_id = v_prev_round_id and m.status = 'pending') then
    raise exception 'round_not_scored' using errcode='P0001';
  end if;

  -- NEW (D1): never more seats than a multiple of 4 of the players there are.
  select count(*) into v_confirmed from event_participants where event_id = p_event_id and status = 'confirmed';
  v_play := least(v_ev.num_courts * 4, (v_confirmed / 4) * 4);

  if v_ev.event_type = 'mexicano' then
    with confirmed as (
      select p.id, p.joined_at,
             coalesce(s.rank, 2147483647) as rnk,
             (select count(*) from round_rest rr join event_rounds er on er.id = rr.round_id
               where er.event_id = p_event_id and rr.participant_id = p.id) as rests
      from event_participants p
      left join standings(p_event_id) s on s.entity_id = p.id
      where p.event_id = p_event_id and p.status = 'confirmed'
    ),
    surplus as (
      select id from confirmed
      order by rests asc, joined_at asc
      limit greatest((select count(*) from confirmed) - v_play, 0)
    )
    select
      (select array_agg(id order by rnk asc, joined_at asc)
         from confirmed where id not in (select id from surplus)),
      (select array_agg(id) from confirmed where id in (select id from surplus))
    into v_ordered, v_rest;

    v_arrangement := _build_fours_arrangement(v_ordered);

  elsif v_ev.event_type = 'up_and_down' then
    declare
      v_n int;
      r record;
      v_winners uuid[];
      v_losers uuid[];
      v_down jsonb := '{}'::jsonb;
      v_up jsonb := '{}'::jsonb;
      v_stay jsonb := '{}'::jsonb;
      v_cn int;
      v_dest int;
      v_a jsonb; v_b jsonb;
    begin
      select count(*) into v_n from event_matches where round_id = v_prev_round_id;
      v_courts := v_n;
      for r in
        select m.court_number,
               case when coalesce(m.side_a_score,0) >= coalesce(m.side_b_score,0) then 'a' else 'b' end as win_side
        from event_matches m where m.round_id = v_prev_round_id
        order by m.court_number
      loop
        select array_agg(mp.participant_id) into v_winners
          from match_players mp join event_matches m on m.id = mp.match_id
          where m.round_id = v_prev_round_id and m.court_number = r.court_number and mp.side = r.win_side;
        select array_agg(mp.participant_id) into v_losers
          from match_players mp join event_matches m on m.id = mp.match_id
          where m.round_id = v_prev_round_id and m.court_number = r.court_number and mp.side <> r.win_side;

        if r.court_number = 1 then
          v_stay := jsonb_set(v_stay, array['1'],
            coalesce(v_stay->'1','[]'::jsonb) || to_jsonb(v_winners));
        else
          v_dest := r.court_number - 1;
          v_up := jsonb_set(v_up, array[v_dest::text],
            coalesce(v_up->(v_dest::text),'[]'::jsonb) || to_jsonb(v_winners));
        end if;

        if r.court_number = v_courts then
          v_stay := jsonb_set(v_stay, array[v_courts::text],
            coalesce(v_stay->(v_courts::text),'[]'::jsonb) || to_jsonb(v_losers));
        else
          v_dest := r.court_number + 1;
          v_down := jsonb_set(v_down, array[v_dest::text],
            coalesce(v_down->(v_dest::text),'[]'::jsonb) || to_jsonb(v_losers));
        end if;
      end loop;

      v_arrangement := '[]'::jsonb;
      for v_cn in 1..v_courts loop
        v_a := (coalesce(v_down->(v_cn::text),'[]'::jsonb)) || (coalesce(v_stay->(v_cn::text),'[]'::jsonb));
        v_b := coalesce(v_up->(v_cn::text),'[]'::jsonb);
        while jsonb_array_length(v_a) < 2 and jsonb_array_length(v_b) > 2 loop
          v_a := v_a || jsonb_build_array(v_b->-1);
          v_b := v_b - (jsonb_array_length(v_b) - 1);
        end loop;
        while jsonb_array_length(v_b) < 2 and jsonb_array_length(v_a) > 2 loop
          v_b := v_b || jsonb_build_array(v_a->-1);
          v_a := v_a - (jsonb_array_length(v_a) - 1);
        end loop;
        v_arrangement := v_arrangement || jsonb_build_array(jsonb_build_object(
          'court_number', v_cn, 'match_number', 1,
          'side_a', jsonb_build_array(v_a->0, v_a->1),
          'side_b', jsonb_build_array(v_b->0, v_b->1)));
      end loop;
      v_rest := null;
    end;
  else
    raise exception 'not_applicable' using errcode='P0001';
  end if;

  update event_rounds set status = 'completed' where id = v_prev_round_id;

  insert into event_rounds (event_id, round_number, status, generated_at)
  values (p_event_id, v_prev_rn + 1, 'active', now())
  returning id into v_new_round_id;

  perform _persist_round_matches(p_event_id, v_new_round_id, v_arrangement);

  if v_rest is not null then
    insert into round_rest (round_id, participant_id)
    select v_new_round_id, unnest(v_rest);
  end if;

  return v_new_round_id;
end; $$;

-- ---------------------------------------------------------------------------------------------
-- D2 + B12: the organizer confirms a player
-- ---------------------------------------------------------------------------------------------
-- Confirm an existing, non-waiting row of a non-team event (the caller holds the roster lock).
create or replace function _organizer_confirm_row(p_event_id uuid, p_pid uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_ev events%rowtype; v_row event_participants%rowtype; v_gender text;
        v_cap int; v_reg int; v_confirmed int; v_actor_name text;
begin
  select * into v_ev from events where id = p_event_id;
  select * into v_row from event_participants where id = p_pid and event_id = p_event_id;
  if v_row.id is null then raise exception 'participant_not_found' using errcode='P0001'; end if;

  if v_ev.specification = 'mixed' then
    select coalesce(pr.gender, v_row.guest_gender) into v_gender from profiles pr where pr.id = v_row.user_id;
    v_gender := coalesce(v_gender, v_row.guest_gender);
    if v_gender is null then raise exception 'player_gender_required' using errcode='P0001'; end if;
    if _mixed_gender_full(p_event_id, v_gender) then raise exception 'gender_full' using errcode='P0001'; end if;
  end if;
  v_cap := event_capacity(p_event_id);
  v_reg := v_ev.num_courts * 4;
  select count(*) into v_confirmed from event_participants where event_id = p_event_id and status = 'confirmed';
  if v_confirmed >= v_cap then raise exception 'event_full' using errcode='P0001'; end if;

  update event_participants set status = 'confirmed', is_standby = (v_confirmed >= v_reg),
    confirmed_at = now(), waiting_list_position = null
    where id = p_pid;
  if v_row.user_id is not null then
    update event_invitations set status = 'accepted', responded_at = now()
      where event_id = p_event_id and invitee_id = v_row.user_id and status = 'pending';
  end if;

  perform _renumber_waiting_list(p_event_id);
  -- As claim_waitlist_spot: an offer that can no longer be claimed is settled (read).
  update notifications n set read_at = now()
    from event_participants ep
    where n.event_id = p_event_id and n.type = 'waitlist_spot' and n.read_at is null and not n.cta_done
      and ep.event_id = p_event_id and ep.user_id = n.user_id and ep.status = 'waiting_list'
      and not _waiter_can_claim(p_event_id, ep.id);

  if v_row.user_id is not null and v_row.user_id <> v_ev.organizer_id
     and not notif_blocked(v_row.user_id, p_actor) then
    select full_name into v_actor_name from profiles where id = p_actor;
    insert into notifications (user_id, type, actor_id, event_id, group_id, actor_name, entity_name)
    values (v_row.user_id, 'organizer_confirmed', p_actor, p_event_id, v_ev.group_id, v_actor_name, v_ev.name);
  end if;
  perform _log_activity(p_event_id, p_actor, 'confirmed', jsonb_build_object('target_name', _participant_label(p_pid)));
end; $$;
revoke execute on function _organizer_confirm_row(uuid, uuid, uuid) from public, anon, authenticated;

-- organizer_mark_confirmed (0121 body): D2 + B12.
create or replace function organizer_mark_confirmed(p_participant_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid; v_status text; v_spec text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select event_id into v_event from event_participants where id = p_participant_id;
  if v_event is null then raise exception 'participant_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform _organizer_roster_guard(v_event);
  select status into v_status from event_participants where id = p_participant_id;
  if v_status is null then raise exception 'participant_not_found' using errcode='P0001'; end if;
  -- NEW (D2 / B12)
  if v_status = 'confirmed' then return; end if;
  if v_status = 'waiting_list' then raise exception 'waitlist_not_confirmable' using errcode='P0001'; end if;
  select specification into v_spec from events where id = v_event;
  if v_spec = 'team' then raise exception 'team_required' using errcode='P0001'; end if;
  perform _organizer_confirm_row(v_event, p_participant_id, v_user);
end; $$;

-- NEW (B12): a pending invitee without a participant row. On a team event the team and slot are
-- required and the placement is organizer_assign_to_team's. Returns the participant id.
create or replace function organizer_confirm_invitee(
  p_event_id uuid, p_user_id uuid, p_team_number int default null, p_slot text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_pid uuid; v_status text; v_after text;
        v_actor_name text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  perform _organizer_roster_guard(p_event_id);
  select * into v_ev from events where id = p_event_id;

  select id, status into v_pid, v_status from event_participants
    where event_id = p_event_id and user_id = p_user_id;
  if v_pid is null then
    if not exists (select 1 from event_invitations
                   where event_id = p_event_id and invitee_id = p_user_id and status = 'pending') then
      raise exception 'invitation_not_found' using errcode='P0001'; end if;
  elsif v_status = 'confirmed' and v_ev.specification <> 'team' then
    return v_pid;
  elsif v_status = 'waiting_list' then
    raise exception 'waitlist_not_confirmable' using errcode='P0001';
  end if;

  if v_ev.specification = 'team' then
    if p_team_number is null or p_slot is null then raise exception 'team_required' using errcode='P0001'; end if;
    if v_pid is null then
      insert into event_participants (event_id, user_id, status, joined_at, invited_by)
        values (p_event_id, p_user_id, 'interested', now(), v_user)
        returning id into v_pid;
    end if;
    update event_invitations set status = 'accepted', responded_at = now()
      where event_id = p_event_id and invitee_id = p_user_id and status = 'pending';
    perform organizer_assign_to_team(p_event_id, v_pid, p_team_number, p_slot);
    select status into v_after from event_participants where id = v_pid;
    if v_after = 'confirmed' and v_status is distinct from 'confirmed' and p_user_id <> v_user
       and not notif_blocked(p_user_id, v_user) then
      select full_name into v_actor_name from profiles where id = v_user;
      insert into notifications (user_id, type, actor_id, event_id, group_id, actor_name, entity_name)
      values (p_user_id, 'organizer_confirmed', v_user, p_event_id, v_ev.group_id, v_actor_name, v_ev.name);
    end if;
    return v_pid;
  end if;

  if v_pid is null then
    insert into event_participants (event_id, user_id, status, joined_at, invited_by)
      values (p_event_id, p_user_id, 'invited', now(), v_user)
      returning id into v_pid;
  end if;
  perform _organizer_confirm_row(p_event_id, v_pid, v_user);
  return v_pid;
end; $$;
revoke execute on function organizer_confirm_invitee(uuid, uuid, int, text) from public, anon;
grant execute on function organizer_confirm_invitee(uuid, uuid, int, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- D3 + B12: organizer_remove_participant (0121 body)
-- ---------------------------------------------------------------------------------------------
create or replace function organizer_remove_participant(p_participant_id uuid, p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid; v_target_user uuid; v_org uuid; v_target_name text;
        v_was_confirmed boolean; v_ev events%rowtype; v_actor text;
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
  -- NEW (D3): a public group event has no invited state to fall back to.
  if p_mode = 'to_invited' and v_ev.group_id is not null and not v_ev.is_private then
    raise exception 'invalid_mode' using errcode='P0001'; end if;

  v_target_name := _participant_label(p_participant_id);

  delete from event_participants where id = p_participant_id;
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

  -- NEW (B12): the player is told.
  if v_target_user is not null and v_target_user <> v_org and not notif_blocked(v_target_user, v_user) then
    select full_name into v_actor from profiles where id = v_user;
    insert into notifications (user_id, type, actor_id, event_id, group_id, actor_name, entity_name)
    values (v_target_user, 'removed_from_event', v_user, v_event, v_ev.group_id, v_actor, v_ev.name);
  end if;
  perform _log_activity(v_event, v_user, 'removed', jsonb_build_object('target_name', v_target_name, 'mode', p_mode));
  perform _renumber_waiting_list(v_event);
  perform notify_waitlist_spot(v_event, v_user);
end; $$;

-- ---------------------------------------------------------------------------------------------
-- D7: a guest straight into a team slot
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
  if p_team_number is null or p_team_number < 1 or p_team_number > v_ev.num_courts * 2 then
    raise exception 'invalid_team' using errcode='P0001'; end if;

  select * into v_team from event_teams where event_id = p_event_id and team_number = p_team_number;
  if v_team.id is not null then
    if (p_slot = 'a' and v_team.player_a_id is not null) or (p_slot = 'b' and v_team.player_b_id is not null) then
      raise exception 'slot_taken' using errcode='P0001'; end if;
    v_other := case when p_slot = 'a' then v_team.player_b_id else v_team.player_a_id end;
    -- completing the pair confirms the other half too
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
  -- A pair is reconciled (both confirmed, team confirmed) only when complete: _reconcile_team
  -- would turn a lone guest back into 'invited'.
  if v_other is not null then perform _reconcile_team(v_team.id); end if;

  perform _log_activity(p_event_id, v_user, 'guest_added',
    jsonb_build_object('guest_name', v_name, 'team_number', p_team_number));
  return v_pid;
end; $$;
revoke execute on function organizer_add_guest_to_team(uuid, int, text, text, text) from public, anon;
grant execute on function organizer_add_guest_to_team(uuid, int, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- D9: payments (0121 bodies)
-- ---------------------------------------------------------------------------------------------
create or replace function mark_paid(p_participant_id uuid, p_paid boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid; v_fee numeric; v_amount numeric;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select event_id into v_event from event_participants where id = p_participant_id;
  if v_event is null then raise exception 'participant_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform _organizer_roster_guard(v_event, true);
  v_fee := _event_fee(v_event);                                                       -- NEW (D9)
  update event_participants set
    paid_amount = case when p_paid then greatest(paid_amount, v_fee) else 0 end,      -- NEW (D9)
    has_paid = p_paid, paid_at = case when p_paid then now() else null end
    where id = p_participant_id
    returning paid_amount into v_amount;
  perform _log_activity(v_event, v_user, case when p_paid then 'marked_paid' else 'marked_unpaid' end,
    jsonb_build_object('target_name', _participant_label(p_participant_id), 'amount', v_amount));
end; $$;

create or replace function mark_all_paid(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_fee numeric; v_n int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform _organizer_roster_guard(p_event_id, true);
  v_fee := _event_fee(p_event_id);                                                    -- NEW (D9)
  update event_participants set has_paid = true, paid_at = now(),
    paid_amount = greatest(paid_amount, v_fee)                                        -- NEW (D9)
    where event_id = p_event_id and has_paid = false and status = 'confirmed';
  get diagnostics v_n = row_count;
  perform _log_activity(p_event_id, v_user, 'marked_all_paid', jsonb_build_object('count', v_n));
end; $$;

-- ---------------------------------------------------------------------------------------------
-- Location payload (update_event, duplicate_event): venue, court names, registry courts
-- ---------------------------------------------------------------------------------------------
-- A NEWLY picked venue must be live; court names only without a venue, one per court, 1..40;
-- court ids must be courts of that venue. Returns the trimmed court names (null = none).
create or replace function _location_court_names(p_payload jsonb, p_num_courts int, p_current_venue uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare v_venue uuid := nullif(p_payload->>'venue_id','')::uuid; v_names text[];
begin
  if v_venue is not null and v_venue is distinct from p_current_venue
     and not exists (select 1 from venues where id = v_venue and deleted_at is null) then
    raise exception 'venue_not_found' using errcode='P0001'; end if;
  if jsonb_typeof(p_payload->'court_ids') = 'array' and jsonb_array_length(p_payload->'court_ids') > 0 then
    if v_venue is null or exists (
         select 1 from jsonb_array_elements_text(p_payload->'court_ids') c
         where c !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            or not exists (select 1 from courts ct where ct.id = c::uuid and ct.venue_id = v_venue)) then
      raise exception 'invalid_courts' using errcode='P0001'; end if;
  end if;
  if jsonb_typeof(p_payload->'manual_court_names') = 'array' then
    if v_venue is not null then raise exception 'invalid_court_names' using errcode='P0001'; end if;
    select coalesce(array_agg(btrim(t.n) order by t.ord), '{}') into v_names
      from jsonb_array_elements_text(p_payload->'manual_court_names') with ordinality as t(n, ord);
    if cardinality(v_names) is distinct from p_num_courts
       or exists (select 1 from unnest(v_names) n where n is null or char_length(n) not between 1 and 40) then
      raise exception 'invalid_court_names' using errcode='P0001'; end if;
    return v_names;
  elsif coalesce(jsonb_typeof(p_payload->'manual_court_names'), 'null') <> 'null' then
    raise exception 'invalid_court_names' using errcode='P0001';
  end if;
  return null;
end; $$;
revoke execute on function _location_court_names(jsonb, int, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- D4 + B8: duplicate_event (0121 body)
-- ---------------------------------------------------------------------------------------------
create or replace function duplicate_event(p_event_id uuid, p_overrides jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_src events%rowtype;
  v_new uuid;
  v_cid uuid;
  v_ov jsonb := coalesce(p_overrides, '{}'::jsonb);                                   -- NEW
  v_starts timestamptz;                                                               -- NEW
  v_loc boolean;                                                                      -- NEW
  v_venue uuid; v_mname text; v_maddr text; v_has_loc boolean; v_courts int;          -- NEW
  v_names text[]; v_point geography; v_text text; v_reserved boolean;                 -- NEW
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  select * into v_src from events where id = p_event_id and deleted_at is null;
  if v_src.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;

  if v_src.group_id is not null then
    select community_id into v_cid from groups where id = v_src.group_id and archived_at is null;
    if v_cid is null then raise exception 'group_not_found' using errcode='P0001'; end if;
    if not may_create_event(v_cid) then raise exception 'forbidden' using errcode='P0001'; end if;
  end if;

  -- NEW (B8): a date is required and in the future (was: defaulted to now(), past the cut-off).
  begin
    v_starts := nullif(v_ov->>'starts_at','')::timestamptz;
  exception when others then
    raise exception 'starts_at_required' using errcode='P0001';
  end;
  if v_starts is null then raise exception 'starts_at_required' using errcode='P0001'; end if;
  if v_starts <= now() then raise exception 'starts_at_in_past' using errcode='P0001'; end if;

  -- NEW (D4): location and courts, all together, when any location key is sent.
  v_loc := v_ov ?| array['venue_id','manual_location_name','manual_location_address','has_location',
                         'num_courts','manual_court_names','court_ids'];
  if v_loc then
    v_venue := nullif(v_ov->>'venue_id','')::uuid;
    v_courts := coalesce(nullif(v_ov->>'num_courts','')::int, v_src.num_courts);
    if v_courts < 1 then raise exception 'invalid_event_config' using errcode='P0001'; end if;
    v_names := _location_court_names(v_ov, v_courts, null);
    v_mname := case when v_venue is null then nullif(btrim(v_ov->>'manual_location_name'),'') end;
    v_maddr := case when v_venue is null then nullif(btrim(v_ov->>'manual_location_address'),'') end;
    v_has_loc := coalesce((v_ov->>'has_location')::boolean, v_venue is not null or v_mname is not null or v_maddr is not null);
    v_point := case when v_ov->>'location_lat' is not null and v_ov->>'location_lng' is not null
      then st_setsrid(st_makepoint((v_ov->>'location_lng')::float8, (v_ov->>'location_lat')::float8), 4326)::geography end;
    v_text := nullif(v_ov->>'location_text','');
    v_reserved := coalesce((v_ov->>'courts_reserved')::boolean,
      case when jsonb_typeof(v_ov->'court_ids') = 'array' and jsonb_array_length(v_ov->'court_ids') > 0 then true
           when v_venue is not null then false
           else true end);
  else
    if v_src.venue_id is not null
       and not exists (select 1 from venues where id = v_src.venue_id and deleted_at is null) then
      raise exception 'venue_not_found' using errcode='P0001';
    end if;
    v_venue := v_src.venue_id; v_mname := v_src.manual_location_name; v_maddr := v_src.manual_location_address;
    v_has_loc := v_src.has_location; v_courts := v_src.num_courts; v_names := v_src.manual_court_names;
    v_point := v_src.location_point; v_text := v_src.location_text; v_reserved := v_src.courts_reserved;
  end if;

  insert into events (group_id, series_id, organizer_id, event_type, specification, scoring_mode,
    scoring_value, venue_id, manual_location_name, manual_location_address, has_location, num_courts,
    starts_at, duration_minutes, allow_standby, standby_spots, is_private, entrance_fee_enabled,
    entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number, players_submit_results,
    organizer_role, name, description, thumbnail_path, counts_for_ranking, status,
    finished_early, finish_message, published_at,
    manual_court_names, location_point, location_text, courts_reserved)             -- NEW (location)
  values (v_src.group_id,
    null,
    v_user, v_src.event_type, v_src.specification, v_src.scoring_mode,
    v_src.scoring_value, v_venue, v_mname, v_maddr, v_has_loc, v_courts,
    v_starts,
    v_src.duration_minutes, v_src.allow_standby, v_src.standby_spots, v_src.is_private, v_src.entrance_fee_enabled,
    v_src.entrance_fee_amount, v_src.entrance_fee_method, v_src.entrance_fee_mba_number, v_src.players_submit_results,
    v_src.organizer_role, coalesce(nullif(btrim(v_ov->>'name'),''), v_src.name), v_src.description,
    case when v_ov ? 'thumbnail_path' then nullif(v_ov->>'thumbnail_path','') else v_src.thumbnail_path end,
    (v_src.group_id is not null and not v_src.is_private),                             -- NEW (create_event's default)
    'scheduled',
    false, null, null,
    v_names, v_point, v_text, v_reserved)
  returning id into v_new;

  if v_loc then
    if jsonb_typeof(v_ov->'court_ids') = 'array' then
      insert into event_courts (event_id, court_id)
      select v_new, c::uuid from jsonb_array_elements_text(v_ov->'court_ids') c on conflict do nothing;
    end if;
  else
    insert into event_courts (event_id, court_id)
    select v_new, court_id from event_courts where event_id = p_event_id
    on conflict do nothing;
  end if;

  if v_src.organizer_role = 'organizing_and_playing' then
    insert into event_participants (event_id, user_id, status, confirmed_at, joined_at)
    values (v_new, v_user, 'confirmed', now(), now())
    on conflict (event_id, user_id) do nothing;
  end if;

  -- NEW (D4): nothing carries over — no invitations (was: every invitation, declined included).
  if v_src.group_id is not null and not v_src.is_private then
    perform _notify_event_created(v_new);
  end if;

  return v_new;
end; $$;
revoke execute on function duplicate_event(uuid, jsonb) from public, anon, authenticated;
grant execute on function duplicate_event(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- D12: invitations
-- ---------------------------------------------------------------------------------------------
-- invite_to_event (0113 body)
create or replace function invite_to_event(p_event_id uuid, p_invitees jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_inv jsonb; v_ev events%rowtype; v_uid uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform _organizer_roster_guard(p_event_id);                                        -- NEW (scheduled + lock)
  select * into v_ev from events where id = p_event_id;
  -- NEW (D12): a public group event has no invitations (every member is told at creation).
  if v_ev.group_id is not null and not v_ev.is_private then
    raise exception 'invites_not_allowed' using errcode='P0001'; end if;
  if jsonb_typeof(p_invitees) = 'array' then
    for v_inv in select * from jsonb_array_elements(p_invitees) loop
      v_uid := nullif(v_inv->>'invitee_id','')::uuid;
      continue when v_uid is null or v_uid = v_ev.organizer_id;
      -- NEW (D12)
      if not exists (select 1 from profiles where id = v_uid and deleted_at is null) then
        raise exception 'user_not_found' using errcode='P0001'; end if;
      if notif_blocked(v_user, v_uid) then raise exception 'blocked' using errcode='P0001'; end if;
      if v_ev.group_id is not null
         and not exists (select 1 from group_members where group_id = v_ev.group_id and user_id = v_uid) then
        raise exception 'not_group_member' using errcode='P0001'; end if;
      continue when exists (select 1 from event_invitations where event_id = p_event_id and invitee_id = v_uid)
                 or exists (select 1 from event_participants where event_id = p_event_id and user_id = v_uid);
      -- the activity trigger logs 'invited'; the notification trigger sends event_invite
      insert into event_invitations (event_id, invitee_id, invited_by) values (p_event_id, v_uid, v_user);
    end loop;
  end if;
end; $$;

-- NEW (D12): who the Invite screen offers.
create or replace function event_invite_candidates(p_event_id uuid, p_query text default null, p_limit int default 50)
returns table (id uuid, full_name text, avatar_url text, section text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_term text; v_pat text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events e where e.id = p_event_id and e.deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.group_id is not null and not v_ev.is_private then return; end if;
  v_term := nullif(btrim(coalesce(p_query, '')), '');
  v_pat := '%' || replace(replace(replace(coalesce(v_term, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  with taken as (
    select ep.user_id as uid from event_participants ep where ep.event_id = p_event_id and ep.user_id is not null
    union
    select i.invitee_id from event_invitations i where i.event_id = p_event_id and i.invitee_id is not null
  ),
  pool as (
    select gm.user_id as uid, 'members'::text as sec, 0 as ord
      from group_members gm where v_ev.group_id is not null and gm.group_id = v_ev.group_id
    union all
    select f.followee_id,
           case when exists (select 1 from follows b where b.follower_id = f.followee_id and b.followee_id = v_user)
                then 'connections' else 'following' end,
           case when exists (select 1 from follows b where b.follower_id = f.followee_id and b.followee_id = v_user)
                then 0 else 1 end
      from follows f where v_ev.group_id is null and f.follower_id = v_user
    union all
    select p.id, 'others', 2
      from profiles p
      where v_ev.group_id is null and v_term is not null and p.full_name ilike v_pat
        and not exists (select 1 from follows f where f.follower_id = v_user and f.followee_id = p.id)
  )
  select p.id, p.full_name, p.avatar_url, pool.sec
  from pool join profiles p on p.id = pool.uid
  where p.deleted_at is null and p.id <> v_user and p.id <> v_ev.organizer_id
    and not exists (select 1 from taken where taken.uid = p.id)
    and not notif_blocked(v_user, p.id)
    and (v_term is null or p.full_name ilike v_pat)
  order by pool.ord, lower(p.full_name) nulls last, p.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end; $$;
revoke execute on function event_invite_candidates(uuid, text, int) from public, anon;
grant execute on function event_invite_candidates(uuid, text, int) to authenticated;

-- accept_event_invitation (0112 body) — the invite_accepted row is the trigger's now.
create or replace function accept_event_invitation(p_event_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype;
        v_confirmed int; v_cap int; v_status text; v_pos int;
        v_gender text; v_gender_full boolean := false;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from event_invitations where event_id=p_event_id and invitee_id=v_user and status='pending') then
    raise exception 'invitation_not_found' using errcode='P0001'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  perform _assert_can_confirm(p_event_id);

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  -- (was: insert into event_activity … 'invite_accepted' — now _activity_on_invitation)

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

  if v_ev.specification = 'mixed' then
    select gender into v_gender from profiles where id = v_user;
    if v_gender is null then raise exception 'gender_required' using errcode='P0001'; end if;
    v_gender_full := _mixed_gender_full(p_event_id, v_gender);
  end if;

  v_cap := event_capacity(p_event_id);
  select count(*) into v_confirmed from event_participants where event_id=p_event_id and status='confirmed';
  if v_confirmed >= v_cap
     or v_gender_full
     or _has_waiters(p_event_id, v_gender) then
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
  if v_status = 'waiting_list' then perform notify_waitlist_spot(p_event_id, null); end if;
  return v_status;
end; $$;

-- decline_event_invitation (0081 body) — the invite_declined row is the trigger's now.
create or replace function decline_event_invitation(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update event_invitations set status='declined', responded_at=now()
    where event_id=p_event_id and invitee_id=v_user and status='pending';
end; $$;

-- ---------------------------------------------------------------------------------------------
-- D13: create_event (0113 body) + courts_reserved
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
  v_court_names text[]; v_guest jsonb; v_gname text; v_ggender text;
  v_cap int; v_reg int; v_confirmed int;
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

  if nullif(p_payload->>'venue_id','') is not null
     and not exists (select 1 from venues where id = (p_payload->>'venue_id')::uuid and deleted_at is null) then
    raise exception 'venue_not_found' using errcode='P0001'; end if;

  if jsonb_typeof(p_payload->'manual_court_names') = 'array' then
    if nullif(p_payload->>'venue_id','') is not null then
      raise exception 'invalid_court_names' using errcode='P0001'; end if;
    select coalesce(array_agg(btrim(t.n) order by t.ord), '{}') into v_court_names
      from jsonb_array_elements_text(p_payload->'manual_court_names') with ordinality as t(n, ord);
    if cardinality(v_court_names) is distinct from (p_payload->>'num_courts')::int
       or exists (select 1 from unnest(v_court_names) n where n is null or char_length(n) not between 1 and 40) then
      raise exception 'invalid_court_names' using errcode='P0001'; end if;
  elsif coalesce(jsonb_typeof(p_payload->'manual_court_names'), 'null') <> 'null' then
    raise exception 'invalid_court_names' using errcode='P0001';
  end if;

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
    organizer_role, name, description, thumbnail_path, location_point, location_text, counts_for_ranking,
    manual_court_names, courts_reserved)                                               -- NEW (courts_reserved)
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
    (v_group is not null and v_private = false),
    v_court_names,
    coalesce((p_payload->>'courts_reserved')::boolean, true))                          -- NEW (D13)
  returning id into v_event;

  if jsonb_typeof(p_payload->'court_ids') = 'array' then
    insert into event_courts (event_id, court_id)
    select v_event, (c)::uuid from jsonb_array_elements_text(p_payload->'court_ids') c on conflict do nothing;
  end if;

  if v_org_role = 'organizing_and_playing' then
    insert into event_participants (event_id, user_id, status, confirmed_at, joined_at)
    values (v_event, v_user, 'confirmed', now(), now());
  end if;

  if jsonb_typeof(p_payload->'guests') = 'array' then
    v_cap := event_capacity(v_event);
    v_reg := (p_payload->>'num_courts')::int * 4;
    for v_guest in select * from jsonb_array_elements(p_payload->'guests') loop
      v_gname := btrim(case when jsonb_typeof(v_guest) = 'object' then v_guest->>'name' end);
      if v_gname is null or char_length(v_gname) not between 1 and 60 then
        raise exception 'invalid_guest_name' using errcode='P0001'; end if;
      v_ggender := null;
      if v_spec = 'mixed' then
        v_ggender := v_guest->>'gender';
        if v_ggender is null or v_ggender not in ('male','female') then
          raise exception 'guest_gender_required' using errcode='P0001'; end if;
      end if;
      select count(*) into v_confirmed from event_participants where event_id = v_event and status = 'confirmed';
      if v_confirmed >= v_cap then raise exception 'event_full' using errcode='P0001'; end if;
      if v_spec = 'mixed' and _mixed_gender_full(v_event, v_ggender) then
        raise exception 'gender_full' using errcode='P0001'; end if;
      insert into event_participants (event_id, guest_name, guest_gender, status, is_standby, confirmed_at, joined_at, invited_by)
      values (v_event, v_gname, v_ggender, 'confirmed', v_confirmed >= v_reg, now(), now(), v_user);
      perform _log_activity(v_event, v_user, 'guest_added', jsonb_build_object('guest_name', v_gname));
    end loop;
  end if;

  if v_group is not null and v_private = false then
    perform _notify_event_created(v_event);
  else
    if jsonb_typeof(p_payload->'invitees') = 'array' then
      for v_inv in select * from jsonb_array_elements(p_payload->'invitees') loop
        continue when nullif(v_inv->>'invitee_id','') is null;
        insert into event_invitations (event_id, invitee_id, invited_by)
        values (v_event, (v_inv->>'invitee_id')::uuid, v_user);
      end loop;
    end if;
  end if;
  return v_event;
end; $$;

-- ---------------------------------------------------------------------------------------------
-- D8, D9, D13, D14, B13: update_event (0113 body)
-- ---------------------------------------------------------------------------------------------
create or replace function update_event(p_event_id uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype;
        v_allow_standby boolean; v_standby int; v_private boolean; v_standby_have int;
        v_num_courts int; v_confirmed_main int;
        v_date_changed boolean; v_loc_changed boolean; v_changes text[] := '{}';
        v_old_fee numeric; v_new_fee numeric; v_old_cap int; v_new_cap int;           -- NEW
        v_names text[]; v_courts_changed boolean := false; v_reserved boolean;          -- NEW
        v_new_venue uuid; v_actor text;                                                -- NEW
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  -- NEW: the capacity checks below read the roster, so they run under its lock, on a fresh read.
  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'not_editable' using errcode='P0001'; end if;
  if coalesce(btrim(p_payload->>'name'),'') = '' then raise exception 'name_required' using errcode='P0001'; end if;
  -- NEW (D14): a group-less event is always private (was: silently forced).
  if v_ev.group_id is null and (p_payload->>'is_private')::boolean is false then
    raise exception 'standalone_must_be_private' using errcode='P0001'; end if;

  v_allow_standby := coalesce((p_payload->>'allow_standby')::boolean, false);
  v_standby := nullif(p_payload->>'standby_spots','')::int;
  v_private := case when v_ev.group_id is null then true
                    else coalesce((p_payload->>'is_private')::boolean, false) end;
  v_num_courts := coalesce((p_payload->>'num_courts')::int, v_ev.num_courts);
  v_new_venue := nullif(p_payload->>'venue_id','')::uuid;
  -- venue_not_found (a NEWLY picked venue), invalid_courts, invalid_court_names
  v_names := _location_court_names(p_payload, v_num_courts, v_ev.venue_id);

  select count(*) into v_standby_have from event_participants where event_id=p_event_id and is_standby;
  if v_standby_have > 0 and (not v_allow_standby or coalesce(v_standby,0) < v_standby_have) then
    raise exception 'standby_below_roster' using errcode='P0001';
  end if;

  select count(*) into v_confirmed_main
    from event_participants where event_id=p_event_id and status='confirmed' and not is_standby;
  if v_num_courts * 4 < v_confirmed_main then
    raise exception 'courts_below_roster' using errcode='P0001';
  end if;

  v_date_changed := (p_payload->>'starts_at')::timestamptz is distinct from v_ev.starts_at;
  v_loc_changed :=
       v_new_venue                                      is distinct from v_ev.venue_id
    or nullif(p_payload->>'manual_location_name','')    is distinct from v_ev.manual_location_name
    or nullif(p_payload->>'manual_location_address','') is distinct from v_ev.manual_location_address;
  v_old_fee := case when v_ev.entrance_fee_enabled then coalesce(v_ev.entrance_fee_amount, 0) else 0 end;
  v_new_fee := case when coalesce((p_payload->>'entrance_fee_enabled')::boolean, false)
                    then coalesce(nullif(p_payload->>'entrance_fee_amount','')::numeric, 0) else 0 end;
  v_old_cap := event_capacity(p_event_id);
  if jsonb_typeof(p_payload->'court_ids') = 'array' then
    v_courts_changed := array(select c::uuid from jsonb_array_elements_text(p_payload->'court_ids') c order by 1)
      is distinct from array(select court_id from event_courts where event_id = p_event_id order by 1);
  end if;
  v_reserved := coalesce((p_payload->>'courts_reserved')::boolean,
    case when jsonb_typeof(p_payload->'court_ids') = 'array' and jsonb_array_length(p_payload->'court_ids') > 0
         then true end,
    v_ev.courts_reserved);

  if v_date_changed or (p_payload->>'duration_minutes')::int is distinct from v_ev.duration_minutes then
    v_changes := v_changes || 'date'::text; end if;
  if v_loc_changed or v_num_courts is distinct from v_ev.num_courts or v_courts_changed
     or v_reserved is distinct from v_ev.courts_reserved then                          -- NEW (courts)
    v_changes := v_changes || 'location'::text; end if;
  if p_payload->>'scoring_mode' is distinct from v_ev.scoring_mode
     or nullif(p_payload->>'scoring_value','')::int is distinct from v_ev.scoring_value then
    v_changes := v_changes || 'scoring'::text; end if;
  -- NEW: the fee amount is fee_changed (below); organizer_role is no longer editable (D8).
  if coalesce((p_payload->>'allow_standby')::boolean,false) is distinct from v_ev.allow_standby
     or nullif(p_payload->>'standby_spots','')::int is distinct from v_ev.standby_spots
     or v_private is distinct from v_ev.is_private
     or coalesce((p_payload->>'entrance_fee_enabled')::boolean,false) is distinct from v_ev.entrance_fee_enabled
     or nullif(p_payload->>'entrance_fee_method','') is distinct from v_ev.entrance_fee_method
     or coalesce((p_payload->>'players_submit_results')::boolean,false) is distinct from v_ev.players_submit_results then
    v_changes := v_changes || 'preferences'::text; end if;
  if btrim(p_payload->>'name') is distinct from v_ev.name
     or p_payload->>'description' is distinct from v_ev.description
     or p_payload->>'thumbnail_path' is distinct from v_ev.thumbnail_path then
    v_changes := v_changes || 'details'::text; end if;

  update events set
    name                    = btrim(p_payload->>'name'),
    description             = p_payload->>'description',
    thumbnail_path          = p_payload->>'thumbnail_path',
    starts_at               = (p_payload->>'starts_at')::timestamptz,
    duration_minutes        = (p_payload->>'duration_minutes')::int,
    scoring_mode            = p_payload->>'scoring_mode',
    scoring_value           = nullif(p_payload->>'scoring_value','')::int,
    allow_standby           = v_allow_standby,
    standby_spots           = case when v_allow_standby then v_standby else null end,
    is_private              = v_private,
    counts_for_ranking      = case when v_private is distinct from v_ev.is_private
                                  then (v_ev.group_id is not null and not v_private)
                                  else v_ev.counts_for_ranking end,
    entrance_fee_enabled    = coalesce((p_payload->>'entrance_fee_enabled')::boolean, false),
    entrance_fee_amount     = nullif(p_payload->>'entrance_fee_amount','')::numeric,
    entrance_fee_method     = nullif(p_payload->>'entrance_fee_method',''),
    entrance_fee_mba_number = p_payload->>'entrance_fee_mba_number',
    players_submit_results  = coalesce((p_payload->>'players_submit_results')::boolean, false),
    -- (organizer_role: D8, set at creation only)
    venue_id                = v_new_venue,
    manual_location_name    = nullif(p_payload->>'manual_location_name',''),
    manual_location_address = nullif(p_payload->>'manual_location_address',''),
    has_location            = coalesce((p_payload->>'has_location')::boolean, false),
    num_courts              = v_num_courts,
    -- NEW: names sent replace the old; not sent, the old stay (the 0113 trigger drops misfits)
    manual_court_names      = case when p_payload ? 'manual_court_names' then v_names else manual_court_names end,
    courts_reserved         = v_reserved,                                             -- NEW (D13)
    location_point          = case
        when p_payload->>'location_lat' is not null and p_payload->>'location_lng' is not null
        then st_setsrid(st_makepoint((p_payload->>'location_lng')::float8,(p_payload->>'location_lat')::float8),4326)::geography
        else v_ev.location_point end,
    location_text           = coalesce(nullif(p_payload->>'location_text',''), v_ev.location_text)
  where id = p_event_id;

  -- NEW: registry courts. Sent → replaced; a venue change without them → the old venue's go.
  if jsonb_typeof(p_payload->'court_ids') = 'array' then
    delete from event_courts where event_id = p_event_id;
    insert into event_courts (event_id, court_id)
    select p_event_id, c::uuid from jsonb_array_elements_text(p_payload->'court_ids') c on conflict do nothing;
  elsif v_new_venue is distinct from v_ev.venue_id then
    delete from event_courts where event_id = p_event_id;
  end if;

  -- NEW (D9): a fee change re-prices the payment list. Credit stays; "paid" = covers the fee.
  if v_new_fee is distinct from v_old_fee then
    update event_participants set has_paid = (paid_amount >= v_new_fee and (paid_amount > 0 or has_paid)),
      paid_at = case when paid_amount >= v_new_fee and (paid_amount > 0 or has_paid) then paid_at end
      where event_id = p_event_id;
    perform _log_activity(p_event_id, v_user, 'fee_changed', jsonb_build_object('from', v_old_fee, 'to', v_new_fee));
  end if;

  -- NEW (D14): private → public on a group event. Pending invitations go; a member's
  -- event_invite notification becomes event_created (as 0112's cleanup); every other member
  -- not already in the event is told it exists.
  if v_ev.group_id is not null and v_ev.is_private and not v_private then
    with gone as (
      delete from event_invitations i where i.event_id = p_event_id and i.status = 'pending'
      returning i.invitee_id
    )
    update notifications n set
      type = case when exists (select 1 from group_members gm where gm.group_id = v_ev.group_id and gm.user_id = n.user_id)
                  then 'event_created' else n.type end,
      cta_done = case when exists (select 1 from group_members gm where gm.group_id = v_ev.group_id and gm.user_id = n.user_id)
                      then n.cta_done else true end
      from gone
      where n.event_id = p_event_id and n.user_id = gone.invitee_id and n.type = 'event_invite' and not n.cta_done;
    select full_name into v_actor from profiles where id = v_user;
    insert into notifications (user_id, type, actor_id, event_id, group_id, actor_name, entity_name)
    select gm.user_id, 'event_created', v_user, p_event_id, v_ev.group_id, v_actor, btrim(p_payload->>'name')
    from group_members gm
    join profiles p on p.id = gm.user_id and p.deleted_at is null
    where gm.group_id = v_ev.group_id and gm.user_id <> v_user
      and not exists (select 1 from event_participants ep where ep.event_id = p_event_id and ep.user_id = gm.user_id)
      and not exists (select 1 from notifications n where n.user_id = gm.user_id and n.event_id = p_event_id
                        and n.type = 'event_created')
      and not notif_blocked(gm.user_id, v_user);
  end if;

  if v_date_changed or v_loc_changed then
    insert into notifications (user_id, type, actor_id, event_id, actor_name, entity_name)
    select ep.user_id, 'event_updated', v_user, p_event_id,
           (select full_name from profiles where id = v_user), btrim(p_payload->>'name')
    from event_participants ep
    where ep.event_id = p_event_id and ep.status='confirmed'
      and ep.user_id is not null and ep.user_id <> v_user;
  end if;

  -- NEW (B13): more spots (courts or stand-by) are offered to the waiting list.
  v_new_cap := event_capacity(p_event_id);
  if v_new_cap > v_old_cap then perform notify_waitlist_spot(p_event_id, v_user); end if;

  if array_length(v_changes,1) is not null then
    perform _log_activity(p_event_id, v_user, 'event_edited', jsonb_build_object('changes', to_jsonb(v_changes)));
  end if;
end; $$;

-- ---------------------------------------------------------------------------------------------
-- Self-check (a partial paste into the hosted SQL editor must not pass silently)
-- ---------------------------------------------------------------------------------------------
do $$
declare p text;
begin
  if to_regprocedure('public.log_event_activity(uuid, text, jsonb)') is not null then
    raise exception '0122: log_event_activity still exists'; end if;
  foreach p in array array[
      'public._log_activity(uuid, uuid, text, jsonb)', 'public._event_fee(uuid)',
      'public._participant_label(uuid)', 'public._start_blockers(uuid)', 'public._validate_rounds(uuid, jsonb)',
      'public._organizer_confirm_row(uuid, uuid, uuid)', 'public._location_court_names(jsonb, integer, uuid)',
      'public._activity_on_participant()', 'public._activity_on_invitation()',
      'public._activity_on_partner_request()', 'public._activity_on_match()', 'public._activity_on_event()'] loop
    if has_function_privilege('anon', p, 'execute') or has_function_privilege('authenticated', p, 'execute') then
      raise exception '0122: % is executable by anon/authenticated', p;
    end if;
  end loop;
  foreach p in array array[
      'public.start_event_check(uuid)', 'public.organizer_confirm_invitee(uuid, uuid, integer, text)',
      'public.organizer_add_guest_to_team(uuid, integer, text, text, text)',
      'public.event_invite_candidates(uuid, text, integer)'] loop
    if not has_function_privilege('authenticated', p, 'execute') or has_function_privilege('anon', p, 'execute') then
      raise exception '0122: % must be executable by authenticated only', p;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.event_invitations', 'INSERT')
     or has_table_privilege('authenticated', 'public.event_invitations', 'UPDATE')
     or has_table_privilege('authenticated', 'public.event_invitations', 'DELETE') then
    raise exception '0122: authenticated can still write event_invitations'; end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'events' and column_name = 'courts_reserved')
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'event_participants' and column_name = 'paid_amount') then
    raise exception '0122: a new column is missing'; end if;
  if (select count(*) from pg_trigger where tgname in ('trg_activity_on_participant','trg_activity_on_invitation',
        'trg_activity_on_partner_request','trg_activity_on_match','trg_activity_on_event') and not tgisinternal) <> 5 then
    raise exception '0122: an activity trigger is missing'; end if;
end $$;

commit;
