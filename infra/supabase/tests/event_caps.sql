-- Starter (no subscription) has no recurring cap since 0156: two series succeed.
-- recurring_events cap via create_event with a 'series' object (inserts event_series): basic=5 ->
-- 5 recurring creates succeed, the 6th hits the cap (P0001). community_pro (null limit) -> unlimited.
-- 'PT001' = "expected behaviour did not hold" sentinel; the cap trigger raises P0001.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f7000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ecaps@x.com'),
  ('f7000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ecapb@x.com'),
  ('f7000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ecapp@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f7000003-0000-0000-0000-000000000003','ecaps@x.com','+351907000003','ECapStarter'),
  ('f7000001-0000-0000-0000-000000000001','ecapb@x.com','+351907000001','ECapBasic'),
  ('f7000002-0000-0000-0000-000000000002','ecapp@x.com','+351907000002','ECapPro') on conflict do nothing;

-- BASIC community: recurring_events limit = 5.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f7000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('ECapBasicC','club','PT','public') as cid \gset
reset role;
insert into community_subscriptions (community_id, plan_id)
  select id, 'basic' from communities where name='ECapBasicC' order by created_at desc limit 1
  on conflict (community_id) do update set plan_id='basic';

set local role authenticated;
set local request.jwt.claims = '{"sub":"f7000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_group(:'cid','ECapGroup',null,false) as gid \gset
reset role;
select set_config('test.gid', :'gid', false);

-- Create 5 recurring events (each create_event with a series -> inserts event_series). All succeed.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f7000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare gid uuid := current_setting('test.gid')::uuid; i int;
begin
  for i in 1..5 loop
    perform create_event(jsonb_build_object(
      'group_id', gid::text, 'event_type','americano', 'specification','classic',
      'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
      'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
      'organizer_role','organizing_and_playing', 'name','Recurring '||i,
      'series', jsonb_build_object('day_of_week',2,'start_time','19:00','duration_minutes',90,'invite_lead_days',5)));
  end loop;
  if (select count(*) from event_series es join groups g on g.id=es.group_id
        join communities c on c.id=g.community_id where c.name='ECapBasicC' and es.is_active) <> 5 then
    raise exception using errcode='PT001', message='expected 5 active event_series under basic'; end if;
  raise notice 'OK basic: 5 recurring events created (5 event_series)';
end $$;
reset role;

-- The 6th recurring create -> recurring_events cap (P0001).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f7000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare gid uuid := current_setting('test.gid')::uuid;
begin
  begin
    perform create_event(jsonb_build_object(
      'group_id', gid::text, 'event_type','americano', 'specification','classic',
      'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
      'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
      'organizer_role','organizing_and_playing', 'name','Recurring 6',
      'series', jsonb_build_object('day_of_week',2,'start_time','19:00','duration_minutes',90,'invite_lead_days',5)));
    raise exception using errcode='PT001', message='6th recurring create should hit the recurring_events cap';
  exception when sqlstate 'P0001' then raise notice 'OK recurring_events cap blocked at 5 (%)', sqlerrm;
  end;
end $$;
reset role;

-- PRO community (null recurring_events limit) -> unlimited recurring.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f7000002-0000-0000-0000-000000000002","role":"authenticated"}';
select create_community_with_personal_tenant('ECapProC','club','PT','public') as pcid \gset
reset role;
insert into community_subscriptions (community_id, plan_id)
  select id, 'community_pro' from communities where name='ECapProC' order by created_at desc limit 1
  on conflict (community_id) do update set plan_id='community_pro';
set local role authenticated;
set local request.jwt.claims = '{"sub":"f7000002-0000-0000-0000-000000000002","role":"authenticated"}';
select create_group(:'pcid','ECapProGroup',null,false) as pgid \gset
reset role;
select set_config('test.pgid', :'pgid', false);

set local role authenticated;
set local request.jwt.claims = '{"sub":"f7000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare pgid uuid := current_setting('test.pgid')::uuid; i int;
begin
  -- 7 recurring (well past basic's 5) all succeed under the null limit.
  for i in 1..7 loop
    perform create_event(jsonb_build_object(
      'group_id', pgid::text, 'event_type','americano', 'specification','classic',
      'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
      'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
      'organizer_role','organizing_and_playing', 'name','Pro Recurring '||i,
      'series', jsonb_build_object('day_of_week',2,'start_time','19:00','duration_minutes',90,'invite_lead_days',5)));
  end loop;
  if (select count(*) from event_series es join groups g on g.id=es.group_id
        join communities c on c.id=g.community_id where c.name='ECapProC' and es.is_active) <> 7 then
    raise exception using errcode='PT001', message='community_pro should allow 7 recurring event_series'; end if;
  raise notice 'OK community_pro: unlimited recurring (7 event_series created)';
end $$;
reset role;

-- STARTER community (no subscription row): recurring_events is unlimited since 0156.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f7000003-0000-0000-0000-000000000003","role":"authenticated"}';
select create_community_with_personal_tenant('ECapStarterC','club','PT','public') as scid \gset
select create_group(:'scid','ECapStarterGroup',null,false) as sgid \gset
reset role;
select set_config('test.sgid', :'sgid', false);
set local role authenticated;
set local request.jwt.claims = '{"sub":"f7000003-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
declare sgid uuid := current_setting('test.sgid')::uuid; i int;
begin
  for i in 1..2 loop
    perform create_event(jsonb_build_object(
      'group_id', sgid::text, 'event_type','americano', 'specification','classic',
      'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
      'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
      'organizer_role','organizing_and_playing', 'name','Starter Recurring '||i,
      'series', jsonb_build_object('day_of_week',2,'start_time','19:00','duration_minutes',90,'invite_lead_days',5)));
  end loop;
  if (select count(*) from event_series es join groups g on g.id=es.group_id
        join communities c on c.id=g.community_id where c.name='ECapStarterC' and es.is_active) <> 2 then
    raise exception using errcode='PT001', message='starter should allow 2 recurring event_series'; end if;
  raise notice 'OK starter: 2 recurring series created';
end $$;
reset role;
rollback;
