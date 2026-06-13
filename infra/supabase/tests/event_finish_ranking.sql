-- finish_event + set_event_ranking: public group event finished after scoring -> group_event_results has
-- one row per participant with final_placement 1..N and ranking_points = placement_points(placement)
-- (100/75/60/50 for 4 players) in the group's OPEN season. set_event_ranking(false) deletes the rows +
-- counts_for_ranking=false; (true) re-creates them idempotently (UNIQUE(event_id,user_id)). A PRIVATE
-- event and a STANDALONE event finished -> NO group_event_results rows. Re-finish is idempotent (N rows).
-- 'PT001' = "expected behaviour did not hold" sentinel; the RPCs raise P0001.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f6000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','frown@x.com'),
  ('f6000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','frpA@x.com'),
  ('f6000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','frpB@x.com'),
  ('f6000004-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','frpC@x.com'),
  ('f6000005-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','frpD@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f6000001-0000-0000-0000-000000000001','frown@x.com','+351906000001','FrOwner'),
  ('f6000002-0000-0000-0000-000000000002','frpA@x.com','+351906000002','FrPlayerA'),
  ('f6000003-0000-0000-0000-000000000003','frpB@x.com','+351906000003','FrPlayerB'),
  ('f6000004-0000-0000-0000-000000000004','frpC@x.com','+351906000004','FrPlayerC'),
  ('f6000005-0000-0000-0000-000000000005','frpD@x.com','+351906000005','FrPlayerD') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('EFinishC','club','PT','public') as cid \gset
reset role;
insert into community_subscriptions (community_id, plan_id)
  select id, 'community_pro' from communities where name='EFinishC' order by created_at desc limit 1
  on conflict (community_id) do update set plan_id='community_pro';
insert into community_members (community_id, user_id, role) values
  (:'cid','f6000002-0000-0000-0000-000000000002','member'),
  (:'cid','f6000003-0000-0000-0000-000000000003','member'),
  (:'cid','f6000004-0000-0000-0000-000000000004','member'),
  (:'cid','f6000005-0000-0000-0000-000000000005','member') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_group(:'cid','EFinishGroup',null,false) as gid \gset
reset role;
insert into group_members (group_id, user_id) values
  (:'gid','f6000002-0000-0000-0000-000000000002'),
  (:'gid','f6000003-0000-0000-0000-000000000003'),
  (:'gid','f6000004-0000-0000-0000-000000000004'),
  (:'gid','f6000005-0000-0000-0000-000000000005') on conflict do nothing;
select set_config('test.gid', :'gid', false);
select set_config('test.cid', :'cid', false);

-- PUBLIC group event, organizer NOT playing (organizing_only) -> exactly 4 participants (pA..pD).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_event(jsonb_build_object(
  'group_id', :'gid'::text, 'event_type','mexicano', 'specification','classic',
  'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
  'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
  'organizer_role','organizing_only', 'name','Finish Event')) as ev \gset
reset role;
select set_config('test.ev', :'ev', false);

-- Seed 4 confirmed participants + two scored 1-court rounds giving DISTINCT totals
-- pA=62, pB=44, pC=40, pD=22 -> placements 1,2,3,4 -> 100,75,60,50.
set local role postgres;
do $$
declare ev uuid := current_setting('test.ev')::uuid;
        pa uuid; pb uuid; pc uuid; pd uuid; r1 uuid; r2 uuid; m1 uuid; m2 uuid;
