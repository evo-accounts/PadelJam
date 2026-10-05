-- Match engine: Mexicano (1 court, 4 confirmed) start_event -> round 1 active, 1 match, 4 match_players;
-- re-start -> event_not_scheduled; under-capacity -> setup_incomplete; submit_score first-submitter lock
-- (players_submit_results) -> 2nd non-org = score_locked, organizer override OK; generate_next_round
-- before scoring -> round_not_scored, after scoring -> round 2 with standings-ordered 1+4/2+3 arrangement.
-- Up&Down (2 courts, 8 confirmed): round 1 = 2 matches/8 players; after scoring both, generate_next_round
-- moves court-2 winners UP to court 1 and court-1 losers DOWN to court 2.
-- 'PT001' = "expected behaviour did not hold" sentinel; the RPCs raise P0001.
begin;
insert into auth.users (id, instance_id, aud, role, email)
select ('f500'||lpad(g::text,4,'0')||'-0000-0000-0000-000000000001')::uuid,
       '00000000-0000-0000-0000-000000000000','authenticated','authenticated', 'eng'||g||'@x.com'
from generate_series(1,16) g on conflict do nothing;
insert into profiles (id, email, phone, full_name)
select ('f500'||lpad(g::text,4,'0')||'-0000-0000-0000-000000000001')::uuid,
       'eng'||g||'@x.com', '+3519050000'||lpad(g::text,2,'0'), 'Eng'||g
from generate_series(1,16) g on conflict do nothing;

-- Organizer = eng1. Build community + group; seed eng2..eng16 as community + group members.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('EEngC','club','PT','public') as cid \gset
reset role;
insert into community_subscriptions (community_id, plan_id)
  select id, 'community_pro' from communities where name='EEngC' order by created_at desc limit 1
  on conflict (community_id) do update set plan_id='community_pro';
insert into community_members (community_id, user_id, role)
  select :'cid', ('f500'||lpad(g::text,4,'0')||'-0000-0000-0000-000000000001')::uuid, 'member'
  from generate_series(2,16) g on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_group(:'cid','EEngGroup',null,false) as gid \gset
reset role;
insert into group_members (group_id, user_id)
  select :'gid', ('f500'||lpad(g::text,4,'0')||'-0000-0000-0000-000000000001')::uuid
  from generate_series(2,16) g on conflict do nothing;
select set_config('test.gid', :'gid', false);

-- ============================== MEXICANO ==============================
-- players_submit_results=true so a participant can submit. Organizer NOT playing (organizing_only).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_event(jsonb_build_object(
  'group_id', :'gid'::text, 'event_type','mexicano', 'specification','classic',
  'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
  'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
  'players_submit_results', true,
  'organizer_role','organizing_only', 'name','Mexicano Event')) as mex \gset
reset role;
select set_config('test.mex', :'mex', false);

-- (A) Under-capacity start (3 confirmed) -> setup_incomplete. Seed only 3 confirmed (eng2,3,4).
set local role postgres;
insert into event_participants (event_id, user_id, status, confirmed_at, joined_at)
  select current_setting('test.mex')::uuid,
         ('f500'||lpad(g::text,4,'0')||'-0000-0000-0000-000000000001')::uuid, 'confirmed', now(), now()
  from generate_series(2,4) g;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare mex uuid := current_setting('test.mex')::uuid;
begin
  begin
    perform start_event(mex);
    raise exception using errcode='PT001', message='start_event under capacity should raise setup_incomplete';
  exception when sqlstate 'P0001' then raise notice 'OK under-capacity start blocked (%)', sqlerrm;
  end;
end $$;
reset role;
-- Add the 4th confirmed (eng5) so capacity (4) is met.
set local role postgres;
insert into event_participants (event_id, user_id, status, confirmed_at, joined_at)
  values (current_setting('test.mex')::uuid,'f5000005-0000-0000-0000-000000000001','confirmed', now(), now());
reset role;

