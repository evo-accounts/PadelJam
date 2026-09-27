-- Events RLS read: private group event with explicit invitee list -> visible to organizer + invitee,
-- hidden from a non-invited community member (event_is_visible false AND count 0). Public group event ->
-- visible to a group member, hidden from a community member not in the group. A private event's
-- participants/matches are invisible to an outsider (count 0).
-- 'PT001' = "expected behaviour did not hold" sentinel (distinct from RLS's silent row-filtering).
-- The community is request_to_join on purpose: since 0100 a PUBLIC community's open groups and
-- non-private group events are readable by any signed-in user, which would bypass the group-member
-- branch tested here. That public branch is covered by public-community-read.test.mjs.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f2000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','evown@x.com'),
  ('f2000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','evinv@x.com'),
  ('f2000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','evcommem@x.com'),
  ('f2000004-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','evgrpmem@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f2000001-0000-0000-0000-000000000001','evown@x.com','+351902000001','EvOwner'),
  ('f2000002-0000-0000-0000-000000000002','evinv@x.com','+351902000002','EvInvitee'),
  ('f2000003-0000-0000-0000-000000000003','evcommem@x.com','+351902000003','EvCommMember'),
  ('f2000004-0000-0000-0000-000000000004','evgrpmem@x.com','+351902000004','EvGroupMember') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f2000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('EVisC','club','PT','request_to_join') as cid \gset
reset role;
insert into community_subscriptions (community_id, plan_id)
  select id, 'basic' from communities where name='EVisC' order by created_at desc limit 1
  on conflict (community_id) do update set plan_id='basic';

-- invitee + commmember + grpmember are all community members; grpmember is also in the group.
insert into community_members (community_id, user_id, role) values
  (:'cid','f2000002-0000-0000-0000-000000000002','member'),
  (:'cid','f2000003-0000-0000-0000-000000000003','member'),
  (:'cid','f2000004-0000-0000-0000-000000000004','member') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f2000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_group(:'cid','EVisGroup',null,false) as gid \gset
reset role;
insert into group_members (group_id, user_id)
  values (:'gid','f2000004-0000-0000-0000-000000000004') on conflict do nothing;

-- PRIVATE group event with an explicit invitee (the invitee, who is NOT a group member).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f2000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_event(jsonb_build_object(
  'group_id', :'gid'::text, 'is_private', true, 'event_type','americano', 'specification','classic',
  'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
  'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
  'organizer_role','organizing_and_playing', 'name','Private Event',
  'invitees', jsonb_build_array(jsonb_build_object('invitee_id','f2000002-0000-0000-0000-000000000002')))) as priv_ev \gset
-- PUBLIC group event.
select create_event(jsonb_build_object(
  'group_id', :'gid'::text, 'event_type','americano', 'specification','classic',
  'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
  'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
  'organizer_role','organizing_and_playing', 'name','Public Event')) as pub_ev \gset
reset role;
-- Seed a participant + a round/match on the private event (as postgres, bypassing RLS) so we can test
-- that an outsider sees zero participants/matches.
set local role postgres;
insert into event_rounds (event_id, round_number, status, generated_at)
  values (:'priv_ev', 1, 'active', now());
insert into event_matches (event_id, round_id, court_number, match_number, status)
  select :'priv_ev', id, 1, 1, 'pending' from event_rounds where event_id=:'priv_ev' and round_number=1;
reset role;
select set_config('test.priv_ev', :'priv_ev', false);
select set_config('test.pub_ev', :'pub_ev', false);

-- (1) Non-invited community member: private event invisible (helper false + count 0).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f2000003-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
declare priv_ev uuid := current_setting('test.priv_ev')::uuid;
begin
  if event_is_visible(priv_ev, auth.uid()) then
    raise exception using errcode='PT001', message='event_is_visible should be false for a non-invited member'; end if;
  if (select count(*) from events where id=priv_ev) <> 0 then
    raise exception using errcode='PT001', message='RLS should hide private event from non-invited member'; end if;
  -- participants + matches of the private event invisible.
  if (select count(*) from event_participants where event_id=priv_ev) <> 0 then
    raise exception using errcode='PT001', message='private event participants leaked to outsider'; end if;
  if (select count(*) from event_matches where event_id=priv_ev) <> 0 then
    raise exception using errcode='PT001', message='private event matches leaked to outsider'; end if;
  raise notice 'OK non-invited member: private event + participants + matches hidden';
end $$;
reset role;

-- (2) The invitee sees the private event (count 1).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f2000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare priv_ev uuid := current_setting('test.priv_ev')::uuid;
begin
  if not event_is_visible(priv_ev, auth.uid()) then
    raise exception using errcode='PT001', message='event_is_visible should be true for the invitee'; end if;
  if (select count(*) from events where id=priv_ev) <> 1 then
    raise exception using errcode='PT001', message='invitee should see the private event'; end if;
  raise notice 'OK invitee: private event visible';
end $$;
reset role;

-- (3) The organizer sees the private event (count 1).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f2000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare priv_ev uuid := current_setting('test.priv_ev')::uuid;
begin
  if (select count(*) from events where id=priv_ev) <> 1 then
    raise exception using errcode='PT001', message='organizer should see the private event'; end if;
  raise notice 'OK organizer: private event visible';
end $$;
reset role;

-- (4) Public group event: visible to a group member, hidden from a community member not in the group.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f2000004-0000-0000-0000-000000000004","role":"authenticated"}';
do $$
declare pub_ev uuid := current_setting('test.pub_ev')::uuid;
begin
  if (select count(*) from events where id=pub_ev) <> 1 then
    raise exception using errcode='PT001', message='group member should see the public group event'; end if;
  raise notice 'OK group member: public group event visible';
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f2000003-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
declare pub_ev uuid := current_setting('test.pub_ev')::uuid;
begin
  if event_is_visible(pub_ev, auth.uid()) then
    raise exception using errcode='PT001', message='public group event should NOT be visible to a non-group community member'; end if;
  if (select count(*) from events where id=pub_ev) <> 0 then
    raise exception using errcode='PT001', message='public group event leaked to a non-group community member'; end if;
  raise notice 'OK non-group community member: public group event hidden';
end $$;
reset role;
rollback;
