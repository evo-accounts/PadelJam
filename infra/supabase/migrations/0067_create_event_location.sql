-- 0067_create_event_location.sql
-- Venue name search + write events.location_point from create-event coords. (Phase 5D)
create or replace function search_venues(p_query text)
returns table (id uuid, name text, address text)
language sql stable security definer set search_path = public as $$
  select v.id, v.name, v.address
  from venues v
  where p_query <> '' and (v.name ilike '%'||p_query||'%' or coalesce(v.address,'') ilike '%'||p_query||'%')
  order by v.name
  limit 20;
$$;
grant execute on function search_venues(text) to authenticated;

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
    if not is_community_admin(v_cid) then raise exception 'forbidden' using errcode='P0001'; end if;
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
    insert into event_invitations (event_id, invitee_id, invited_by)
    select v_event, gm.user_id, v_user from group_members gm
    where gm.group_id = v_group and gm.user_id <> v_user;
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

grant execute on function create_event(jsonb) to authenticated;