-- (B) start_event -> round 1 active, 1 match, 4 match_players.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare mex uuid := current_setting('test.mex')::uuid; v_round uuid; v_match uuid;
begin
  perform start_event(mex);
  if (select status from events where id=mex) <> 'in_progress' then
    raise exception using errcode='PT001', message='start_event should set status in_progress'; end if;
  select id into v_round from event_rounds where event_id=mex and round_number=1;
  if v_round is null or (select status from event_rounds where id=v_round) <> 'active' then
    raise exception using errcode='PT001', message='round 1 should exist and be active'; end if;
  if (select count(*) from event_matches where round_id=v_round) <> 1 then
    raise exception using errcode='PT001', message='round 1 should have exactly 1 match'; end if;
  select id into v_match from event_matches where round_id=v_round;
  if (select count(*) from match_players where match_id=v_match) <> 4 then
    raise exception using errcode='PT001', message='round 1 match should have 4 match_players'; end if;
  raise notice 'OK Mexicano start_event -> round 1 active, 1 match, 4 match_players';
end $$;
reset role;

-- (C) Re-start -> event_not_scheduled.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare mex uuid := current_setting('test.mex')::uuid;
begin
  begin
    perform start_event(mex);
    raise exception using errcode='PT001', message='re-start should raise event_not_scheduled';
  exception when sqlstate 'P0001' then raise notice 'OK re-start blocked (%)', sqlerrm;
  end;
end $$;
reset role;

-- (D) generate_next_round BEFORE scoring -> round_not_scored.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare mex uuid := current_setting('test.mex')::uuid;
begin
  begin
    perform generate_next_round(mex);
    raise exception using errcode='PT001', message='generate_next_round before scoring should raise round_not_scored';
  exception when sqlstate 'P0001' then raise notice 'OK generate_next_round before scoring blocked (%)', sqlerrm;
  end;
end $$;
reset role;

-- (E) submit_score: a participant on the match submits (players_submit_results) -> match played.
-- Find a player user on the round-1 match and a distinct second player user for the lock test.
set local role postgres;
select mp.participant_id, p.user_id from match_players mp
  join event_participants p on p.id=mp.participant_id
  join event_matches m on m.id=mp.match_id
  join event_rounds r on r.id=m.round_id
  where r.event_id=current_setting('test.mex')::uuid and r.round_number=1 and mp.side='a'
  order by p.joined_at limit 1 \gset player_a_
select m.id from event_matches m join event_rounds r on r.id=m.round_id
  where r.event_id=current_setting('test.mex')::uuid and r.round_number=1 \gset
select p.user_id from match_players mp
  join event_participants p on p.id=mp.participant_id
  where mp.match_id=(select m2.id from event_matches m2 join event_rounds r2 on r2.id=m2.round_id
                     where r2.event_id=current_setting('test.mex')::uuid and r2.round_number=1)
    and mp.side='b' limit 1 \gset player_b_
reset role;
select set_config('test.mex_match', :'id', false);
select set_config('test.mex_pa_user', :'player_a_user_id', false);
select set_config('test.mex_pb_user', :'player_b_user_id', false);

-- player on side a submits 32 - 20 -> match played.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.mex_pa_user'), 'role','authenticated')::text, true);
do $$
declare m uuid := current_setting('test.mex_match')::uuid;
begin
  perform submit_score(m, 32, 20, false);
  if (select status from event_matches where id=m) <> 'played' then
    raise exception using errcode='PT001', message='participant submit_score should set match played'; end if;
  if (select submitted_by from event_matches where id=m) is null then
    raise exception using errcode='PT001', message='submitted_by should be set after first submit'; end if;
  raise notice 'OK participant submit_score -> match played';
end $$;
reset role;

-- a second NON-organizer player attempts -> score_locked.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.mex_pb_user'), 'role','authenticated')::text, true);
do $$
declare m uuid := current_setting('test.mex_match')::uuid;
begin
  begin
    perform submit_score(m, 10, 10, false);
    raise exception using errcode='PT001', message='2nd non-organizer submit should raise score_locked';
  exception when sqlstate 'P0001' then raise notice 'OK 2nd non-org submit blocked (%)', sqlerrm;
  end;
end $$;
reset role;

-- organizer can still override (no lock for organizer). Final score 30 - 22.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare m uuid := current_setting('test.mex_match')::uuid;
begin
  perform submit_score(m, 30, 22, false);
  if (select side_a_score from event_matches where id=m) <> 30
     or (select side_b_score from event_matches where id=m) <> 22 then
    raise exception using errcode='PT001', message='organizer override should update the score'; end if;
  raise notice 'OK organizer override updates locked score';
end $$;
reset role;

-- (F) standings orders by points desc; generate_next_round -> round 2 with 1+4 vs 2+3 (standings order).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare mex uuid := current_setting('test.mex')::uuid; v_round2 uuid; v_match2 uuid;
        v_ordered uuid[]; v_a uuid[]; v_b uuid[];
        prev_pts bigint := 2147483648;
        r record;
