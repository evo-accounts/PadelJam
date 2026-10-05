-- 0123_recurrence_occurrences.sql
-- UX Audit — Manage Event, plan PR "0123 — recurrence occurrences" (docs/audit/2026-09-29-ux-manage-event-plan.md):
-- decision D5, UX-MEVT-08 / 09 / 21 / 22. Stacked on 0122.
--
--   D5   Manage Event on a recurring event lists the next occurrences, computed from the series.
--        Scheduled = materialised (an events row exists: invitations are out); Upcoming = not yet.
--        A per-date exception stores an edited date/time or a cancellation of an Upcoming one;
--        "Send invitation now" materialises it early.
--
-- The weekly grid — CHANGED. 0117 put the next slot one week after the LATEST occurrence's
--   starts_at. That breaks as soon as one occurrence can move on its own (an override, or
--   update_event 'only_this' on the latest one): the whole series would follow it. Now:
--     * event_series.grid_anchor — the slot the grid hangs off: set by the series' first event
--       (trigger), moved only by a 'this_and_upcoming' date change (a re-plan). Backfill: the
--       series' latest starts_at, which is exactly 0117's next-slot anchor. Null (a series with no
--       event yet) falls back to the latest nominal slot.
--     * slot k (k >= 1) = _series_slot(grid_anchor, k) — the same Lisbon wall-clock time 7·k days
--       later (0117's DST rule, unchanged). The anchor is k = 0; nothing before it is a slot.
--     * events.slot_at — the nominal slot an occurrence fills when it does NOT start at it (an
--       override, or an 'only_this' date edit). Null = starts at its slot. The nominal slot of an
--       occurrence is therefore coalesce(slot_at, starts_at), and events_series_slot_uniq (0079)
--       is rebuilt on it: one occurrence per (series, slot), whatever time it actually starts.
--     * a slot is FILLED when any event of the series (cancelled or soft-deleted included) has it
--       as its nominal slot — a deleted or cancelled occurrence is never re-created (0117's rule).
--
-- event_series_exceptions(series_id, slot_date, starts_at_override, cancelled) — one row per
--   Upcoming slot the organizer touched. slot_date = the Lisbon date of the nominal slot. Read:
--   the series organizer only. Writes: the RPCs below only.
--
-- New RPCs (authenticated only; the caller must be the series / event organizer):
--   event_next_occurrences(event, limit = 4)  → the slots AFTER this occurrence, in slot order:
--       Scheduled = a live 'scheduled' events row (event_id set; its own date and location);
--       Upcoming  = an unfilled, uncancelled slot whose (overridden) start is still in the future,
--                   with the template's name/location/duration (template = the latest live
--                   occurrence, a non-cancelled one preferred — see _series_template).
--       Cancelled / deleted / finished occurrences and cancelled slots are skipped. An inactive
--       series lists its remaining Scheduled occurrences only. DECISION: "at/after" is read as
--       AFTER — the list sits on the current occurrence's own Manage screen.
--   update_occurrence_slot(series, slot_date, starts_at) — an Upcoming slot only (a Scheduled one
--       is its own event: update_event); the new start must be in the future. Setting it back to
--       the slot's own time drops the override.
--   cancel_occurrence_slot(series, slot_date) — Upcoming → a cancelled exception (nobody to tell);
--       Scheduled → cancel_event(event, 'only_this') (players told as today). The series goes on.
--   send_occurrence_now(series, slot_date) → the event id. Materialises the slot now through
--       _materialize_next (the override applies); an already Scheduled slot returns its event.
--   set_event_recurrence(event, on, invite_lead_days = null):
--       off → every later Scheduled occurrence is cancelled through cancel_event 'only_this' (its
--             confirmed players are told — the audit's confirmation sheet "before deleting the
--             future occurrences"), the later exceptions go, the series becomes inactive
--             (is_active = false, NOT deleted_at: its past occurrences keep their series). This
--             event stays. Logs recurrence_off. No-op when it is not recurring.
--       on  → a NEW series anchored on this event (group events only: series_requires_group; the
--             community's recurring_events cap is enforced by the 0045 insert trigger, as for
--             create_event). DECISION: a new series, not the old one reactivated — the old one's
--             later slots are filled by the occurrences "off" cancelled, so reactivating it would
--             silently skip those weeks. invite_lead_days: the argument, else the old series',
--             else 7. Logs recurrence_on. No-op when it is already recurring.
--   update_event(event, payload, p_scope = 'only_this') — the 0122 function with a scope. The
--       2-argument function is DROPPED and replaced (a second overload would make every existing
--       two-argument PostgREST call ambiguous); two-argument callers get 'only_this'.
--       'only_this' — as before, except that a series occurrence whose date moves keeps its slot
--             (slot_at), so the series does not follow it (was: editing the latest occurrence
--             re-anchored the series).
--       'this_and_upcoming' on a series occurrence (elsewhere it is 'only_this'):
--         * every later SCHEDULED occurrence gets the same payload through the same body
--           (_update_event_row: its validations, its event_updated notifications to confirmed
--           players on a date/location change, its fee recalculation, its activity entry) — so
--           the edited values reach the template and every future materialisation inherits them;
--         * date/time changed → a re-plan: this event's new start becomes the grid anchor
--           (event_series.grid_anchor, day_of_week, start_time); each later occurrence keeps its
--           week offset on the new grid (a Scheduled one moves there — DECISION: its own
--           'only_this' time is reset; a cancelled / deleted one keeps its date and only its
--           nominal slot moves, so its week stays taken); later override exceptions are dropped
--           and later cancelled slots move with the grid. A move onto another occurrence's slot
--           raises occurrence_conflict. Duration goes to event_series.duration_minutes.
--   cancel_event (0073 body): 'this_and_upcoming' picks the siblings by nominal slot (an
--       overridden one is still "upcoming") and deletes the series' exceptions. As before it sets
--       the series inactive AND deleted, which is what makes every Upcoming slot disappear: the
--       scheduler skips it and event_next_occurrences lists no Upcoming slot for it.
--
-- The scheduler (materialize_due_occurrences, 0117) now walks the grid from 14 days back to
-- ~5 months ahead and opens EVERY due slot of a series (not just the next one): a slot is due
-- when it is unfilled, not cancelled, its (overridden) start is in the future and within
-- invite_lead_days of now — the lead is counted from the OVERRIDDEN start. "Never back-fill past
-- weeks" and "never re-create a deleted occurrence" hold as before. A slot sent early leaves the
-- slots before it Upcoming (they are still opened on time). The try-lock / sub-block / WARNING
-- behaviour is unchanged.
--
-- _materialize_next (0121 body): p_target is a NOMINAL slot; the new event starts at the slot's
-- override when it has one (slot_at records the slot). With no target (the organizer's
-- materialize_occurrence tap) it takes the first slot after the source that is not cancelled.
-- A cancelled target raises occurrence_cancelled. The source is copied as before.
--
-- Every redefined function is its latest body (0121: _materialize_next; 0117:
-- materialize_due_occurrences; 0122: update_event → _update_event_row; 0073: cancel_event) plus
-- the lines marked NEW. materialize_occurrence (0117) is unchanged and inherits the grid.
-- New error codes: occurrence_not_found, occurrence_materialised, occurrence_cancelled,
-- occurrence_conflict. The activity actions recurrence_on / recurrence_off were reserved by 0122.

begin;

-- ---------------------------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------------------------
alter table events add column if not exists slot_at timestamptz;
comment on column events.slot_at is
  'Series occurrences only: the nominal weekly slot this occurrence fills when it does not start at it (override / only-this edit). Null = starts_at is the slot.';

alter table event_series add column if not exists grid_anchor timestamptz;
comment on column event_series.grid_anchor is
  'The weekly grid: slot k = _series_slot(grid_anchor, k). Set by the first event; moved by a this-and-upcoming date change.';

update event_series es set grid_anchor = (select max(e.starts_at) from events e where e.series_id = es.id)
 where es.grid_anchor is null;

-- One occurrence per (series, nominal slot). Was (series_id, starts_at) (0079).
drop index if exists events_series_slot_uniq;
create unique index events_series_slot_uniq
  on events (series_id, (coalesce(slot_at, starts_at)))
  where series_id is not null and deleted_at is null;

create table if not exists event_series_exceptions (
  series_id          uuid not null references event_series(id) on delete cascade,
  slot_date          date not null,
  starts_at_override timestamptz,
  cancelled          boolean not null default false,
  created_at         timestamptz not null default now(),
  primary key (series_id, slot_date),
  constraint event_series_exceptions_meaningful check (cancelled or starts_at_override is not null)
);
comment on table event_series_exceptions is
  'D5: an Upcoming (not yet materialised) weekly slot the organizer moved or cancelled. slot_date = Lisbon date of the nominal slot.';

alter table event_series_exceptions enable row level security;
drop policy if exists "event_series_exceptions: organizer read" on event_series_exceptions;
create policy "event_series_exceptions: organizer read" on event_series_exceptions for select
  using (exists (select 1 from event_series es where es.id = event_series_exceptions.series_id
                 and es.organizer_id = auth.uid()));
revoke all on event_series_exceptions from anon, authenticated;
grant select on event_series_exceptions to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Grid helpers (internal)
-- ---------------------------------------------------------------------------------------------
create or replace function _lisbon_date(p_at timestamptz) returns date
language sql stable set search_path = public as $$
  select (p_at at time zone 'Europe/Lisbon')::date
$$;
revoke execute on function _lisbon_date(timestamptz) from public, anon, authenticated;

-- The series' grid anchor (slot 0).
create or replace function _series_anchor(p_series_id uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select coalesce(es.grid_anchor,
                  (select max(coalesce(e.slot_at, e.starts_at)) from events e where e.series_id = es.id))
  from event_series es where es.id = p_series_id
$$;
revoke execute on function _series_anchor(uuid) from public, anon, authenticated;

-- The slot on Lisbon date p_date, or null when that date is not a slot day after the anchor.
create or replace function _series_slot_on(p_anchor timestamptz, p_date date) returns timestamptz
language sql stable set search_path = public as $$
  select case when p_anchor is not null and p_date > _lisbon_date(p_anchor)
                   and (p_date - _lisbon_date(p_anchor)) % 7 = 0
              then _series_slot(p_anchor, (p_date - _lisbon_date(p_anchor)) / 7) end
$$;
revoke execute on function _series_slot_on(timestamptz, date) from public, anon, authenticated;

-- The first slot (k >= 1) strictly after p_after.
create or replace function _series_next_slot(p_anchor timestamptz, p_after timestamptz) returns timestamptz
language plpgsql stable set search_path = public as $$
declare v_k int; v_slot timestamptz;
begin
  v_k := greatest(1, floor((_lisbon_date(p_after) - _lisbon_date(p_anchor)) / 7.0)::int);
  v_slot := _series_slot(p_anchor, v_k);
  while v_slot <= p_after loop
    v_k := v_k + 1;
    v_slot := _series_slot(p_anchor, v_k);
  end loop;
  return v_slot;
end; $$;
revoke execute on function _series_next_slot(timestamptz, timestamptz) from public, anon, authenticated;

-- The template future occurrences copy: the latest live occurrence, a non-cancelled one first.
create or replace function _series_template(p_series_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from events
   where series_id = p_series_id and deleted_at is null
   order by (status = 'cancelled'), coalesce(slot_at, starts_at) desc, created_at desc
   limit 1
$$;
revoke execute on function _series_template(uuid) from public, anon, authenticated;

-- The first event of a series anchors its grid (create_event inserts the series first).
create or replace function _events_series_anchor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update event_series set grid_anchor = coalesce(NEW.slot_at, NEW.starts_at)
   where id = NEW.series_id and grid_anchor is null;
  return null;
end; $$;
revoke execute on function _events_series_anchor() from public, anon, authenticated;
drop trigger if exists trg_events_series_anchor on events;
create trigger trg_events_series_anchor
  after insert on events
  for each row when (NEW.series_id is not null)
  execute function _events_series_anchor();

-- The series RPCs' gate: signed in, the series organizer, still in its group, series active.
create or replace function _series_organizer_guard(p_series_id uuid) returns event_series
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_s event_series%rowtype;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_s from event_series where id = p_series_id;
  if v_s.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_s.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if not exists (select 1 from group_members where group_id = v_s.group_id and user_id = v_user) then
    raise exception 'forbidden' using errcode='P0001'; end if;
  if not v_s.is_active or v_s.deleted_at is not null then
    raise exception 'series_inactive' using errcode='P0001'; end if;
  return v_s;
end; $$;
revoke execute on function _series_organizer_guard(uuid) from public, anon, authenticated;

-- The slot of the series on p_slot_date. A live occurrence on that date → p_event (Scheduled;
-- a cancelled one raises occurrence_cancelled). Otherwise it must be Upcoming: on the grid after
-- the anchor, not filled by a deleted occurrence, not cancelled, its start still in the future.
create or replace function _series_resolve_slot(p_series_id uuid, p_slot_date date, out p_slot timestamptz, out p_event uuid)
language plpgsql stable security definer set search_path = public as $$
declare v_x event_series_exceptions%rowtype; v_status text;
begin
  -- A live occurrence on that date (any grid, the anchor included) makes it Scheduled.
  select id, coalesce(slot_at, starts_at), status into p_event, p_slot, v_status from events
   where series_id = p_series_id and deleted_at is null and _lisbon_date(coalesce(slot_at, starts_at)) = p_slot_date
   order by created_at desc limit 1;
  if p_event is not null then
    if v_status = 'cancelled' then raise exception 'occurrence_cancelled' using errcode='P0001'; end if;
    return;
  end if;
  p_slot := _series_slot_on(_series_anchor(p_series_id), p_slot_date);
  if p_slot is null then raise exception 'occurrence_not_found' using errcode='P0001'; end if;
  if exists (select 1 from events where series_id = p_series_id and coalesce(slot_at, starts_at) = p_slot) then
    raise exception 'occurrence_not_found' using errcode='P0001'; end if;           -- a deleted occurrence
  select * into v_x from event_series_exceptions where series_id = p_series_id and slot_date = p_slot_date;
  if coalesce(v_x.cancelled, false) then raise exception 'occurrence_cancelled' using errcode='P0001'; end if;
  if coalesce(v_x.starts_at_override, p_slot) <= now() then
    raise exception 'occurrence_not_found' using errcode='P0001'; end if;           -- already past
end; $$;
revoke execute on function _series_resolve_slot(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- _materialize_next (0121 body): nominal target slot, overrides, cancelled slots
-- ---------------------------------------------------------------------------------------------
create or replace function _materialize_next(p_after_event_id uuid, p_actor uuid, p_target timestamptz default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_src  events%rowtype;
  v_target timestamptz;
  v_existing uuid;
  v_new uuid;
  v_x event_series_exceptions%rowtype;                                                -- NEW
  v_start timestamptz;                                                                -- NEW
  v_i int := 0;                                                                       -- NEW
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

  -- NEW: the target is a NOMINAL slot of the grid. The organizer tap (no target) takes the first
  -- slot after the source's own slot that the organizer has not cancelled.
  if p_target is null then
    v_target := _series_next_slot(_series_anchor(v_src.series_id), coalesce(v_src.slot_at, v_src.starts_at));
    while exists (select 1 from event_series_exceptions x
                   where x.series_id = v_src.series_id and x.slot_date = _lisbon_date(v_target) and x.cancelled) loop
      v_i := v_i + 1;
      if v_i > 104 then raise exception 'occurrence_not_found' using errcode='P0001'; end if;
      v_target := _series_slot(v_target, 1);
    end loop;
  else
    v_target := p_target;
  end if;

  select id into v_existing from events
   where series_id = v_src.series_id and coalesce(slot_at, starts_at) = v_target and deleted_at is null;  -- NEW (nominal)
  if v_existing is not null then return v_existing; end if;

  -- NEW: the slot's exception — cancelled refuses, an override is the start.
  select * into v_x from event_series_exceptions
   where series_id = v_src.series_id and slot_date = _lisbon_date(v_target);
  if coalesce(v_x.cancelled, false) then raise exception 'occurrence_cancelled' using errcode='P0001'; end if;
  v_start := coalesce(v_x.starts_at_override, v_target);

  begin
    insert into events (
      group_id, series_id, organizer_id, event_type, specification, scoring_mode, scoring_value,
      venue_id, manual_location_name, manual_location_address, has_location, num_courts,
      starts_at, duration_minutes, allow_standby, standby_spots, is_private,
      entrance_fee_enabled, entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number,
      players_submit_results, organizer_role, name, description, thumbnail_path,
      status, counts_for_ranking, location_point, location_text,
      manual_court_names,
      slot_at                                                                          -- NEW
    )
    select
      group_id, series_id, organizer_id, event_type, specification, scoring_mode, scoring_value,
      venue_id, manual_location_name, manual_location_address, has_location, num_courts,
      v_start, duration_minutes, allow_standby, standby_spots, is_private,             -- NEW (v_start)
      entrance_fee_enabled, entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number,
      players_submit_results, organizer_role, name, description, thumbnail_path,
      'scheduled', counts_for_ranking, location_point, location_text,
      manual_court_names,
      case when v_start <> v_target then v_target end                                  -- NEW
    from events where id = p_after_event_id
    returning id into v_new;
  exception when unique_violation then
    select id into v_existing from events
     where series_id = v_src.series_id and coalesce(slot_at, starts_at) = v_target and deleted_at is null;
    return v_existing;
  end;

  insert into event_courts (event_id, court_id)
  select v_new, court_id from event_courts where event_id = p_after_event_id
  on conflict do nothing;

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
      and ei.invitee_id is distinct from v_src.organizer_id
      and (ei.invitee_id is null
           or exists (select 1 from profiles p where p.id = ei.invitee_id and p.deleted_at is null));
  end if;

  return v_new;
end; $$;
revoke execute on function _materialize_next(uuid, uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- materialize_due_occurrences (0117 body): every due slot of the grid, exceptions honoured
-- ---------------------------------------------------------------------------------------------
create or replace function materialize_due_occurrences() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_s        record;
  v_anchor   timestamptz;                                                             -- NEW
  v_source   uuid;
  v_venue    uuid;
  v_k0       int;                                                                     -- NEW
  v_slot     timestamptz;                                                             -- NEW
  v_start    timestamptz;                                                             -- NEW
  v_x        event_series_exceptions%rowtype;                                         -- NEW
  v_locked   boolean;                                                                 -- NEW
  v_created  int := 0;
begin
  for v_s in
    select es.id, es.organizer_id, es.invite_lead_days
      from event_series es
      join groups g on g.id = es.group_id and g.archived_at is null
      join profiles p on p.id = es.organizer_id and p.deleted_at is null
      join group_members gm on gm.group_id = es.group_id and gm.user_id = es.organizer_id
     where es.is_active and es.deleted_at is null
     order by es.id
  loop
    begin
      -- NEW: the grid and the template (see the header); due-ness first, without a lock.
      v_anchor := _series_anchor(v_s.id);
      v_source := _series_template(v_s.id);
      continue when v_anchor is null or v_source is null;
      select venue_id into v_venue from events where id = v_source;
      v_locked := false;

      -- From 14 days back (an override may start later than its slot) to ~5 months ahead.
      v_k0 := greatest(1, floor((_lisbon_date(now()) - 14 - _lisbon_date(v_anchor)) / 7.0)::int);
      for v_i in 0..24 loop
        v_slot := _series_slot(v_anchor, v_k0 + v_i);
        -- Filled (a live, cancelled or deleted occurrence) → never again.
        continue when exists (select 1 from events
                               where series_id = v_s.id and coalesce(slot_at, starts_at) = v_slot);
        select * into v_x from event_series_exceptions
         where series_id = v_s.id and slot_date = _lisbon_date(v_slot);
        continue when coalesce(v_x.cancelled, false);
        v_start := coalesce(v_x.starts_at_override, v_slot);
        continue when v_start <= now();                                    -- never back-fill
        continue when now() < v_start - make_interval(days => v_s.invite_lead_days);

        if v_venue is not null and not exists (select 1 from venues where id = v_venue and deleted_at is null) then
          raise warning 'materialize_due_occurrences: series % skipped, its venue % is deleted', v_s.id, v_venue;
          exit;
        end if;

        -- Only a due series is locked, and never waited for: busy → the next run catches up.
        if not v_locked then
          exit when not pg_try_advisory_xact_lock(hashtextextended('series_materialize:' || v_s.id::text, 0));
          v_locked := true;
        end if;
        -- Re-check under the lock: an organizer tap may have opened this slot.
        continue when exists (select 1 from events
                               where series_id = v_s.id and coalesce(slot_at, starts_at) = v_slot);

        perform _materialize_next(v_source, v_s.organizer_id, v_slot);
        v_created := v_created + 1;
      end loop;
    exception when others then
      raise warning 'materialize_due_occurrences: series % failed: % (%)', v_s.id, sqlerrm, sqlstate;
    end;
  end loop;
  return v_created;
end; $$;
revoke execute on function materialize_due_occurrences() from public, anon, authenticated;
grant execute on function materialize_due_occurrences() to service_role;

-- ---------------------------------------------------------------------------------------------
-- update_event (0122 body) → _update_event_row, the one-event body both scopes run
-- ---------------------------------------------------------------------------------------------
create or replace function _update_event_row(p_event_id uuid, p_payload jsonb, p_keep_slot boolean) returns void
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
    -- NEW (0123): the occurrence keeps its weekly slot when only its own date moves (p_keep_slot);
    -- a "this and upcoming" change re-plans the grid, so the new start IS the slot (null).
    slot_at                 = case when series_id is null or not p_keep_slot then null
                                   when (p_payload->>'starts_at')::timestamptz = coalesce(slot_at, starts_at) then null
                                   else coalesce(slot_at, starts_at) end,
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
revoke execute on function _update_event_row(uuid, jsonb, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- update_event: the scope (UX-MEVT-08 / 22). See the header.
-- ---------------------------------------------------------------------------------------------
drop function if exists update_event(uuid, jsonb);

create or replace function update_event(p_event_id uuid, p_payload jsonb, p_scope text default 'only_this')
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_ev events%rowtype;
  v_n0 timestamptz;          -- this occurrence's nominal slot
  v_s1 timestamptz;          -- its new start
  v_later record;
  v_forward boolean;
  v_cancelled date[];
  v_delta int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if coalesce(p_scope, '') not in ('only_this', 'this_and_upcoming') then
    raise exception 'invalid_scope' using errcode='P0001'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;

  if p_scope = 'only_this' or v_ev.series_id is null then
    perform _update_event_row(p_event_id, p_payload, true);
    return;
  end if;

  -- this_and_upcoming: one series edit at a time, and never alongside a materialisation.
  perform pg_advisory_xact_lock(hashtextextended('series_materialize:' || v_ev.series_id::text, 0));
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'not_editable' using errcode='P0001'; end if;

  v_n0 := coalesce(v_ev.slot_at, v_ev.starts_at);
  v_s1 := (p_payload->>'starts_at')::timestamptz;

  begin
    if v_s1 is not null and v_s1 is distinct from v_ev.starts_at then
      -- Re-plan. Each later occurrence keeps its week offset on the new grid. Order avoids
      -- passing through a sibling's slot: later ones first (farthest first) when moving later,
      -- this one first (then nearest first) when moving earlier.
      v_forward := v_s1 > v_n0;
      if not v_forward then perform _update_event_row(p_event_id, p_payload, false); end if;
      for v_later in
        select e.id, e.status, e.deleted_at, coalesce(e.slot_at, e.starts_at) as nom
          from events e
         where e.series_id = v_ev.series_id and e.id <> p_event_id
           and coalesce(e.slot_at, e.starts_at) > v_n0
         order by case when v_forward then -extract(epoch from coalesce(e.slot_at, e.starts_at))
                       else extract(epoch from coalesce(e.slot_at, e.starts_at)) end
      loop
        if v_later.status = 'scheduled' and v_later.deleted_at is null then
          perform _update_event_row(v_later.id,
            jsonb_set(p_payload, '{starts_at}',
                      to_jsonb(_series_slot(v_s1, round((_lisbon_date(v_later.nom) - _lisbon_date(v_n0)) / 7.0)::int))),
            false);
        else
          -- A cancelled / deleted occurrence keeps its date; its week stays taken on the new grid.
          update events set slot_at = _series_slot(v_s1, round((_lisbon_date(v_later.nom) - _lisbon_date(v_n0)) / 7.0)::int)
           where id = v_later.id;
        end if;
      end loop;
      if v_forward then perform _update_event_row(p_event_id, p_payload, false); end if;

      -- Exceptions after the old slot: overrides go (the series was re-planned), cancelled weeks
      -- move with the grid.
      v_delta := _lisbon_date(v_s1) - _lisbon_date(v_n0);
      select coalesce(array_agg(slot_date), '{}') into v_cancelled from event_series_exceptions
       where series_id = v_ev.series_id and slot_date > _lisbon_date(v_n0) and cancelled;
      delete from event_series_exceptions
       where series_id = v_ev.series_id and slot_date > _lisbon_date(least(v_n0, v_s1));
      insert into event_series_exceptions (series_id, slot_date, cancelled)
      select v_ev.series_id, d + v_delta, true from unnest(v_cancelled) d
      on conflict (series_id, slot_date) do update set cancelled = true, starts_at_override = null;

      update event_series set
        grid_anchor      = v_s1,
        day_of_week      = extract(isodow from (v_s1 at time zone 'Europe/Lisbon'))::int,
        start_time       = (v_s1 at time zone 'Europe/Lisbon')::time,
        duration_minutes = coalesce(nullif(p_payload->>'duration_minutes','')::int, duration_minutes)
       where id = v_ev.series_id;
    else
      -- Same date: every later Scheduled occurrence takes the payload at its own start.
      for v_later in
        select e.id, e.starts_at from events e
         where e.series_id = v_ev.series_id and e.id <> p_event_id and e.deleted_at is null
           and e.status = 'scheduled' and coalesce(e.slot_at, e.starts_at) > v_n0
         order by coalesce(e.slot_at, e.starts_at)
      loop
        perform _update_event_row(v_later.id, jsonb_set(p_payload, '{starts_at}', to_jsonb(v_later.starts_at)), true);
      end loop;
      perform _update_event_row(p_event_id, p_payload, true);
      update event_series set
        duration_minutes = coalesce(nullif(p_payload->>'duration_minutes','')::int, duration_minutes)
       where id = v_ev.series_id;
    end if;
  exception when unique_violation then
    raise exception 'occurrence_conflict' using errcode='P0001';
  end;
end; $$;
revoke execute on function update_event(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function update_event(uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- D5: the next occurrences of a recurring event (UX-MEVT-22)
-- ---------------------------------------------------------------------------------------------
create or replace function event_next_occurrences(p_event_id uuid, p_limit int default 4)
returns table (
  slot_date date, starts_at timestamptz, duration_minutes int, status text, event_id uuid,
  name text, venue_id uuid, location_name text, location_address text, overridden boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_ev events%rowtype;
  v_s event_series%rowtype;
  v_tpl events%rowtype;
  v_anchor timestamptz;
  v_cur timestamptz;
  v_live boolean;
  v_k0 int;
  v_lim int := least(greatest(coalesce(p_limit, 4), 1), 12);
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.series_id is null then return; end if;

  select * into v_s from event_series where id = v_ev.series_id;
  select * into v_tpl from events where id = _series_template(v_ev.series_id);
  v_anchor := _series_anchor(v_ev.series_id);
  v_cur := coalesce(v_ev.slot_at, v_ev.starts_at);
  v_live := v_s.is_active and v_s.deleted_at is null and v_tpl.id is not null and v_anchor is not null;
  v_k0 := case when v_live then
            greatest(1, floor((_lisbon_date(greatest(v_cur, now() - interval '14 days')) - _lisbon_date(v_anchor)) / 7.0)::int)
          else 1 end;

  return query
  with scheduled as (
    select _lisbon_date(coalesce(e.slot_at, e.starts_at)) as d, coalesce(e.slot_at, e.starts_at) as nom,
           e.starts_at as sat, e.duration_minutes as dur, 'scheduled'::text as st, e.id as eid, e.name as nm,
           e.venue_id as vid, coalesce(v.name, e.manual_location_name) as lname,
           coalesce(v.address, e.manual_location_address) as laddr, (e.slot_at is not null) as ovr
      from events e left join venues v on v.id = e.venue_id
     where e.series_id = v_ev.series_id and e.deleted_at is null and e.status = 'scheduled'
       and coalesce(e.slot_at, e.starts_at) > v_cur
  ),
  grid as (
    select _series_slot(v_anchor, k) as nom
      from generate_series(v_k0, v_k0 + 60) k
     where v_live
  ),
  upcoming as (
    select _lisbon_date(g.nom) as d, g.nom, coalesce(x.starts_at_override, g.nom) as sat,
           v_tpl.duration_minutes as dur, 'upcoming'::text as st, null::uuid as eid, v_tpl.name as nm,
           v_tpl.venue_id as vid, coalesce(tv.name, v_tpl.manual_location_name) as lname,
           coalesce(tv.address, v_tpl.manual_location_address) as laddr,
           (x.starts_at_override is not null) as ovr
      from grid g
      left join event_series_exceptions x on x.series_id = v_ev.series_id and x.slot_date = _lisbon_date(g.nom)
      left join venues tv on tv.id = v_tpl.venue_id
     where g.nom > v_cur
       and not coalesce(x.cancelled, false)
       and coalesce(x.starts_at_override, g.nom) > now()
       and not exists (select 1 from events e
                        where e.series_id = v_ev.series_id and coalesce(e.slot_at, e.starts_at) = g.nom)
  )
  select u.d, u.sat, u.dur, u.st, u.eid, u.nm, u.vid, u.lname, u.laddr, u.ovr
    from (select * from scheduled union all select * from upcoming) u
   order by u.nom
   limit v_lim;
end; $$;
revoke execute on function event_next_occurrences(uuid, int) from public, anon, authenticated;
grant execute on function event_next_occurrences(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- D5: acting on an Upcoming slot (UX-MEVT-22's occurrence sheet)
-- ---------------------------------------------------------------------------------------------
create or replace function update_occurrence_slot(p_series_id uuid, p_slot_date date, p_starts_at timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare v_slot timestamptz; v_event uuid;
begin
  perform _series_organizer_guard(p_series_id);
  if p_starts_at is null then raise exception 'starts_at_required' using errcode='P0001'; end if;
  if p_starts_at <= now() then raise exception 'starts_at_in_past' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('series_materialize:' || p_series_id::text, 0));
  select r.p_slot, r.p_event into v_slot, v_event from _series_resolve_slot(p_series_id, p_slot_date) r;
  -- A Scheduled occurrence is its own event: update_event.
  if v_event is not null then raise exception 'occurrence_materialised' using errcode='P0001'; end if;

  if p_starts_at = v_slot then
    delete from event_series_exceptions where series_id = p_series_id and slot_date = p_slot_date;
  else
    insert into event_series_exceptions (series_id, slot_date, starts_at_override, cancelled)
    values (p_series_id, p_slot_date, p_starts_at, false)
    on conflict (series_id, slot_date) do update set starts_at_override = excluded.starts_at_override, cancelled = false;
  end if;
end; $$;
revoke execute on function update_occurrence_slot(uuid, date, timestamptz) from public, anon, authenticated;
grant execute on function update_occurrence_slot(uuid, date, timestamptz) to authenticated;

create or replace function cancel_occurrence_slot(p_series_id uuid, p_slot_date date)
returns void
language plpgsql security definer set search_path = public as $$
declare v_slot timestamptz; v_event uuid;
begin
  perform _series_organizer_guard(p_series_id);
  perform pg_advisory_xact_lock(hashtextextended('series_materialize:' || p_series_id::text, 0));
  select r.p_slot, r.p_event into v_slot, v_event from _series_resolve_slot(p_series_id, p_slot_date) r;
  if v_event is not null then
    -- Scheduled: cancel that event only (its confirmed players are told); the series goes on.
    perform cancel_event(v_event, 'only_this');
    return;
  end if;
  insert into event_series_exceptions (series_id, slot_date, starts_at_override, cancelled)
  values (p_series_id, p_slot_date, null, true)
  on conflict (series_id, slot_date) do update set starts_at_override = null, cancelled = true;
end; $$;
revoke execute on function cancel_occurrence_slot(uuid, date) from public, anon, authenticated;
grant execute on function cancel_occurrence_slot(uuid, date) to authenticated;

create or replace function send_occurrence_now(p_series_id uuid, p_slot_date date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_s event_series%rowtype; v_slot timestamptz; v_event uuid; v_tpl uuid;
begin
  v_s := _series_organizer_guard(p_series_id);
  perform pg_advisory_xact_lock(hashtextextended('series_materialize:' || p_series_id::text, 0));
  select r.p_slot, r.p_event into v_slot, v_event from _series_resolve_slot(p_series_id, p_slot_date) r;
  if v_event is not null then return v_event; end if;              -- already Scheduled
  v_tpl := _series_template(p_series_id);
  if v_tpl is null then raise exception 'occurrence_not_found' using errcode='P0001'; end if;
  return _materialize_next(v_tpl, v_s.organizer_id, v_slot);
end; $$;
revoke execute on function send_occurrence_now(uuid, date) from public, anon, authenticated;
grant execute on function send_occurrence_now(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- UX-MEVT-08: "Repeat every week" on an existing event
-- ---------------------------------------------------------------------------------------------
create or replace function set_event_recurrence(p_event_id uuid, p_on boolean, p_invite_lead_days int default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_ev events%rowtype;
  v_s event_series%rowtype;
  v_cid uuid;
  v_lead int;
  v_n0 timestamptz;
  v_later uuid;
  v_n int := 0;
  v_new uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_on is null then raise exception 'invalid_event_config' using errcode='P0001'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'not_editable' using errcode='P0001'; end if;
  if v_ev.series_id is not null then select * into v_s from event_series where id = v_ev.series_id; end if;

  if not p_on then
    if v_s.id is null or not v_s.is_active or v_s.deleted_at is not null then return; end if;
    perform pg_advisory_xact_lock(hashtextextended('series_materialize:' || v_s.id::text, 0));
    v_n0 := coalesce(v_ev.slot_at, v_ev.starts_at);
    -- The later Scheduled occurrences are cancelled; their confirmed players are told.
    for v_later in
      select id from events
       where series_id = v_s.id and deleted_at is null and status = 'scheduled'
         and coalesce(slot_at, starts_at) > v_n0
       order by coalesce(slot_at, starts_at)
    loop
      perform cancel_event(v_later, 'only_this');
      v_n := v_n + 1;
    end loop;
    delete from event_series_exceptions where series_id = v_s.id and slot_date > _lisbon_date(v_n0);
    update event_series set is_active = false where id = v_s.id;
    perform _log_activity(p_event_id, v_user, 'recurrence_off', jsonb_build_object('cancelled_occurrences', v_n));
    return;
  end if;

  if v_s.id is not null and v_s.is_active and v_s.deleted_at is null then return; end if;
  if v_ev.group_id is null then raise exception 'series_requires_group' using errcode='P0001'; end if;
  select community_id into v_cid from groups where id = v_ev.group_id and archived_at is null;
  if v_cid is null then raise exception 'group_not_found' using errcode='P0001'; end if;
  if not may_create_event(v_cid) then raise exception 'forbidden' using errcode='P0001'; end if;
  v_lead := coalesce(p_invite_lead_days, v_s.invite_lead_days, 7);
  if v_lead not in (3, 5, 7) then raise exception 'invalid_event_config' using errcode='P0001'; end if;

  -- A new series anchored on this event. trg_recurring_events_cap (0045) enforces the plan cap
  -- ('recurring_events limit reached (N)').
  insert into event_series (group_id, organizer_id, day_of_week, start_time, duration_minutes,
                            invite_lead_days, grid_anchor)
  values (v_ev.group_id, v_user,
          extract(isodow from (v_ev.starts_at at time zone 'Europe/Lisbon'))::int,
          (v_ev.starts_at at time zone 'Europe/Lisbon')::time,
          v_ev.duration_minutes, v_lead, v_ev.starts_at)
  returning id into v_new;
  update events set series_id = v_new, slot_at = null where id = p_event_id;
  perform _log_activity(p_event_id, v_user, 'recurrence_on', jsonb_build_object('invite_lead_days', v_lead));
end; $$;
revoke execute on function set_event_recurrence(uuid, boolean, int) from public, anon, authenticated;
grant execute on function set_event_recurrence(uuid, boolean, int) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- cancel_event (0073 body): siblings by nominal slot; the series' exceptions go with it
-- ---------------------------------------------------------------------------------------------
create or replace function cancel_event(p_event_id uuid, p_scope text default 'only_this') returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_actor text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'not_cancellable' using errcode='P0001'; end if;
  if p_scope not in ('only_this','this_and_upcoming') then raise exception 'invalid_scope' using errcode='P0001'; end if;

  select full_name into v_actor from profiles where id = v_user;

  update events set status='cancelled' where id = p_event_id;
  insert into notifications (user_id, type, actor_id, event_id, actor_name, entity_name)
  select ep.user_id, 'event_cancelled', v_user, p_event_id, v_actor, v_ev.name
  from event_participants ep
  where ep.event_id = p_event_id and ep.status='confirmed'
    and ep.user_id is not null and ep.user_id <> v_user;

  if p_scope = 'this_and_upcoming' and v_ev.series_id is not null then
    insert into notifications (user_id, type, actor_id, event_id, actor_name, entity_name)
    select ep.user_id, 'event_cancelled', v_user, e.id, v_actor, e.name
    from events e
    join event_participants ep on ep.event_id = e.id
    where e.series_id = v_ev.series_id and e.status='scheduled' and e.deleted_at is null     -- NEW (deleted)
      and coalesce(e.slot_at, e.starts_at) >= coalesce(v_ev.slot_at, v_ev.starts_at)      -- NEW (nominal)
      and e.id <> p_event_id
      and ep.status='confirmed' and ep.user_id is not null and ep.user_id <> v_user;
    update events set status='cancelled'
      where series_id = v_ev.series_id and status='scheduled' and deleted_at is null        -- NEW (deleted)
        and coalesce(slot_at, starts_at) >= coalesce(v_ev.slot_at, v_ev.starts_at)          -- NEW (nominal)
        and id <> p_event_id;
    update event_series set is_active=false, deleted_at=now() where id = v_ev.series_id;
    delete from event_series_exceptions where series_id = v_ev.series_id;                  -- NEW
  end if;
end; $$;
revoke execute on function cancel_event(uuid, text) from public, anon;
grant execute on function cancel_event(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Self-check (a partial paste into the hosted SQL editor must not pass silently)
-- ---------------------------------------------------------------------------------------------
do $$
declare p text;
begin
  if to_regprocedure('public.update_event(uuid, jsonb)') is not null then
    raise exception '0123: the two-argument update_event still exists (PostgREST overload ambiguity)'; end if;
  foreach p in array array[
      'public._lisbon_date(timestamp with time zone)', 'public._series_anchor(uuid)',
      'public._series_slot_on(timestamp with time zone, date)',
      'public._series_next_slot(timestamp with time zone, timestamp with time zone)',
      'public._series_template(uuid)', 'public._events_series_anchor()',
      'public._series_organizer_guard(uuid)', 'public._series_resolve_slot(uuid, date)',
      'public._update_event_row(uuid, jsonb, boolean)',
      'public._materialize_next(uuid, uuid, timestamp with time zone)',
      'public.materialize_due_occurrences()'] loop
    if has_function_privilege('anon', p, 'execute') or has_function_privilege('authenticated', p, 'execute') then
      raise exception '0123: % is executable by anon/authenticated', p;
    end if;
  end loop;
  foreach p in array array[
      'public.update_event(uuid, jsonb, text)', 'public.event_next_occurrences(uuid, integer)',
      'public.update_occurrence_slot(uuid, date, timestamp with time zone)',
      'public.cancel_occurrence_slot(uuid, date)', 'public.send_occurrence_now(uuid, date)',
      'public.set_event_recurrence(uuid, boolean, integer)', 'public.cancel_event(uuid, text)'] loop
    if not has_function_privilege('authenticated', p, 'execute') or has_function_privilege('anon', p, 'execute') then
      raise exception '0123: % must be executable by authenticated only', p;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.event_series_exceptions', 'INSERT')
     or has_table_privilege('authenticated', 'public.event_series_exceptions', 'UPDATE')
     or has_table_privilege('authenticated', 'public.event_series_exceptions', 'DELETE')
     or has_table_privilege('anon', 'public.event_series_exceptions', 'SELECT') then
    raise exception '0123: event_series_exceptions is writable by clients (or readable by anon)'; end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'events_series_slot_uniq'
                 and indexdef like '%COALESCE(slot_at, starts_at)%') then
    raise exception '0123: events_series_slot_uniq is not on the nominal slot'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_events_series_anchor' and not tgisinternal) then
    raise exception '0123: trg_events_series_anchor is missing'; end if;
  -- The grid helpers: 19:00 Lisbon slots across the October DST change.
  if _series_slot_on('2026-10-21 18:00+00', '2026-10-28') <> '2026-10-28 19:00+00'::timestamptz
     or _series_slot_on('2026-10-21 18:00+00', '2026-10-27') is not null
     or _series_slot_on('2026-10-21 18:00+00', '2026-10-21') is not null
     or _series_next_slot('2026-10-21 18:00+00', '2026-10-28 19:00+00') <> '2026-11-04 19:00+00'::timestamptz
     or _series_next_slot('2026-10-21 18:00+00', '2026-10-01 00:00+00') <> '2026-10-28 19:00+00'::timestamptz then
    raise exception '0123: the grid helpers are wrong'; end if;
end $$;

commit;
