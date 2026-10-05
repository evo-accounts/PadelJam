-- roster RPCs: leave_event removes the participant row (no waiting-list auto-promote). leave past the 12h
-- cutoff -> leave_deadline_passed. organizer_mark_confirmed refuses a waiting-list participant (0122, D2).
-- add_manual_participant on a mixed event without gender -> gender_required; with gender -> succeeds.
-- Partner flow: request_partner sets requester 'interested' + inserts partner_requests;
-- accept_partner_request confirms the pair + creates an event_teams row + auto-declines other pendings.
-- 'PT001' = "expected behaviour did not hold" sentinel; the RPCs raise P0001.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f4000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','erown@x.com'),
  ('f4000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','erm2@x.com'),
  ('f4000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','erm3@x.com'),
  ('f4000004-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','erm4@x.com'),
  ('f4000005-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','erm5@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f4000001-0000-0000-0000-000000000001','erown@x.com','+351904000001','ErOwner'),
  ('f4000002-0000-0000-0000-000000000002','erm2@x.com','+351904000002','ErMember2'),
  ('f4000003-0000-0000-0000-000000000003','erm3@x.com','+351904000003','ErMember3'),
  ('f4000004-0000-0000-0000-000000000004','erm4@x.com','+351904000004','ErMember4'),
  ('f4000005-0000-0000-0000-000000000005','erm5@x.com','+351904000005','ErMember5') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f4000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('ERosterC','club','PT','public') as cid \gset
reset role;
insert into community_subscriptions (community_id, plan_id)
  select id, 'basic' from communities where name='ERosterC' order by created_at desc limit 1
  on conflict (community_id) do update set plan_id='basic';
insert into community_members (community_id, user_id, role) values
  (:'cid','f4000002-0000-0000-0000-000000000002','member'),
  (:'cid','f4000003-0000-0000-0000-000000000003','member'),
  (:'cid','f4000004-0000-0000-0000-000000000004','member'),
  (:'cid','f4000005-0000-0000-0000-000000000005','member') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f4000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_group(:'cid','ERosterGroup',null,false) as gid \gset
reset role;
insert into group_members (group_id, user_id) values
  (:'gid','f4000002-0000-0000-0000-000000000002'),
  (:'gid','f4000003-0000-0000-0000-000000000003'),
  (:'gid','f4000004-0000-0000-0000-000000000004'),
  (:'gid','f4000005-0000-0000-0000-000000000005') on conflict do nothing;
select set_config('test.gid', :'gid', false);

-- Public americano num_courts=1 (capacity 4). Organizer playing.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f4000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_event(jsonb_build_object(
  'group_id', :'gid'::text, 'event_type','americano', 'specification','classic',
  'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
  'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
  'organizer_role','organizing_and_playing', 'name','Roster Event')) as ev \gset
reset role;
select set_config('test.ev', :'ev', false);
-- Seed (as postgres) a confirmed participant (m2) + a waiting-list participant (m3, pos 1).
set local role postgres;
insert into event_participants (event_id, user_id, status, confirmed_at, joined_at) values
  (:'ev','f4000002-0000-0000-0000-000000000002','confirmed', now(), now());
insert into event_participants (event_id, user_id, status, waiting_list_position, joined_at) values
  (:'ev','f4000003-0000-0000-0000-000000000003','waiting_list', 1, now());
reset role;

-- (1) leave_event by the confirmed participant (m2) removes the row; waiting-list NOT auto-promoted.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f4000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare ev uuid := current_setting('test.ev')::uuid;
begin
  perform leave_event(ev);
  if exists (select 1 from event_participants where event_id=ev and user_id=auth.uid()) then
    raise exception using errcode='PT001', message='leave_event should remove the participant row'; end if;
  if (select status from event_participants where event_id=ev and user_id='f4000003-0000-0000-0000-000000000003') <> 'waiting_list' then
    raise exception using errcode='PT001', message='waiting-list participant must NOT be auto-promoted on leave'; end if;
  raise notice 'OK leave_event removes participant; no waiting-list auto-promote';
end $$;
reset role;

