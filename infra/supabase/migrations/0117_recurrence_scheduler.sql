-- 0117_recurrence_scheduler.sql
-- UX Audit — Events, plan PR 7 (docs/audit/2026-09-25-ux-events-plan.md): decision 10, B15.
--
--   D10/B15 Recurring events materialise on their own. event_series.invite_lead_days (3/5/7, UX-CEVT-08:
--       "invite sent 1 week / 5 days / 3 days before") was stored and never used: the next occurrence
--       only existed once the organizer tapped materialize_occurrence. An hourly pg_cron job now calls
--       materialize_due_occurrences(), which opens each active series' next occurrence once it is
--       within invite_lead_days of its start. Opening an occurrence is what "sends the invite":
--         public group event   → event_created to every group member but the organizer (0112 D5)
--         private event        → the previous occurrence's invitations copied as pending, and
--                                trg_notify_on_event_invite (0061) sends each invitee event_invite
--       exactly as the organizer path does, because both now run the same body.
--
-- Refactor. materialize_occurrence's body (0112) moves into the internal _materialize_next(source,
-- actor, target). materialize_occurrence keeps its checks (signed in, series organizer, series
-- active), adds one (NEW: the organizer must still be a member of the series' group, else
-- 'forbidden'), and calls the helper with actor = the caller. The scheduler calls it with actor = the
-- series organizer. The helper takes a per-series advisory lock, so a cron run and an organizer tap
-- on the same series serialise; events_series_slot_uniq (0079) stays the backstop and the 0086
-- unique_violation catch stays.
--
-- Which slot is next — materialize_due_occurrences, per series:
--   * skipped when the series is inactive or deleted (cancel_event's "whole series" sets both, 0073),
--     its group is archived (0108 also deactivates the series), its organizer's account is deleted,
--     or its organizer is no longer a member of the group (left or removed). A single cancelled
--     occurrence does NOT stop the series: it still counts as the last slot and its settings are
--     still copied (the new occurrence is 'scheduled').
--   * last slot   = the latest starts_at of ANY event in the series, soft-deleted included, so an
--                   occurrence the organizer deleted is never re-created.
--   * source      = the latest non-deleted event (its settings, courts and invitations are copied).
--                   If its registry venue has been soft-deleted the series is skipped with a WARNING
--                   (create_event refuses such a venue with venue_not_found, 0113); the organizer
--                   paths raise venue_not_found.
--   * next slot   = _series_slot(last slot, k) for the smallest k >= 1 that is in the future (see
--                   Time zone). A series that fell behind (hosted before pg_cron is enabled, or paused
--                   and resumed) picks up at its next future slot on the same weekly grid — it never
--                   back-fills past weeks and never sends one catch-up occurrence per hourly run.
--   * due when    now() >= next slot - invite_lead_days.
--   Due-ness is computed WITHOUT a lock; only a due series is then locked, with
--   pg_try_advisory_xact_lock — a series that is busy (an organizer tap in flight) is skipped and the
--   next run catches up — so an organizer tap never waits behind the sweep, except on a series the
--   sweep has just materialised (whose slot row it holds until it commits). Under the lock the slot
--   is re-checked, so a second run (or an organizer tap) creates nothing. Each series runs in its own
--   sub-block: one failing series logs a WARNING and the rest go on. Returns the number created.
--
-- Time zone — CHANGED (DST fix). Before: every occurrence was the previous one's starts_at +
--   interval '7 days' (0079), applied in the session time zone — UTC for PostgREST and pg_cron on
--   Supabase — so +168 h, and a 19:00 Lisbon series moved to 20:00 after the last Sunday of March and
--   to 18:00 after the last Sunday of October. Now both paths use _series_slot: the previous
--   occurrence's Lisbon WALL-CLOCK time + 7·k days, converted back to timestamptz — independent of the
--   session time zone. It anchors on the previous occurrence, not on event_series.start_time: the web
--   wizard stores a default '18:00' there whatever the chosen start, and the mobile one stores the
--   device-local hour, so start_time is not trustworthy. Europe/Lisbon is the app's time zone: the
--   codebase has no time-zone constant or column (communities, groups and venues carry none); it is
--   written in _series_slot only. A wall-clock time inside the spring-forward gap resolves the way
--   Postgres resolves a non-existent local time (one hour later). day_of_week is not read either.
--
-- Plan caps. recurring_events is enforced when a SERIES is inserted (0045 trigger) and on every plan
--   downgrade (0104). Materialising creates an event, never a series, so there is nothing to check.
--
-- Also here:
--   * manual_court_names (0113) is copied by _materialize_next and duplicate_event (0112 body).
--   * NEW: event_courts (the chosen courts of a registry venue) are copied too. Neither path copied
--     them, so an automatic weekly occurrence at a registry venue would have lost its courts.
--   * NEW: a private occurrence copies only invitations that were not declined, to accounts that are
--     not deleted (contact-only rows, B12 legacy, are still copied). Copies are pending as before.
--   * NEW: duplicate_event makes a one-off copy (series_id null). Copying series_id made a duplicate
--     the series' latest event, so it re-anchored the series on the duplicate's weekday and time.
--     It also raises venue_not_found for a soft-deleted registry venue, like create_event.
--   * materialize_occurrence: revoked from anon (it always refused anon with 'not authenticated').
--
-- pg_cron. `create extension pg_cron` is attempted in a guarded block: where pg_cron is unavailable
--   (not preloaded, or not permitted) the migration raises a NOTICE and skips scheduling instead of
--   failing. The local and CI stacks (supabase/postgres image) preload it. HOSTED: enable pg_cron
--   under Dashboard → Database → Extensions BEFORE pasting this file; if it was pasted first, re-run
--   the scheduling block at the bottom. The job is 'materialize-due-occurrences', '5 * * * *'.

begin;

-- ---------------------------------------------------------------------------------------------
-- _series_slot: the k-th weekly slot after p_last, at the same Lisbon wall-clock time.
-- ---------------------------------------------------------------------------------------------
create or replace function _series_slot(p_last timestamptz, p_weeks int)
returns timestamptz
language sql stable set search_path = public as $$
  select ((p_last at time zone 'Europe/Lisbon') + make_interval(days => 7 * p_weeks))
         at time zone 'Europe/Lisbon'
$$;
revoke execute on function _series_slot(timestamptz, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- _materialize_next: the body of materialize_occurrence (0112), minus the caller checks.
-- p_target null = one week after the source (the organizer path).
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
  -- NEW: a soft-deleted registry venue cannot host a new event (as create_event, 0113).
  if v_src.venue_id is not null
     and not exists (select 1 from venues where id = v_src.venue_id and deleted_at is null) then
    raise exception 'venue_not_found' using errcode='P0001';
  end if;

  -- NEW: one materialisation per series at a time (the scheduler and the organizer RPC).
  perform pg_advisory_xact_lock(hashtextextended('series_materialize:' || v_src.series_id::text, 0));

  -- NEW (DST fix): was v_src.starts_at + interval '7 days'.
  v_target := coalesce(p_target, _series_slot(v_src.starts_at, 1));

  -- Idempotent open: if the slot already exists, return it instead of inserting.
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
      manual_court_names                                                                -- NEW
    )
    select
      group_id, series_id, organizer_id, event_type, specification, scoring_mode, scoring_value,
      venue_id, manual_location_name, manual_location_address, has_location, num_courts,
      v_target, duration_minutes, allow_standby, standby_spots, is_private,
      entrance_fee_enabled, entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number,
      players_submit_results, organizer_role, name, description, thumbnail_path,
      'scheduled', counts_for_ranking, location_point, location_text,
      manual_court_names                                                                -- NEW
    from events where id = p_after_event_id
    returning id into v_new;
  exception when unique_violation then
    select id into v_existing from events
     where series_id = v_src.series_id and starts_at = v_target and deleted_at is null;
    return v_existing;
  end;

  -- NEW: the registry venue's chosen courts carry over.
  insert into event_courts (event_id, court_id)
  select v_new, court_id from event_courts where event_id = p_after_event_id
  on conflict do nothing;

  if v_src.group_id is not null and not v_src.is_private then
    -- 0112 D5: a public group occurrence invites nobody; the group is told instead.
    perform _notify_event_created(v_new);
  else
    -- Copy invitations only (as fresh pending); confirmed participants are NOT copied.
    -- trg_notify_on_event_invite sends each platform invitee an event_invite.
    insert into event_invitations (event_id, invitee_id, invitee_name, invitee_email, invitee_phone,
                                   status, invited_by, invited_at)
    select v_new, ei.invitee_id, ei.invitee_name, ei.invitee_email, ei.invitee_phone,
           'pending', p_actor, now()
    from event_invitations ei
    where ei.event_id = p_after_event_id
      and ei.status <> 'declined'                                                      -- NEW
      and (ei.invitee_id is null                                                       -- NEW
           or exists (select 1 from profiles p where p.id = ei.invitee_id and p.deleted_at is null));
  end if;

  return v_new;
end; $$;
revoke execute on function _materialize_next(uuid, uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- materialize_occurrence (0112 body): the organizer's tap. The work is the helper.
-- ---------------------------------------------------------------------------------------------
create or replace function materialize_occurrence(p_after_event_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_src  events%rowtype;
  v_s    event_series%rowtype;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_src from events where id = p_after_event_id and deleted_at is null;
  if v_src.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_src.series_id is null then raise exception 'event_not_found' using errcode='P0001'; end if;

  select * into v_s from event_series where id = v_src.series_id;
  if v_s.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_s.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  -- NEW: an organizer who left (or was removed from) the group no longer runs its series.
  if not exists (select 1 from group_members where group_id = v_s.group_id and user_id = v_user) then
    raise exception 'forbidden' using errcode='P0001';
  end if;
  if not v_s.is_active or v_s.deleted_at is not null then
    raise exception 'series_inactive' using errcode='P0001';
  end if;

  return _materialize_next(p_after_event_id, v_user);                                 -- NEW
end; $$;
revoke execute on function materialize_occurrence(uuid) from public, anon;
grant execute on function materialize_occurrence(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- materialize_due_occurrences: the scheduler (pg_cron, hourly). See the header for the rules.
-- ---------------------------------------------------------------------------------------------
create or replace function materialize_due_occurrences() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_s        record;
  v_last     timestamptz;
  v_source   uuid;
  v_venue    uuid;
  v_target   timestamptz;
  v_weeks    int;
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
      -- Due-ness first, without a lock.
      -- Last slot counts deleted occurrences too, so a deleted one is never re-created.
      select max(starts_at) into v_last from events where series_id = v_s.id;
      select id, venue_id into v_source, v_venue from events
       where series_id = v_s.id and deleted_at is null
       order by starts_at desc, created_at desc limit 1;
      continue when v_last is null or v_source is null;

      -- Next weekly slot (same Lisbon wall-clock time, see _series_slot) that is still in the future.
      v_weeks := 1;
      v_target := _series_slot(v_last, v_weeks);
      while v_target <= now() loop
        v_weeks := v_weeks + 1;
        v_target := _series_slot(v_last, v_weeks);
      end loop;
      continue when now() < v_target - make_interval(days => v_s.invite_lead_days);

      if v_venue is not null and not exists (select 1 from venues where id = v_venue and deleted_at is null) then
        raise warning 'materialize_due_occurrences: series % skipped, its venue % is deleted', v_s.id, v_venue;
        continue;
      end if;

      -- Only a due series is locked, and never waited for: busy → the next run catches up.
      continue when not pg_try_advisory_xact_lock(hashtextextended('series_materialize:' || v_s.id::text, 0));
      -- Re-check under the lock: an organizer tap may have opened this slot (or a later one).
      continue when exists (select 1 from events where series_id = v_s.id and starts_at >= v_target);

      perform _materialize_next(v_source, v_s.organizer_id, v_target);
      v_created := v_created + 1;
    exception when others then
      raise warning 'materialize_due_occurrences: series % failed: % (%)', v_s.id, sqlerrm, sqlstate;
    end;
  end loop;
  return v_created;
end; $$;
revoke execute on function materialize_due_occurrences() from public, anon, authenticated;
-- The db tests call it with the service key (the cron job runs as the owner).
grant execute on function materialize_due_occurrences() to service_role;

-- ---------------------------------------------------------------------------------------------
-- duplicate_event (0112 body) + manual_court_names + event_courts + one-off copy + deleted venue
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
  -- NEW: a soft-deleted registry venue cannot host a new event (as create_event, 0113).
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
    manual_court_names)                                                                -- NEW
  values (v_src.group_id,
    null,                                          -- NEW: a one-off copy (was v_src.series_id)
    v_user, v_src.event_type, v_src.specification, v_src.scoring_mode,
    v_src.scoring_value, v_src.venue_id, v_src.manual_location_name, v_src.manual_location_address,
    v_src.has_location, v_src.num_courts,
    coalesce(nullif(p_overrides->>'starts_at','')::timestamptz, now()),
    v_src.duration_minutes, v_src.allow_standby, v_src.standby_spots, v_src.is_private, v_src.entrance_fee_enabled,
    v_src.entrance_fee_amount, v_src.entrance_fee_method, v_src.entrance_fee_mba_number, v_src.players_submit_results,
    v_src.organizer_role, coalesce(p_overrides->>'name', v_src.name), v_src.description,
    coalesce(p_overrides->>'thumbnail_path', v_src.thumbnail_path), v_src.counts_for_ranking, 'scheduled',
    false, null, null,
    v_src.manual_court_names)                                                          -- NEW
  returning id into v_new;

  -- NEW: the registry venue's chosen courts carry over.
  insert into event_courts (event_id, court_id)
  select v_new, court_id from event_courts where event_id = p_event_id
  on conflict do nothing;

  if v_src.group_id is not null and not v_src.is_private then
    -- 0112 D5: a public group copy invites nobody; the group is told instead.
    perform _notify_event_created(v_new);
  else
    -- JM-39: copy invitations only (reset to pending); do NOT copy participants/waiting-list.
    insert into event_invitations (event_id, invitee_id, invitee_name, invitee_email, invitee_phone, status, invited_by)
    select v_new, invitee_id, invitee_name, invitee_email, invitee_phone, 'pending', v_user
    from event_invitations where event_id = p_event_id;
  end if;

  return v_new;
end; $$;
revoke execute on function duplicate_event(uuid, jsonb) from public, anon, authenticated;
grant execute on function duplicate_event(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Self-check
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if has_function_privilege('anon', 'public._series_slot(timestamptz, int)', 'execute')
     or has_function_privilege('authenticated', 'public._series_slot(timestamptz, int)', 'execute') then
    raise exception '0117: _series_slot is executable by anon/authenticated';
  end if;
  -- 19:00 Lisbon stays 19:00 across both DST changes (WEST = UTC+1, WET = UTC+0), whatever the
  -- session time zone.
  if _series_slot('2026-10-21 18:00+00', 1) <> '2026-10-28 19:00+00'::timestamptz
     or _series_slot('2027-03-24 19:00+00', 1) <> '2027-03-31 18:00+00'::timestamptz
     or _series_slot('2026-10-21 18:00+00', 3) <> '2026-11-11 19:00+00'::timestamptz then
    raise exception '0117: _series_slot does not keep the Lisbon wall-clock time across DST';
  end if;
  if has_function_privilege('anon', 'public._materialize_next(uuid, uuid, timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public._materialize_next(uuid, uuid, timestamptz)', 'execute') then
    raise exception '0117: _materialize_next is executable by anon/authenticated';
  end if;
  if has_function_privilege('anon', 'public.materialize_due_occurrences()', 'execute')
     or has_function_privilege('authenticated', 'public.materialize_due_occurrences()', 'execute') then
    raise exception '0117: materialize_due_occurrences is executable by anon/authenticated';
  end if;
  if has_function_privilege('anon', 'public.materialize_occurrence(uuid)', 'execute')
     or has_function_privilege('anon', 'public.duplicate_event(uuid, jsonb)', 'execute') then
    raise exception '0117: materialize_occurrence / duplicate_event executable by anon';
  end if;
  if not has_function_privilege('authenticated', 'public.materialize_occurrence(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.duplicate_event(uuid, jsonb)', 'execute') then
    raise exception '0117: materialize_occurrence / duplicate_event not executable by authenticated';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'events_series_slot_uniq') then
    raise exception '0117: events_series_slot_uniq (0079) is missing';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- pg_cron: hourly at :05. Guarded — no pg_cron, no schedule, no failure. Idempotent.
-- (Hosted, if pasted before enabling pg_cron: enable it, then re-run this block.)
-- ---------------------------------------------------------------------------------------------
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice '0117: pg_cron is not available here (%); materialize-due-occurrences NOT scheduled', sqlerrm;
    return;
  end;
  perform cron.unschedule(jobid) from cron.job where jobname = 'materialize-due-occurrences';
  perform cron.schedule('materialize-due-occurrences', '5 * * * *',
                        'select public.materialize_due_occurrences()');
end $$;

commit;
