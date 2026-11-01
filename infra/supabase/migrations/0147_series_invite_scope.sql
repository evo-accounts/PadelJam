-- 0147_series_invite_scope.sql
--
-- A recurring private series opens its next occurrence by copying the previous occurrence's
-- invitations (_materialize_next). Until now it skipped only declined rows, the organizer and
-- deleted profiles, so a player who left the group, or a blocked pair (either direction), was
-- invited again every week and the invitation showed up in their list.
--
-- _materialize_next is the 0123 body; the only change is in the private-series copy. For rows
-- with an invitee_id it now applies the same scope invite_to_event / create_event (0146) enforce:
--   NEW (0147): the invitee is not blocked with the organizer (either direction);
--   NEW (0147): the invitee is not blocked with the actor (the inviter);
--   NEW (0147): the invitee is still a member of the series' group.
-- These are filters, not raises: one ineligible invitee is skipped and the occurrence is still
-- opened for everyone else. Name/email/phone invitees (null invitee_id) are copied as before.
-- Internal: no grant (revoke below). Depends on nothing newer than 0146.

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
           or (exists (select 1 from profiles p where p.id = ei.invitee_id and p.deleted_at is null)
               and not notif_blocked(v_src.organizer_id, ei.invitee_id)                  -- NEW (0147)
               and not notif_blocked(p_actor, ei.invitee_id)                             -- NEW (0147)
               and exists (select 1 from group_members gm                                -- NEW (0147)
                            where gm.group_id = v_src.group_id and gm.user_id = ei.invitee_id)));  -- NEW (0147)
  end if;

  return v_new;
end; $$;
revoke execute on function _materialize_next(uuid, uuid, timestamptz) from public, anon, authenticated;
