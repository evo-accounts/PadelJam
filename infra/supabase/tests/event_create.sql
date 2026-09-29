-- create_event: group admin creates a public americano -> uuid, no invitations and an event_created
-- notification for OTHER group members (0112), organizer is a confirmed participant (organizing_and_playing). Non-admin member -> forbidden.
-- Standalone (no group_id) -> is_private=true. Blank name -> name_required. Bad event_type -> invalid_event_config.
-- 'PT001' = "expected behaviour did not hold" sentinel; the RPC raises P0001.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f1000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ecown@x.com'),
  ('f1000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ecmem@x.com'),
  ('f1000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ecmem2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f1000001-0000-0000-0000-000000000001','ecown@x.com','+351901000001','EcOwner'),
  ('f1000002-0000-0000-0000-000000000002','ecmem@x.com','+351901000002','EcMember'),
  ('f1000003-0000-0000-0000-000000000003','ecmem2@x.com','+351901000003','EcMember2') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('ECreateC','club','PT','public') as cid \gset
reset role;
insert into community_subscriptions (community_id, plan_id)
  select id, 'basic' from communities where name='ECreateC' order by created_at desc limit 1
  on conflict (community_id) do update set plan_id='basic';

-- Two plain community members; member2 will be a group member, member is a non-admin not in the group.
insert into community_members (community_id, user_id, role) values
  (:'cid','f1000002-0000-0000-0000-000000000002','member'),
  (:'cid','f1000003-0000-0000-0000-000000000003','member') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_group(:'cid','ECreateGroup','desc',false) as gid \gset
reset role;
-- member2 is a group member (so they should get an event_created notification), member is NOT.
insert into group_members (group_id, user_id)
  values (:'gid','f1000003-0000-0000-0000-000000000003') on conflict do nothing;
select set_config('test.cid', :'cid', false);
select set_config('test.gid', :'gid', false);

-- (1) Group owner (community admin) creates a public americano event.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare gid uuid := current_setting('test.gid')::uuid;
        v_event uuid;
begin
  v_event := create_event(jsonb_build_object(
    'group_id', gid::text, 'event_type','americano', 'specification','classic',
    'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
    'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
    'organizer_role','organizing_and_playing', 'name','Test Event'));
  if v_event is null then raise exception using errcode='PT001', message='create_event returned null'; end if;
  -- organizer is a confirmed participant (organizing_and_playing).
  if not exists (select 1 from event_participants
                 where event_id=v_event and user_id='f1000001-0000-0000-0000-000000000001' and status='confirmed') then
    raise exception using errcode='PT001', message='organizer must be a confirmed participant'; end if;
  perform set_config('test.ev1', v_event::text, false);
end $$;
reset role;

-- The invitation / notification checks run as the table owner: under RLS the organizer cannot read
-- event_invitations rows or another user's notifications, so an authenticated read would see nothing
-- and prove nothing.
do $$
declare v_event uuid := current_setting('test.ev1')::uuid;
begin
  -- 0112 (decision 5): a public group event invites nobody; the OTHER member (member2) gets an
  -- event_created notification instead, and the organizer gets none.
  if exists (select 1 from event_invitations where event_id=v_event) then
    raise exception using errcode='PT001', message='public group event must not create invitations'; end if;
  if not exists (select 1 from notifications
                 where event_id=v_event and user_id='f1000003-0000-0000-0000-000000000003' and type='event_created') then
    raise exception using errcode='PT001', message='event_created missing for the other group member'; end if;
  if exists (select 1 from notifications
             where event_id=v_event and user_id='f1000001-0000-0000-0000-000000000001' and type='event_created') then
    raise exception using errcode='PT001', message='organizer must not be notified of their own event'; end if;
  raise notice 'OK create_event public group: uuid + event_created for other members + organizer confirmed';
end $$;

-- (2) A plain community member and create_event. Since migration 0098 the gate is the
-- create_events TOGGLE (UX-COMM-17), not the role: it is ON by default, so the member succeeds,
-- and turning it off is what refuses them. Role alone no longer decides.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare gid uuid := current_setting('test.gid')::uuid; v_event uuid;
begin
  v_event := create_event(jsonb_build_object(
    'group_id', gid::text, 'event_type','americano', 'specification','classic',
    'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
    'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
    'organizer_role','organizing_and_playing', 'name','Member Event'));
  if v_event is null then
    raise exception using errcode='PT001', message='a member should create group events with create_events on'; end if;
  raise notice 'OK member create_event allowed while create_events is on';
end $$;
reset role;

-- …and refused once an admin turns the toggle off.
reset role;
update community_permissions set create_events = false
  where community_id = (select community_id from groups where id = current_setting('test.gid')::uuid);
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare gid uuid := current_setting('test.gid')::uuid;
begin
  begin
    perform create_event(jsonb_build_object(
      'group_id', gid::text, 'event_type','americano', 'specification','classic',
      'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
      'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
      'organizer_role','organizing_and_playing', 'name','Sneaky Event'));
    raise exception using errcode='PT001', message='member create_event should be refused with create_events off';
  exception when sqlstate 'P0001' then raise notice 'OK member create_event blocked with the toggle off (%)', sqlerrm;
  end;
end $$;
reset role;
-- Restore the default so the rest of the file sees an untouched community.
update community_permissions set create_events = true
  where community_id = (select community_id from groups where id = current_setting('test.gid')::uuid);

-- (3) Standalone event (no group_id) -> is_private forced true.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare v_event uuid;
begin
  v_event := create_event(jsonb_build_object(
    'event_type','americano', 'specification','classic',
    'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
    'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
    'organizer_role','organizing_and_playing', 'name','Standalone Event'));
  if (select is_private from events where id=v_event) <> true then
    raise exception using errcode='PT001', message='standalone event must be is_private=true'; end if;
  if (select group_id from events where id=v_event) is not null then
    raise exception using errcode='PT001', message='standalone event must have null group_id'; end if;
  raise notice 'OK standalone event -> is_private=true';
end $$;
reset role;

-- (4) Blank name -> name_required (P0001).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare gid uuid := current_setting('test.gid')::uuid;
begin
  begin
    perform create_event(jsonb_build_object(
      'group_id', gid::text, 'event_type','americano', 'specification','classic',
      'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
      'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
      'organizer_role','organizing_and_playing', 'name','   '));
    raise exception using errcode='PT001', message='blank name should raise name_required';
  exception when sqlstate 'P0001' then raise notice 'OK blank name blocked (%)', sqlerrm;
  end;
end $$;
reset role;

-- (5) Bad event_type -> invalid_event_config (P0001).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare gid uuid := current_setting('test.gid')::uuid;
begin
  begin
    perform create_event(jsonb_build_object(
      'group_id', gid::text, 'event_type','bananas', 'specification','classic',
      'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
      'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
      'organizer_role','organizing_and_playing', 'name','Bad Type'));
    raise exception using errcode='PT001', message='bad event_type should raise invalid_event_config';
  exception when sqlstate 'P0001' then raise notice 'OK bad event_type blocked (%)', sqlerrm;
  end;
end $$;
reset role;
rollback;