begin
  -- standings ordered points desc (monotonic non-increasing).
  for r in select points from standings(mex) order by rank loop
    if r.points > prev_pts then
      raise exception using errcode='PT001', message='standings must be ordered by points desc'; end if;
    prev_pts := r.points;
  end loop;

  -- expected order used by _build_fours_arrangement: rank asc, joined_at asc, then the participant id
  -- (0126: the engine breaks a full tie by id — every row here joins in one transaction).
  select array_agg(s.entity_id order by s.rank asc, p.joined_at asc, p.id asc) into v_ordered
    from standings(mex) s join event_participants p on p.id=s.entity_id;

  perform generate_next_round(mex);
  select id into v_round2 from event_rounds where event_id=mex and round_number=2;
  if v_round2 is null or (select status from event_rounds where id=v_round2) <> 'active' then
    raise exception using errcode='PT001', message='round 2 should exist and be active'; end if;
  if (select count(*) from event_matches where round_id=v_round2) <> 1 then
    raise exception using errcode='PT001', message='round 2 should have 1 match'; end if;
  select id into v_match2 from event_matches where round_id=v_round2;
  if (select count(*) from match_players where match_id=v_match2) <> 4 then
    raise exception using errcode='PT001', message='round 2 match should have 4 players'; end if;

  -- _build_fours: side_a={ordered[1],ordered[4]}, side_b={ordered[2],ordered[3]}.
  select array_agg(participant_id) into v_a from match_players where match_id=v_match2 and side='a';
  select array_agg(participant_id) into v_b from match_players where match_id=v_match2 and side='b';
  if not (v_ordered[1] = any(v_a) and v_ordered[4] = any(v_a)) then
    raise exception using errcode='PT001', message='round 2 side_a should be standings ranks 1 + 4'; end if;
  if not (v_ordered[2] = any(v_b) and v_ordered[3] = any(v_b)) then
    raise exception using errcode='PT001', message='round 2 side_b should be standings ranks 2 + 3'; end if;
  raise notice 'OK Mexicano generate_next_round -> round 2 active, 1+4 vs 2+3 standings arrangement';
end $$;
reset role;

-- ============================== UP & DOWN ==============================
-- 2 courts, 8 confirmed (eng2..eng9). Organizer NOT playing.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_event(jsonb_build_object(
  'group_id', :'gid'::text, 'event_type','up_and_down', 'specification','classic',
  'scoring_mode','points', 'scoring_value', 32, 'num_courts', 2,
  'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
  'organizer_role','organizing_only', 'name','UpDown Event')) as ud \gset
reset role;
select set_config('test.ud', :'ud', false);
set local role postgres;
insert into event_participants (event_id, user_id, status, confirmed_at, joined_at)
  select current_setting('test.ud')::uuid,
         ('f500'||lpad(g::text,4,'0')||'-0000-0000-0000-000000000001')::uuid, 'confirmed', now(), now()
  from generate_series(2,9) g;
reset role;

-- start_event -> round 1 with 2 courts / 2 matches / 8 match_players.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare ud uuid := current_setting('test.ud')::uuid; v_round uuid;
begin
  perform start_event(ud);
  select id into v_round from event_rounds where event_id=ud and round_number=1;
  if (select count(*) from event_matches where round_id=v_round) <> 2 then
    raise exception using errcode='PT001', message='Up&Down round 1 should have 2 matches (2 courts)'; end if;
  if (select count(*) from match_players mp join event_matches m on m.id=mp.match_id where m.round_id=v_round) <> 8 then
    raise exception using errcode='PT001', message='Up&Down round 1 should have 8 match_players'; end if;
  raise notice 'OK Up&Down start_event -> round 1, 2 courts / 2 matches / 8 players';
end $$;
reset role;

-- Score both courts. Court 1: side a wins. Court 2: side a wins. Capture winners/losers per court.
set local role postgres;
-- court 1 winners (side a) / losers (side b); court 2 winners (side a) / losers (side b).
select array_agg(mp.participant_id) from match_players mp
  join event_matches m on m.id=mp.match_id join event_rounds r on r.id=m.round_id
  where r.event_id=current_setting('test.ud')::uuid and r.round_number=1 and m.court_number=1 and mp.side='a' \gset c1a_
