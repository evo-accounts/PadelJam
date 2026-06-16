-- create_event_location: search_venues ILIKE match; create_event writes location_point from coords.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('fb000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ce1@x.com')
  on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('fb000001-0000-0000-0000-000000000001','ce1@x.com','+351900090001','Org CE') on conflict do nothing;

do $$
declare o constant uuid := 'fb000001-0000-0000-0000-000000000001';
  v_tenant uuid; v_comm uuid; v_group uuid; v_event uuid; v_event2 uuid; v_venue uuid;
  v_pt geography; v_cnt int; v_manual text;
begin
  -- seed a venue to prove search_venues
  insert into venues (name, address, created_by) values ('Padel Central Lisboa', 'Av. Test 1', o) returning id into v_venue;
  insert into tenants (type, name, country) values ('community','CE Tenant','PT') returning id into v_tenant;
  insert into communities (tenant_id, name, type, privacy) values (v_tenant,'CE Community','club','public') returning id into v_comm;
  insert into community_members (community_id, user_id, role) values (v_comm, o, 'owner');
  insert into groups (community_id, name) values (v_comm,'CE Group') returning id into v_group;
  insert into group_members (group_id, user_id) values (v_group, o);

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', o), true);

  -- search_venues matches on name
  select count(*) into v_cnt from search_venues('central');
  if v_cnt < 1 then raise exception using errcode='PT001', message='search_venues did not match'; end if;

  -- create_event with coords sets location_point
  v_event := create_event(jsonb_build_object(
    'group_id', v_group::text, 'event_type','americano', 'specification','mixed',
    'scoring_mode','points', 'scoring_value','24', 'num_courts','2',
    'starts_at', (now() + interval '1 day')::text, 'duration_minutes','90',
    'is_private', false, 'organizer_role','organizing_and_playing', 'name','CE Event',
    'manual_location_name','My Court', 'has_location', true,
    'location_lat','38.72', 'location_lng','-9.14', 'location_text','My Court, Lisboa'
  ));
  select location_point into v_pt from events where id = v_event;
  if v_pt is null then raise exception using errcode='PT001', message='location_point not set'; end if;

  -- venue-pick path: venue_id set, NO manual_location_name (what the fixed client payload sends).
  -- Must satisfy events_venue_xor_manual (regression for the venue+manual double-set bug).
  v_event2 := create_event(jsonb_build_object(
    'group_id', v_group::text, 'event_type','americano', 'specification','mixed',
    'scoring_mode','points', 'scoring_value','24', 'num_courts','2',
    'starts_at', (now() + interval '1 day')::text, 'duration_minutes','90',
    'is_private', false, 'organizer_role','organizing_and_playing', 'name','CE Venue Event',
    'venue_id', v_venue::text, 'has_location', true, 'location_text','Padel Central Lisboa'
  ));
  select manual_location_name into v_manual from events where id = v_event2;
  if v_manual is not null then raise exception using errcode='PT001', message='venue event has manual_location_name set'; end if;

  raise notice 'OK create_event_location';
end $$;
rollback;