begin
  insert into event_participants (event_id, user_id, status, confirmed_at, joined_at)
    values (ev,'f6000002-0000-0000-0000-000000000002','confirmed',now(),now()) returning id into pa;
  insert into event_participants (event_id, user_id, status, confirmed_at, joined_at)
    values (ev,'f6000003-0000-0000-0000-000000000003','confirmed',now(),now()) returning id into pb;
  insert into event_participants (event_id, user_id, status, confirmed_at, joined_at)
    values (ev,'f6000004-0000-0000-0000-000000000004','confirmed',now(),now()) returning id into pc;
  insert into event_participants (event_id, user_id, status, confirmed_at, joined_at)
    values (ev,'f6000005-0000-0000-0000-000000000005','confirmed',now(),now()) returning id into pd;
  update events set status='in_progress' where id=ev;
  -- round 1: {pA,pB} 32 vs {pC,pD} 10
  insert into event_rounds (event_id, round_number, status, generated_at) values (ev,1,'completed',now()) returning id into r1;
  insert into event_matches (event_id, round_id, court_number, match_number, side_a_score, side_b_score, status)
    values (ev,r1,1,1,32,10,'played') returning id into m1;
  insert into match_players (match_id, participant_id, side) values (m1,pa,'a'),(m1,pb,'a'),(m1,pc,'b'),(m1,pd,'b');
  -- round 2: {pA,pC} 30 vs {pB,pD} 12
  insert into event_rounds (event_id, round_number, status, generated_at) values (ev,2,'completed',now()) returning id into r2;
  insert into event_matches (event_id, round_id, court_number, match_number, side_a_score, side_b_score, status)
    values (ev,r2,1,1,30,12,'played') returning id into m2;
  insert into match_players (match_id, participant_id, side) values (m2,pa,'a'),(m2,pc,'a'),(m2,pb,'b'),(m2,pd,'b');
end $$;
reset role;

-- (1) finish_event -> group_event_results: 4 rows, placements 1..4, points 100/75/60/50, open season.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare ev uuid := current_setting('test.ev')::uuid; gid uuid := current_setting('test.gid')::uuid; v_season uuid;
begin
  perform finish_event(ev, 'gg', null);
  if (select status from events where id=ev) <> 'completed' then
    raise exception using errcode='PT001', message='finish_event should mark event completed'; end if;
  select id into v_season from group_seasons where group_id=gid and ended_at is null;
  if (select count(*) from group_event_results where event_id=ev) <> 4 then
    raise exception using errcode='PT001', message='finish_event should write one result row per participant (4)'; end if;
  if (select count(*) from group_event_results where event_id=ev and group_season_id=v_season) <> 4 then
    raise exception using errcode='PT001', message='results must be in the group OPEN season'; end if;
  -- placements 1..4 each present exactly once.
  if (select array_agg(final_placement order by final_placement) from group_event_results where event_id=ev)
       <> array[1,2,3,4] then
    raise exception using errcode='PT001', message='final_placement should be 1..4'; end if;
  -- ranking_points match placement_points for 4 players.
  if (select ranking_points from group_event_results where event_id=ev and user_id='f6000002-0000-0000-0000-000000000002') <> 100
     or (select final_placement from group_event_results where event_id=ev and user_id='f6000002-0000-0000-0000-000000000002') <> 1 then
    raise exception using errcode='PT001', message='player A should be placement 1 / 100 pts'; end if;
  if (select ranking_points from group_event_results where event_id=ev and user_id='f6000003-0000-0000-0000-000000000003') <> 75 then
    raise exception using errcode='PT001', message='player B should be 75 pts'; end if;
  if (select ranking_points from group_event_results where event_id=ev and user_id='f6000004-0000-0000-0000-000000000004') <> 60 then
    raise exception using errcode='PT001', message='player C should be 60 pts'; end if;
  if (select ranking_points from group_event_results where event_id=ev and user_id='f6000005-0000-0000-0000-000000000005') <> 50 then
    raise exception using errcode='PT001', message='player D should be 50 pts'; end if;
  raise notice 'OK finish_event public group -> 4 results, placements 1..4, 100/75/60/50 in open season';
end $$;
reset role;

-- (2) set_event_ranking(false) deletes rows + counts_for_ranking=false; (true) re-creates idempotently.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare ev uuid := current_setting('test.ev')::uuid;
begin
  perform set_event_ranking(ev, false);
  if (select count(*) from group_event_results where event_id=ev) <> 0 then
    raise exception using errcode='PT001', message='set_event_ranking(false) should delete result rows'; end if;
  if (select counts_for_ranking from events where id=ev) <> false then
    raise exception using errcode='PT001', message='set_event_ranking(false) should set counts_for_ranking=false'; end if;
  perform set_event_ranking(ev, true);
  if (select count(*) from group_event_results where event_id=ev) <> 4 then
    raise exception using errcode='PT001', message='set_event_ranking(true) should re-create 4 rows'; end if;
  -- idempotent: calling true again keeps exactly 4 (UNIQUE(event_id,user_id) holds).
  perform set_event_ranking(ev, true);
  if (select count(*) from group_event_results where event_id=ev) <> 4 then
    raise exception using errcode='PT001', message='set_event_ranking(true) twice should stay 4 rows (no duplicates)'; end if;
  raise notice 'OK set_event_ranking toggles + re-creates idempotently (no duplicates)';