select array_agg(mp.participant_id) from match_players mp
  join event_matches m on m.id=mp.match_id join event_rounds r on r.id=m.round_id
  where r.event_id=current_setting('test.ud')::uuid and r.round_number=1 and m.court_number=1 and mp.side='b' \gset c1b_
select array_agg(mp.participant_id) from match_players mp
  join event_matches m on m.id=mp.match_id join event_rounds r on r.id=m.round_id
  where r.event_id=current_setting('test.ud')::uuid and r.round_number=1 and m.court_number=2 and mp.side='a' \gset c2a_
select array_agg(mp.participant_id) from match_players mp
  join event_matches m on m.id=mp.match_id join event_rounds r on r.id=m.round_id
  where r.event_id=current_setting('test.ud')::uuid and r.round_number=1 and m.court_number=2 and mp.side='b' \gset c2b_
reset role;
select set_config('test.c1_winners', :'c1a_array_agg', false);  -- court1 side a wins
select set_config('test.c1_losers',  :'c1b_array_agg', false);  -- court1 side b loses
select set_config('test.c2_winners', :'c2a_array_agg', false);  -- court2 side a wins
select set_config('test.c2_losers',  :'c2b_array_agg', false);  -- court2 side b loses

set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare ud uuid := current_setting('test.ud')::uuid; m record;
begin
  for m in select em.id, em.court_number from event_matches em
           join event_rounds r on r.id=em.round_id
           where r.event_id=ud and r.round_number=1 loop
    -- side a wins on both courts (32-20).
    perform submit_score(m.id, 32, 20, false);
  end loop;
  raise notice 'OK Up&Down round 1 both courts scored (side a wins each)';
end $$;
reset role;

-- generate_next_round -> round 2: 2 matches. Court-2 winners move UP to court 1; court-1 losers move
-- DOWN to court 2. (Court-1 winners stay on court 1; court-2 losers stay on court 2.)
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare ud uuid := current_setting('test.ud')::uuid; v_round2 uuid;
        c1_winners uuid[] := current_setting('test.c1_winners')::uuid[];
        c1_losers  uuid[] := current_setting('test.c1_losers')::uuid[];
        c2_winners uuid[] := current_setting('test.c2_winners')::uuid[];
        c2_losers  uuid[] := current_setting('test.c2_losers')::uuid[];
        r2_court1 uuid[]; r2_court2 uuid[]; pid uuid;
begin
  perform generate_next_round(ud);
  select id into v_round2 from event_rounds where event_id=ud and round_number=2;
  if v_round2 is null then raise exception using errcode='PT001', message='Up&Down round 2 should exist'; end if;
  if (select count(*) from event_matches where round_id=v_round2) <> 2 then
    raise exception using errcode='PT001', message='Up&Down round 2 should have 2 matches'; end if;

  select array_agg(mp.participant_id) into r2_court1 from match_players mp
    join event_matches m on m.id=mp.match_id where m.round_id=v_round2 and m.court_number=1;
  select array_agg(mp.participant_id) into r2_court2 from match_players mp
    join event_matches m on m.id=mp.match_id where m.round_id=v_round2 and m.court_number=2;

  -- Court-2 WINNERS must appear on court 1 in round 2 (moved up K=2 -> K-1=1).
  foreach pid in array c2_winners loop
    if not (pid = any(r2_court1)) then
      raise exception using errcode='PT001', message='Up&Down: court-2 winner should move UP to court 1'; end if;
  end loop;
  -- Court-1 LOSERS must appear on court 2 in round 2 (moved down K=1 -> K+1=2).
  foreach pid in array c1_losers loop
    if not (pid = any(r2_court2)) then
      raise exception using errcode='PT001', message='Up&Down: court-1 loser should move DOWN to court 2'; end if;
  end loop;
  -- Court-1 winners stay on court 1; court-2 losers stay on court 2.
  foreach pid in array c1_winners loop
    if not (pid = any(r2_court1)) then
      raise exception using errcode='PT001', message='Up&Down: court-1 winner should stay on court 1'; end if;
  end loop;
  foreach pid in array c2_losers loop
    if not (pid = any(r2_court2)) then
      raise exception using errcode='PT001', message='Up&Down: court-2 loser should stay on court 2'; end if;
  end loop;
  raise notice 'OK Up&Down generate_next_round -> court-2 winners UP to court 1, court-1 losers DOWN to court 2';
end $$;
reset role;
rollback;
