-- A2: update_event location + courts guard + event_updated re-notify.
-- Verifies: venue<->manual location persistence (opposite side nulled), coords -> location_point,
-- num_courts guard (courts_below_roster), and event_updated notifications fire on date/location
-- change but NOT on a name-only edit. 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('b0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','loc-u1@x.com'),
  ('b0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','loc-p1@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('b0000001-0000-0000-0000-000000000001','loc-u1@x.com','+351900700001','LocOrganizer'),
  ('b0000002-0000-0000-0000-000000000002','loc-p1@x.com','+351900700002','LocPlayer') on conflict do nothing;

do $$
declare
  u1  uuid := 'b0000001-0000-0000-0000-000000000001';
  p1  uuid := 'b0000002-0000-0000-0000-000000000002';
  cid uuid;
  g   uuid;
  ven uuid;
  ev  uuid;
  base jsonb;
  v_venue uuid;
  v_mname text;
  v_courts int;
  v_point_null boolean;
  n_upd int;
  n_after int;
  v_starts timestamptz;
  i int;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"b0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('LocC','club','PT','public');

  perform set_config('role','postgres',true);
  select id into g from groups where community_id = cid order by created_at limit 1;
  insert into venues (name, address, created_by) values ('Padel Palace','1 Court St', u1) returning id into ven;

  -- Scheduled group event, manual location, num_courts=2 (capacity 8).
  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode, scoring_value,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private,
    manual_location_name, has_location
  ) values (
    g, u1, 'americano', 'classic', 'points', 24,
    2, now() + interval '2 day', 90, 'organizing_only', 'LocEv', 'scheduled', false,
    'Old Gym', true
  ) returning id into ev;

  -- A confirmed non-organizer participant (for the re-notify assertions).
  insert into event_participants (event_id, user_id, status, is_standby) values (ev, p1, 'confirmed', false);

  -- Base payload: a full editable snapshot (matches what the client always sends).
  base := jsonb_build_object(
    'name','LocEv','description','d',
    'starts_at',(now()+interval '2 day')::text,'duration_minutes',90,
    'scoring_mode','points','scoring_value',24,
    'allow_standby',false,'is_private',false,
    'entrance_fee_enabled',false,'players_submit_results',false,'organizer_role','organizing_only',
    'num_courts',2,'has_location',true,
    'manual_location_name','Old Gym','manual_location_address',null,'venue_id',null);

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"b0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);

  -- (1) manual -> venue: send venue_id, null manual. Expect venue set + manual nulled + event_updated fired.
  perform update_event(ev, base || jsonb_build_object('venue_id', ven::text, 'manual_location_name', null, 'location_text', null));
  perform set_config('role','postgres',true);
  select venue_id, manual_location_name into v_venue, v_mname from events where id = ev;
  if v_venue is distinct from ven or v_mname is not null then
    raise exception using errcode='PT001', message='manual->venue: expected venue set + manual nulled';
  end if;
  select count(*) into n_upd from notifications where event_id = ev and type='event_updated' and user_id = p1;
  if n_upd <> 1 then
    raise exception using errcode='PT001', message='location change should notify the confirmed player once, got '||n_upd;
  end if;
  raise notice 'OK location manual->venue + event_updated fired';

  -- (2) venue -> manual + coords: expect manual set, venue nulled, location_point written.
  perform set_config('role','authenticated',true);
  perform update_event(ev, base || jsonb_build_object(
    'venue_id', null, 'manual_location_name','New Club','manual_location_address','9 Court Ave',
    'location_lat', 38.72, 'location_lng', -9.14, 'location_text','New Club'));
  perform set_config('role','postgres',true);
  select venue_id, manual_location_name, (location_point is null) into v_venue, v_mname, v_point_null from events where id = ev;
  if v_venue is not null or v_mname <> 'New Club' or v_point_null then
    raise exception using errcode='PT001', message='venue->manual: expected manual set, venue null, location_point written';
  end if;
  raise notice 'OK location venue->manual + coords -> location_point';

  -- (3) courts guard: seed 5 confirmed main players total, then lowering to num_courts=1 (cap 4) must fail.
  perform set_config('role','postgres',true);
  for i in 1..4 loop
    insert into event_participants (event_id, guest_name, status, is_standby)
      values (ev, 'Guest'||i, 'confirmed', false);
  end loop; -- now 5 confirmed main (p1 + 4 guests)
  perform set_config('role','authenticated',true);
  begin
    perform update_event(ev, base || jsonb_build_object('num_courts', 1,
      'manual_location_name','New Club','manual_location_address','9 Court Ave','location_text','New Club'));
    raise exception using errcode='PT001', message='lowering courts below confirmed roster should raise courts_below_roster';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('courts_below_roster' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for courts guard: '||sqlerrm;
      end if;
  end;
  raise notice 'OK courts guard: courts_below_roster';

  -- (4) name-only edit (SAME starts_at + SAME location as the current row) -> NO new event_updated.
  -- Reuse the row's stored starts_at + current location so neither v_date_changed nor v_loc_changed trips.
  perform set_config('role','postgres',true);
  select starts_at into v_starts from events where id = ev;
  select count(*) into n_upd from notifications where event_id = ev and type='event_updated' and user_id = p1;
  perform set_config('role','authenticated',true);
  perform update_event(ev, base || jsonb_build_object('name','Renamed',
    'starts_at', v_starts::text,
    'manual_location_name','New Club','manual_location_address','9 Court Ave','location_text','New Club'));
  perform set_config('role','postgres',true);
  select count(*) into n_after from notifications where event_id = ev and type='event_updated' and user_id = p1;
  if n_after <> n_upd then
    raise exception using errcode='PT001', message='name-only edit must not add an event_updated notification ('||n_upd||'->'||n_after||')';
  end if;
  raise notice 'OK name-only edit: no extra event_updated';

  raise notice 'OK update_event_location';
end $$;
rollback;
