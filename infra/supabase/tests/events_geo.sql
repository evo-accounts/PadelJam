-- events_geo: viewer_distance_m null-safety + monotonicity; explore_events ranks nearest-first, nulls last.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('fa000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','geo1@x.com'),
  ('fa000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','geo2@x.com')
  on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('fa000001-0000-0000-0000-000000000001','geo1@x.com','+351900080001','Viewer Geo'),
  ('fa000002-0000-0000-0000-000000000002','geo2@x.com','+351900080002','Organizer Geo')
  on conflict do nothing;

do $$
declare v constant uuid := 'fa000001-0000-0000-0000-000000000001';   -- viewer
  o constant uuid := 'fa000002-0000-0000-0000-000000000002';          -- organizer (different user)
  v_tenant uuid; v_comm uuid; v_group uuid;
  e_near uuid; e_far uuid; e_null uuid;
  -- Lisbon ~ (38.72, -9.14). near ~ same; far ~ Porto (41.15, -8.61).
  near_pt geography := st_setsrid(st_makepoint(-9.14, 38.72), 4326)::geography;
  far_pt  geography := st_setsrid(st_makepoint(-8.61, 41.15), 4326)::geography;
  d_near double precision; d_far double precision; d_nullarg double precision;
  v_rows uuid[];
begin
  -- Viewer's home location = Lisbon.
  update profiles set location_point = st_setsrid(st_makepoint(-9.14, 38.72), 4326)::geography where id = v;

  -- Public community + public group + a far, near, and null-coord upcoming event by organizer o.
  -- (Setup as the bootstrap/postgres role, before switching to the authenticated viewer.)
  insert into tenants (type, name, country) values ('community','Geo Tenant','PT') returning id into v_tenant;
  insert into communities (tenant_id, name, type, privacy) values (v_tenant,'Geo Community','club','public') returning id into v_comm;
  insert into groups (community_id, name) values (v_comm,'Geo Group') returning id into v_group;
  insert into events (organizer_id, group_id, event_type, specification, scoring_mode, scoring_value,
                      manual_location_name, has_location, num_courts, is_private, starts_at,
                      duration_minutes, organizer_role, name, status, location_point)
    values (o, v_group,'americano','mixed','points',24,'Far',true,2,false, now()+interval '2 days',
            90,'organizing_and_playing','Far Event','scheduled', far_pt) returning id into e_far;
  insert into events (organizer_id, group_id, event_type, specification, scoring_mode, scoring_value,
                      manual_location_name, has_location, num_courts, is_private, starts_at,
                      duration_minutes, organizer_role, name, status, location_point)
    values (o, v_group,'americano','mixed','points',24,'Near',true,2,false, now()+interval '3 days',
            90,'organizing_and_playing','Near Event','scheduled', near_pt) returning id into e_near;
  insert into events (organizer_id, group_id, event_type, specification, scoring_mode, scoring_value,
                      manual_location_name, has_location, num_courts, is_private, starts_at,
                      duration_minutes, organizer_role, name, status)
    values (o, v_group,'americano','mixed','points',24,'Nul',true,2,false, now()+interval '1 day',
            90,'organizing_and_playing','Null Event','scheduled') returning id into e_null;

  -- Now act as the authenticated viewer for the helper + explore_events checks.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v), true);

  -- viewer_distance_m: null arg -> null; near < far.
  select viewer_distance_m(null) into d_nullarg;
  if d_nullarg is not null then raise exception using errcode='PT001', message='viewer_distance_m(null) not null'; end if;
  select viewer_distance_m(near_pt) into d_near;
  select viewer_distance_m(far_pt) into d_far;
  if d_near is null or d_far is null or not (d_near < d_far) then
    raise exception using errcode='PT001', message=format('distance order wrong near=%s far=%s', d_near, d_far); end if;

  -- explore_events (as viewer): near first, far second, null-coord last — despite null being soonest.
  select array_agg((event).id order by ord) into v_rows
    from (select event, row_number() over () as ord from explore_events(10, 0)) s;
  if v_rows[1] <> e_near or v_rows[2] <> e_far or v_rows[3] <> e_null then
    raise exception using errcode='PT001', message=format('explore order wrong: %s (want near,far,null = %s,%s,%s)', v_rows, e_near, e_far, e_null); end if;

  raise notice 'OK events_geo';
end $$;
rollback;
