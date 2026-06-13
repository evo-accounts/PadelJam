-- join_event: public group event, num_courts=1 (capacity 4; organizer takes 1 slot). Three other group
-- members join -> 'confirmed'. A 5th join -> 'waiting_list' pos 1, and community/group membership rows
-- exist for the joiner (public-event membership side-effect). Private event: non-invitee -> not_invited;
-- double join -> already_joined; team-spec join -> use_team_join. Past-cutoff event -> event_closed.
-- 'PT001' = "expected behaviour did not hold" sentinel; the RPC raises P0001.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f3000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ejown@x.com'),
  ('f3000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ejm2@x.com'),
  ('f3000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ejm3@x.com'),
  ('f3000004-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ejm4@x.com'),
  ('f3000005-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ejm5@x.com'),
  ('f3000006-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ejout@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f3000001-0000-0000-0000-000000000001','ejown@x.com','+351903000001','EjOwner'),
  ('f3000002-0000-0000-0000-000000000002','ejm2@x.com','+351903000002','EjMember2'),
  ('f3000003-0000-0000-0000-000000000003','ejm3@x.com','+351903000003','EjMember3'),
  ('f3000004-0000-0000-0000-000000000004','ejm4@x.com','+351903000004','EjMember4'),
  ('f3000005-0000-0000-0000-000000000005','ejm5@x.com','+351903000005','EjMember5'),
  ('f3000006-0000-0000-0000-000000000006','ejout@x.com','+351903000006','EjOutsider') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f3000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('EJoinC','club','PT','public') as cid \gset
reset role;
insert into community_subscriptions (community_id, plan_id)
  select id, 'basic' from communities where name='EJoinC' order by created_at desc limit 1
  on conflict (community_id) do update set plan_id='basic';

-- m2..m5 are community + group members. outsider is neither.
insert into community_members (community_id, user_id, role) values
  (:'cid','f3000002-0000-0000-0000-000000000002','member'),
  (:'cid','f3000003-0000-0000-0000-000000000003','member'),
  (:'cid','f3000004-0000-0000-0000-000000000004','member'),
  (:'cid','f3000005-0000-0000-0000-000000000005','member') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f3000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_group(:'cid','EJoinGroup',null,false) as gid \gset
reset role;
insert into group_members (group_id, user_id) values
  (:'gid','f3000002-0000-0000-0000-000000000002'),
  (:'gid','f3000003-0000-0000-0000-000000000003'),
  (:'gid','f3000004-0000-0000-0000-000000000004'),
  (:'gid','f3000005-0000-0000-0000-000000000005') on conflict do nothing;
select set_config('test.cid', :'cid', false);
select set_config('test.gid', :'gid', false);

-- Public group americano, num_courts=1 (capacity 4). Organizer playing -> takes 1 confirmed slot.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f3000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_event(jsonb_build_object(
  'group_id', :'gid'::text, 'event_type','americano', 'specification','classic',
  'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
  'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
  'organizer_role','organizing_and_playing', 'name','Join Event')) as pub_ev \gset
reset role;
select set_config('test.pub_ev', :'pub_ev', false);

-- (1) m2, m3, m4 join -> all 'confirmed' (slots 2,3,4 of capacity 4).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f3000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ declare v text; begin v := join_event(current_setting('test.pub_ev')::uuid);
  if v <> 'confirmed' then raise exception using errcode='PT001', message='m2 join expected confirmed, got '||v; end if; end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f3000003-0000-0000-0000-000000000003","role":"authenticated"}';
do $$ declare v text; begin v := join_event(current_setting('test.pub_ev')::uuid);
  if v <> 'confirmed' then raise exception using errcode='PT001', message='m3 join expected confirmed, got '||v; end if; end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f3000004-0000-0000-0000-000000000004","role":"authenticated"}';
do $$ declare v text; begin v := join_event(current_setting('test.pub_ev')::uuid);
  if v <> 'confirmed' then raise exception using errcode='PT001', message='m4 join expected confirmed, got '||v; end if; end $$;
reset role;
set local role postgres;
do $$
declare pub_ev uuid := current_setting('test.pub_ev')::uuid;
begin
  if (select count(*) from event_participants where event_id=pub_ev and status='confirmed') <> 4 then
    raise exception using errcode='PT001', message='expected 4 confirmed (organizer + 3 joiners)'; end if;
  raise notice 'OK three group members join -> confirmed (capacity 4 full)';
