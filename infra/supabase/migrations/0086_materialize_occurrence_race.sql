-- A1 follow-up: absorb the duplicate-slot race in materialize_occurrence.
-- materialize_occurrence pre-checks for an existing (series_id, starts_at) slot before
-- inserting, then relies on the events_series_slot_uniq partial unique index (see 0079)
-- as a backstop. Under concurrency, two taps can both pass the pre-check and both attempt
-- the insert; the loser hits the unique index and used to bubble a raw unique_violation
-- up to the client as an opaque unknown_error. Wrap the insert in its own sub-block and
-- catch unique_violation: on the race-loser path, look up the winner's row (same query the
-- pre-check already uses) and return it — the same idempotent-open result the pre-check
-- path returns when it wins the race. The invitation copy is intentionally skipped on the
-- race-loser path, matching the pre-check path's behavior (no invitation copy there either).

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
    -- Concurrent tap won the race; return its row (idempotent open).
    select id into v_existing from events
     where series_id = v_src.series_id and starts_at = v_target and deleted_at is null;
    return v_existing;
  end;

  -- Copy invitations only (as fresh pending); confirmed participants are NOT copied.
  insert into event_invitations (event_id, invitee_id, invitee_name, invitee_email, invitee_phone,
                                 status, invited_by, invited_at)
  select v_new, invitee_id, invitee_name, invitee_email, invitee_phone,
         'pending', v_user, now()
  from event_invitations where event_id = p_after_event_id;

  return v_new;
end; $$;

grant execute on function materialize_occurrence(uuid) to authenticated;
