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
  -- Precondition, not an assertion: PostGIS lives in `public` here, and the mobile E2E wipe
  -- (apps/mobile/e2e/fixtures/seed.ts, wipeDb) truncates every public table it does not list —
  -- spatial_ref_sys included. Without SRID 4326 every geography st_distance fails, so say so
  -- instead of surfacing "Cannot find SRID" from inside viewer_distance_m.
  if not exists (select 1 from spatial_ref_sys where srid = 4326) then
    raise exception using errcode='PT002', message='spatial_ref_sys has no SRID 4326 (emptied by the E2E wipe?)',
      hint='Restore it from the PostGIS spatial_ref_sys.sql, or supabase db reset.'; end if;

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

  -- The viewer's identity comes from the JWT claims; viewer_distance_m is an internal helper (0094)
  -- that authenticated cannot call directly, so the helper checks run as postgres and only
  -- explore_events runs as the authenticated viewer.
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v), true);

  -- viewer_distance_m: null arg -> null; near < far.
  select viewer_distance_m(null) into d_nullarg;
  if d_nullarg is not null then raise exception using errcode='PT001', message='viewer_distance_m(null) not null'; end if;
  select viewer_distance_m(near_pt) into d_near;
  select viewer_distance_m(far_pt) into d_far;
  if d_near is null or d_far is null or not (d_near < d_far) then
    raise exception using errcode='PT001', message=format('distance order wrong near=%s far=%s', d_near, d_far); end if;

  -- explore_events (as viewer): near first, far second, null-coord last — despite null being soonest.
  -- Only the relative order of THIS test's three events is asserted: a stack holding seed/E2E data
  -- has other visible events (null-coord ones that start sooner would take slot 3 outright).
  perform set_config('role','authenticated',true);
  select array_agg((event).id order by ord) into v_rows
    from (select event, row_number() over () as ord from explore_events(1000, 0)) s
   where (event).id in (e_near, e_far, e_null);
  if v_rows[1] <> e_near or v_rows[2] <> e_far or v_rows[3] <> e_null then
    raise exception using errcode='PT001', message=format('explore order wrong: %s (want near,far,null = %s,%s,%s)', v_rows, e_near, e_far, e_null); end if;

  raise notice 'OK events_geo';
end $$;
rollback;