end $$;
reset role;

-- (3) Re-finish_event on an already-finished public event -> still exactly 4 rows (idempotent).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare ev uuid := current_setting('test.ev')::uuid;
begin
  perform finish_event(ev, 'again', null);
  if (select count(*) from group_event_results where event_id=ev) <> 4 then
    raise exception using errcode='PT001', message='re-finish should keep exactly 4 result rows'; end if;
  raise notice 'OK re-finish public event idempotent (4 rows)';
end $$;
reset role;

-- (4) PRIVATE group event finished -> NO group_event_results rows.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_event(jsonb_build_object(
  'group_id', :'gid'::text, 'is_private', true, 'event_type','mexicano', 'specification','classic',
  'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
  'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
  'organizer_role','organizing_only', 'name','Private Finish Event')) as priv_ev \gset
reset role;
select set_config('test.priv_ev', :'priv_ev', false);
set local role postgres;
do $$
declare ev uuid := current_setting('test.priv_ev')::uuid; pa uuid; pb uuid; r1 uuid; m1 uuid;
begin
  insert into event_participants (event_id, user_id, status, confirmed_at, joined_at)
    values (ev,'f6000002-0000-0000-0000-000000000002','confirmed',now(),now()) returning id into pa;
  insert into event_participants (event_id, user_id, status, confirmed_at, joined_at)
    values (ev,'f6000003-0000-0000-0000-000000000003','confirmed',now(),now()) returning id into pb;
  update events set status='in_progress' where id=ev;
  insert into event_rounds (event_id, round_number, status, generated_at) values (ev,1,'completed',now()) returning id into r1;
  insert into event_matches (event_id, round_id, court_number, match_number, side_a_score, side_b_score, status)
    values (ev,r1,1,1,32,20,'played') returning id into m1;
  insert into match_players (match_id, participant_id, side) values (m1,pa,'a'),(m1,pb,'b');
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare ev uuid := current_setting('test.priv_ev')::uuid;
begin
  perform finish_event(ev, null, null);
  if (select count(*) from group_event_results where event_id=ev) <> 0 then
    raise exception using errcode='PT001', message='private event finish should NOT write group_event_results'; end if;
  raise notice 'OK private event finish -> no group_event_results';
end $$;
reset role;

-- (5) STANDALONE event finished -> NO group_event_results rows.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_event(jsonb_build_object(
  'event_type','mexicano', 'specification','classic',
  'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
  'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
  'organizer_role','organizing_only', 'name','Standalone Finish Event')) as alone_ev \gset
reset role;
select set_config('test.alone_ev', :'alone_ev', false);
set local role postgres;
do $$
declare ev uuid := current_setting('test.alone_ev')::uuid; pa uuid; pb uuid; r1 uuid; m1 uuid;
begin
  insert into event_participants (event_id, user_id, status, confirmed_at, joined_at)
    values (ev,'f6000002-0000-0000-0000-000000000002','confirmed',now(),now()) returning id into pa;
  insert into event_participants (event_id, user_id, status, confirmed_at, joined_at)
    values (ev,'f6000003-0000-0000-0000-000000000003','confirmed',now(),now()) returning id into pb;
  update events set status='in_progress' where id=ev;
  insert into event_rounds (event_id, round_number, status, generated_at) values (ev,1,'completed',now()) returning id into r1;
  insert into event_matches (event_id, round_id, court_number, match_number, side_a_score, side_b_score, status)
    values (ev,r1,1,1,32,20,'played') returning id into m1;
  insert into match_players (match_id, participant_id, side) values (m1,pa,'a'),(m1,pb,'b');
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare ev uuid := current_setting('test.alone_ev')::uuid;
begin
  perform finish_event(ev, null, null);
  if (select count(*) from group_event_results where event_id=ev) <> 0 then
    raise exception using errcode='PT001', message='standalone event finish should NOT write group_event_results'; end if;
  raise notice 'OK standalone event finish -> no group_event_results';
end $$;
reset role;
rollback;
