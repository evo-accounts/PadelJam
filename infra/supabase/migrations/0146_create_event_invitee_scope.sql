-- 0146: create_event scopes its invitees like invite_to_event.
-- Why: invite_to_event (0122, D12) refuses a deleted/missing profile, a blocked player (either direction)
-- and, for a group event, a non-member. create_event inserted every invitee it was given, so a private
-- group event could be created with outsiders, blocked players or deleted profiles invited.
-- Body: create_event as of 0122 (D13). Only the lines marked NEW (0146) differ:
--   NEW (0146) 1. before the first write, each invitee of an event that takes invitations is refused, in
--                 invite_to_event's order: user_not_found, blocked, not_group_member (group events only);
--   NEW (0146) 2. the organizer and duplicate ids are skipped on insert.
-- A public group event still ignores `invitees`. Grants are unchanged.

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
  v_iid uuid;                                                                          -- NEW (0146)
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

  -- NEW (0146): an event that takes invitations refuses the same invitees invite_to_event refuses,
  -- before anything is written.
  if not (v_group is not null and v_private = false) and jsonb_typeof(p_payload->'invitees') = 'array' then
    for v_inv in select * from jsonb_array_elements(p_payload->'invitees') loop
      v_iid := nullif(v_inv->>'invitee_id','')::uuid;
      continue when v_iid is null or v_iid = v_user;
      if not exists (select 1 from profiles where id = v_iid and deleted_at is null) then
        raise exception 'user_not_found' using errcode='P0001'; end if;
      if notif_blocked(v_user, v_iid) then raise exception 'blocked' using errcode='P0001'; end if;
      if v_group is not null
         and not exists (select 1 from group_members where group_id = v_group and user_id = v_iid) then
        raise exception 'not_group_member' using errcode='P0001'; end if;
    end loop;
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
        v_iid := nullif(v_inv->>'invitee_id','')::uuid;
        continue when v_iid is null or v_iid = v_user;                                 -- NEW (0146)
        continue when exists (select 1 from event_invitations where event_id = v_event and invitee_id = v_iid);  -- NEW (0146)
        insert into event_invitations (event_id, invitee_id, invited_by)
        values (v_event, v_iid, v_user);
      end loop;
    end if;
  end if;
  return v_event;
end; $$;

revoke execute on function create_event(jsonb) from public, anon, authenticated;
grant execute on function create_event(jsonb) to authenticated;