end $$;
reset role;

-- (2) m5 joins a full event -> 'waiting_list' pos 1; membership rows present (public-event side-effect).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f3000005-0000-0000-0000-000000000005","role":"authenticated"}';
do $$
declare cid uuid := current_setting('test.cid')::uuid;
        gid uuid := current_setting('test.gid')::uuid;
        pub_ev uuid := current_setting('test.pub_ev')::uuid; v_status text;
begin
  v_status := join_event(pub_ev);
  if v_status <> 'waiting_list' then
    raise exception using errcode='PT001', message=format('5th joiner expected waiting_list, got %s', v_status); end if;
  if (select waiting_list_position from event_participants where event_id=pub_ev and user_id=auth.uid()) <> 1 then
    raise exception using errcode='PT001', message='5th joiner waiting_list_position should be 1'; end if;
  if not exists (select 1 from community_members where community_id=cid and user_id=auth.uid()) then
    raise exception using errcode='PT001', message='public-event join should ensure community_members row'; end if;
  if not exists (select 1 from group_members where group_id=gid and user_id=auth.uid()) then
    raise exception using errcode='PT001', message='public-event join should ensure group_members row'; end if;
  raise notice 'OK 5th joiner -> waiting_list pos 1 + community/group membership side-effect';
end $$;
reset role;

-- (3) Double join -> already_joined (m2 joins again).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f3000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare pub_ev uuid := current_setting('test.pub_ev')::uuid;
begin
  begin
    perform join_event(pub_ev);
    raise exception using errcode='PT001', message='double join should raise already_joined';
  exception when sqlstate 'P0001' then raise notice 'OK double join blocked (%)', sqlerrm;
  end;
end $$;
reset role;

-- PRIVATE event: non-invitee join -> not_invited.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f3000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_event(jsonb_build_object(
  'group_id', :'gid'::text, 'is_private', true, 'event_type','americano', 'specification','classic',
  'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
  'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
  'organizer_role','organizing_only', 'name','Private Join Event')) as priv_ev \gset
reset role;
select set_config('test.priv_ev', :'priv_ev', false);

set local role authenticated;
set local request.jwt.claims = '{"sub":"f3000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare priv_ev uuid := current_setting('test.priv_ev')::uuid;
begin
  begin
    perform join_event(priv_ev);
    raise exception using errcode='PT001', message='non-invitee private join should raise not_invited';
  exception when sqlstate 'P0001' then raise notice 'OK private non-invitee blocked (%)', sqlerrm;
  end;
end $$;
reset role;

-- TEAM-spec event: join_event -> use_team_join.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f3000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_event(jsonb_build_object(
  'group_id', :'gid'::text, 'event_type','americano', 'specification','team',
  'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
  'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
  'organizer_role','organizing_only', 'name','Team Join Event')) as team_ev \gset
reset role;
select set_config('test.team_ev', :'team_ev', false);

set local role authenticated;
set local request.jwt.claims = '{"sub":"f3000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare team_ev uuid := current_setting('test.team_ev')::uuid;
begin
  begin
    perform join_event(team_ev);
    raise exception using errcode='PT001', message='team-spec join should raise use_team_join';
  exception when sqlstate 'P0001' then raise notice 'OK team-spec join blocked (%)', sqlerrm;
  end;
end $$;
reset role;

-- (Deadline) event starts_at = now()+3h -> past the 6h join cutoff -> event_closed.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f3000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_event(jsonb_build_object(
  'group_id', :'gid'::text, 'event_type','americano', 'specification','classic',
  'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
  'starts_at', (now()+interval '3 hours'), 'duration_minutes', 90,
  'organizer_role','organizing_only', 'name','Soon Event')) as soon_ev \gset
reset role;
select set_config('test.soon_ev', :'soon_ev', false);

set local role authenticated;
set local request.jwt.claims = '{"sub":"f3000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare soon_ev uuid := current_setting('test.soon_ev')::uuid;
begin
  begin
    perform join_event(soon_ev);
    raise exception using errcode='PT001', message='join past 6h cutoff should raise event_closed';
  exception when sqlstate 'P0001' then raise notice 'OK past-cutoff join blocked (%)', sqlerrm;
  end;
end $$;
reset role;
rollback;