-- (2) 0122 (D2): organizer_mark_confirmed refuses the waiting-list participant (m3) — the
-- first waiter to claim a freed spot takes it; the organizer cannot jump the queue.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f4000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare ev uuid := current_setting('test.ev')::uuid; v_pid uuid;
begin
  select id into v_pid from event_participants where event_id=ev and user_id='f4000003-0000-0000-0000-000000000003';
  begin
    perform organizer_mark_confirmed(v_pid);
    raise exception using errcode='PT001', message='organizer_mark_confirmed must refuse a waiting-list player';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('waitlist_not_confirmable' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error: '||sqlerrm; end if;
  end;
  if (select status from event_participants where id=v_pid) <> 'waiting_list' then
    raise exception using errcode='PT001', message='the waiter must stay on the waiting list'; end if;
  raise notice 'OK organizer_mark_confirmed refuses waiting-list (waitlist_not_confirmable)';
end $$;
reset role;

-- (3) leave_event past the 12h cutoff (starts_at = now()+6h) -> leave_deadline_passed.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f4000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_event(jsonb_build_object(
  'group_id', :'gid'::text, 'event_type','americano', 'specification','classic',
  'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
  'starts_at', (now()+interval '6 hours'), 'duration_minutes', 90,
  'organizer_role','organizing_and_playing', 'name','Soon Roster Event')) as soon_ev \gset
reset role;
select set_config('test.soon_ev', :'soon_ev', false);
-- organizer is a confirmed participant; their leave should hit the deadline.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f4000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare soon_ev uuid := current_setting('test.soon_ev')::uuid;
begin
  begin
    perform leave_event(soon_ev);
    raise exception using errcode='PT001', message='leave past 12h cutoff should raise leave_deadline_passed';
  exception when sqlstate 'P0001' then raise notice 'OK past-cutoff leave blocked (%)', sqlerrm;
  end;
end $$;
reset role;

-- (4) add_manual_participant on a MIXED event: no gender -> gender_required; with gender -> succeeds.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f4000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_event(jsonb_build_object(
  'group_id', :'gid'::text, 'event_type','americano', 'specification','mixed',
  'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
  'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
  'organizer_role','organizing_only', 'name','Mixed Event')) as mixed_ev \gset
reset role;
select set_config('test.mixed_ev', :'mixed_ev', false);

set local role authenticated;
set local request.jwt.claims = '{"sub":"f4000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare mixed_ev uuid := current_setting('test.mixed_ev')::uuid; v_pid uuid;
begin
  begin
    perform add_manual_participant(mixed_ev, 'Guest No Gender', null);
    raise exception using errcode='PT001', message='mixed add_manual_participant without gender should raise gender_required';
  exception when sqlstate 'P0001' then raise notice 'OK mixed manual participant without gender blocked (%)', sqlerrm;
  end;
  v_pid := add_manual_participant(mixed_ev, 'Guest Female', 'female');
  if not exists (select 1 from event_participants where id=v_pid
                 and guest_name='Guest Female' and guest_gender='female' and status='confirmed') then
    raise exception using errcode='PT001', message='manual participant with gender should be created confirmed with guest_name/gender'; end if;
  raise notice 'OK add_manual_participant with gender succeeds (guest_name + guest_gender set)';
end $$;
reset role;

-- (5) Partner flow on a TEAM event: request_partner -> requester 'interested' + partner_requests rows;
-- accept_partner_request -> pair confirmed + event_teams row + requester's OTHER pendings auto-declined.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f4000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_event(jsonb_build_object(
  'group_id', :'gid'::text, 'event_type','americano', 'specification','team',
  'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
  'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
  'organizer_role','organizing_only', 'name','Team Roster Event')) as team_ev \gset
reset role;
select set_config('test.team_ev', :'team_ev', false);

-- Requester (m2) requests TWO targets (m3 and m4).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f4000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare team_ev uuid := current_setting('test.team_ev')::uuid;
begin
  perform request_partner(team_ev, array['f4000003-0000-0000-0000-000000000003'::uuid,
                                         'f4000004-0000-0000-0000-000000000004'::uuid]);
  if (select status from event_participants where event_id=team_ev and user_id=auth.uid()) <> 'interested' then
    raise exception using errcode='PT001', message='request_partner should set requester to interested'; end if;
  if (select count(*) from partner_requests where event_id=team_ev and requester_id=auth.uid() and status='pending') <> 2 then
    raise exception using errcode='PT001', message='request_partner should insert two pending partner_requests'; end if;
  raise notice 'OK request_partner: requester interested + 2 pending partner_requests';
end $$;
reset role;

-- Target m3 accepts -> pair confirmed, event_teams row created, the OTHER request (to m4) auto-declined.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f4000003-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
declare team_ev uuid := current_setting('test.team_ev')::uuid; v_req uuid;
begin
  select id into v_req from partner_requests
    where event_id=team_ev and requester_id='f4000002-0000-0000-0000-000000000002'
      and target_id=auth.uid() and status='pending';
  perform accept_partner_request(v_req);
  if (select status from event_participants where event_id=team_ev and user_id='f4000002-0000-0000-0000-000000000002') <> 'confirmed'
     or (select status from event_participants where event_id=team_ev and user_id=auth.uid()) <> 'confirmed' then
    raise exception using errcode='PT001', message='accept_partner_request should confirm both players'; end if;
  if not exists (select 1 from event_teams t
                 join event_participants pa on pa.id=t.player_a_id
                 join event_participants pb on pb.id=t.player_b_id
                 where t.event_id=team_ev and t.is_confirmed
                   and (pa.user_id, pb.user_id) in
                       (('f4000002-0000-0000-0000-000000000002','f4000003-0000-0000-0000-000000000003'),
                        ('f4000003-0000-0000-0000-000000000003','f4000002-0000-0000-0000-000000000002'))) then
    raise exception using errcode='PT001', message='accept_partner_request should create a confirmed event_teams row for the pair'; end if;
  -- the requester's OTHER pending request (to m4) is auto-declined.
  if (select status from partner_requests where event_id=team_ev
        and requester_id='f4000002-0000-0000-0000-000000000002'
        and target_id='f4000004-0000-0000-0000-000000000004') <> 'declined' then
    raise exception using errcode='PT001', message='other pending request from the requester should be auto-declined'; end if;
  raise notice 'OK accept_partner_request: pair confirmed + event_teams row + other pending auto-declined';
end $$;
reset role;
rollback;
