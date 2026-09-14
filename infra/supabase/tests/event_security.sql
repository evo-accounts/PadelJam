-- Security hardening regression tests (migration 0051).
--   C1  A confirmed participant of a players_submit_results event can NO LONGER
--       directly UPDATE event_matches (the authenticated insert/update/delete grant
--       was revoked) -> permission denied.
--   H1  request_partner by an outsider (not invitee/participant) of a team event
--       -> forbidden (P0001).
--   M3  A direct call to the internal helper _persist_round_matches(...) as
--       authenticated -> permission denied (execute revoked).
--   M2  duplicate_event of a GROUP event by the event organizer who is NOT a
--       community admin -> forbidden (P0001).
-- 'PT001' = "expected behaviour did not hold" sentinel; the RPCs raise P0001;
-- revoked direct DML/execute raise 42501 (insufficient_privilege).
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f6000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','esown@x.com'),
  ('f6000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','esm2@x.com'),
  ('f6000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','esm3@x.com'),
  ('f6000004-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','esm4@x.com'),
  ('f6000005-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','esm5@x.com'),
  ('f6000099-0000-0000-0000-000000000099','00000000-0000-0000-0000-000000000000','authenticated','authenticated','esout@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f6000001-0000-0000-0000-000000000001','esown@x.com','+351906000001','EsOwner'),
  ('f6000002-0000-0000-0000-000000000002','esm2@x.com','+351906000002','EsMember2'),
  ('f6000003-0000-0000-0000-000000000003','esm3@x.com','+351906000003','EsMember3'),
  ('f6000004-0000-0000-0000-000000000004','esm4@x.com','+351906000004','EsMember4'),
  ('f6000005-0000-0000-0000-000000000005','esm5@x.com','+351906000005','EsMember5'),
  ('f6000099-0000-0000-0000-000000000099','esout@x.com','+351906000099','EsOutsider') on conflict do nothing;

-- Community + group; eng owner = m1 (community admin/owner). m2..m5 are members. m99 is an outsider
-- (no community/group membership at all).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('ESecC','club','PT','public') as cid \gset
reset role;
insert into community_subscriptions (community_id, plan_id)
  select id, 'community_pro' from communities where name='ESecC' order by created_at desc limit 1
  on conflict (community_id) do update set plan_id='community_pro';
insert into community_members (community_id, user_id, role) values
  (:'cid','f6000002-0000-0000-0000-000000000002','member'),
  (:'cid','f6000003-0000-0000-0000-000000000003','member'),
  (:'cid','f6000004-0000-0000-0000-000000000004','member'),
  (:'cid','f6000005-0000-0000-0000-000000000005','member') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_group(:'cid','ESecGroup',null,false) as gid \gset
reset role;
insert into group_members (group_id, user_id) values
  (:'gid','f6000002-0000-0000-0000-000000000002'),
  (:'gid','f6000003-0000-0000-0000-000000000003'),
  (:'gid','f6000004-0000-0000-0000-000000000004'),
  (:'gid','f6000005-0000-0000-0000-000000000005') on conflict do nothing;
select set_config('test.gid', :'gid', false);

-- =========================================================================
-- C1: confirmed participant cannot directly UPDATE event_matches.
-- Mexicano players_submit_results event, 4 confirmed (m2..m5); start it; then m2 (a
-- confirmed match player) attempts a raw UPDATE of the match score -> permission denied.
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_event(jsonb_build_object(
  'group_id', :'gid'::text, 'event_type','mexicano', 'specification','classic',
  'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
  'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
  'players_submit_results', true,
  'organizer_role','organizing_only', 'name','Sec Mexicano')) as mex \gset
reset role;
select set_config('test.mex', :'mex', false);
set local role postgres;
insert into event_participants (event_id, user_id, status, confirmed_at, joined_at)
  select current_setting('test.mex')::uuid,
         ('f600000'||g::text||'-0000-0000-0000-00000000000'||g::text)::uuid, 'confirmed', now(), now()
  from generate_series(2,5) g;
reset role;
-- start the event via the RPC (organizer).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000001-0000-0000-0000-000000000001","role":"authenticated"}';
select start_event(current_setting('test.mex')::uuid);
reset role;
-- capture the round-1 match id (as postgres).
set local role postgres;
select m.id from event_matches m join event_rounds r on r.id=m.round_id
  where r.event_id=current_setting('test.mex')::uuid and r.round_number=1 limit 1 \gset secmatch_
reset role;
select set_config('test.sec_match', :'secmatch_id', false);

-- m2 (a confirmed participant on the match) attempts a raw UPDATE -> must be denied.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare m uuid := current_setting('test.sec_match')::uuid;
begin
  begin
    update event_matches set side_a_score=99, side_b_score=0, submitted_by=auth.uid() where id=m;
    raise exception using errcode='PT001',
      message='C1: direct UPDATE event_matches by a participant should be denied (grant revoked)';
  exception
    when insufficient_privilege then raise notice 'OK C1: direct event_matches UPDATE denied (%)', sqlerrm;
    when sqlstate 'PT001' then raise;
  end;
end $$;
reset role;

-- =========================================================================
-- H1: request_partner by an outsider (not invitee/participant) of a team event -> forbidden.
-- Build a PRIVATE team event (organizer-only invites; m99 is NOT invited).
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_event(jsonb_build_object(
  'event_type','americano', 'specification','team',
  'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
  'is_private', true,
  'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
  'organizer_role','organizing_only', 'name','Sec Private Team',
  'invitees', jsonb_build_array(
    jsonb_build_object('invitee_id','f6000002-0000-0000-0000-000000000002')))) as team_ev \gset
reset role;
select set_config('test.team_ev', :'team_ev', false);

-- m99 (outsider: not invitee, not participant) tries request_partner -> forbidden (P0001).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000099-0000-0000-0000-000000000099","role":"authenticated"}';
do $$
declare team_ev uuid := current_setting('test.team_ev')::uuid;
begin
  begin
    perform request_partner(team_ev, array['f6000002-0000-0000-0000-000000000002'::uuid]);
    raise exception using errcode='PT001',
      message='H1: request_partner by an outsider should raise forbidden';
  exception
    when sqlstate 'P0001' then raise notice 'OK H1: outsider request_partner blocked (%)', sqlerrm;
  end;
  -- and the outsider must NOT have been inserted as interested.
  if exists (select 1 from event_participants where event_id=team_ev and user_id=auth.uid()) then
    raise exception using errcode='PT001',
      message='H1: outsider should not be inserted into event_participants'; end if;
  raise notice 'OK H1: outsider not added as participant';
end $$;
reset role;

-- Positive control: an actual invitee (m2) CAN still request a partner (only eligible targets land).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare team_ev uuid := current_setting('test.team_ev')::uuid;
begin
  -- m99 is NOT eligible -> silently skipped; m2 is the only invitee, so no row is created
  -- but the call must SUCCEED and set the caller interested.
  perform request_partner(team_ev, array['f6000099-0000-0000-0000-000000000099'::uuid]);
  if (select status from event_participants where event_id=team_ev and user_id=auth.uid()) <> 'interested' then
    raise exception using errcode='PT001',
      message='H1: eligible caller request_partner should set caller interested'; end if;
  if exists (select 1 from partner_requests where event_id=team_ev and target_id='f6000099-0000-0000-0000-000000000099') then
    raise exception using errcode='PT001',
      message='H1: an ineligible target should be skipped (no partner_requests row)'; end if;
  raise notice 'OK H1: eligible caller succeeds; ineligible target skipped';
end $$;
reset role;

-- =========================================================================
-- M3: direct call to internal helper _persist_round_matches as authenticated -> denied.
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare mex uuid := current_setting('test.mex')::uuid; v_round uuid;
begin
  select id into v_round from event_rounds where event_id=mex and round_number=1;
  begin
    perform _persist_round_matches(mex, v_round, '[]'::jsonb);
    raise exception using errcode='PT001',
      message='M3: direct _persist_round_matches call should be denied (execute revoked)';
  exception
    when insufficient_privilege then raise notice 'OK M3: _persist_round_matches execute denied (%)', sqlerrm;
    when sqlstate 'PT001' then raise;
  end;
end $$;
reset role;

-- =========================================================================
-- M2: duplicate_event of a GROUP event by the organizer who is NOT a community admin.
-- Create a group event as the admin (m1), then reassign organizer to m2 (member, NOT admin)
-- and demote nothing else; m2 (now organizer, non-admin) duplicate_event -> forbidden.
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_event(jsonb_build_object(
  'group_id', :'gid'::text, 'event_type','americano', 'specification','classic',
  'scoring_mode','points', 'scoring_value', 32, 'num_courts', 1,
  'starts_at', (now()+interval '7 days'), 'duration_minutes', 90,
  'organizer_role','organizing_only', 'name','Sec Group Event')) as grp_ev \gset
reset role;
select set_config('test.grp_ev', :'grp_ev', false);
-- reassign organizer to m2 (a plain community/group member, NOT an admin).
set local role postgres;
update events set organizer_id='f6000002-0000-0000-0000-000000000002' where id=current_setting('test.grp_ev')::uuid;
reset role;

-- M2 re-applies create_event's gate to duplicate_event, and since migration 0098 that gate is
-- may_create_event — the create_events toggle, not the role. So the check is that duplicate_event
-- tracks it: with the toggle OFF, the non-admin organizer m2 is refused.
set local role postgres;
update community_permissions set create_events = false
  where community_id = (select community_id from groups where id = current_setting('test.gid')::uuid);
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare grp_ev uuid := current_setting('test.grp_ev')::uuid;
begin
  begin
    perform duplicate_event(grp_ev, '{}'::jsonb);
    raise exception using errcode='PT001',
      message='M2: a non-admin organizer duplicating a group event should be refused with create_events off';
  exception
    when sqlstate 'P0001' then raise notice 'OK M2: non-admin duplicate_event blocked (%)', sqlerrm;
  end;
end $$;
reset role;
-- With the toggle back ON the same organizer may duplicate: the gate moved from role to permission.
set local role postgres;
update community_permissions set create_events = true
  where community_id = (select community_id from groups where id = current_setting('test.gid')::uuid);
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare grp_ev uuid := current_setting('test.grp_ev')::uuid; v_new uuid;
begin
  v_new := duplicate_event(grp_ev, '{}'::jsonb);
  if v_new is null then
    raise exception using errcode='PT001', message='M2: duplicate should succeed with create_events on'; end if;
  raise notice 'OK M2: the organizer may duplicate once create_events is on';
end $$;
reset role;

-- Positive control: the community admin (m1) CAN duplicate the same group event.
set local role postgres;
update events set organizer_id='f6000001-0000-0000-0000-000000000001' where id=current_setting('test.grp_ev')::uuid;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare grp_ev uuid := current_setting('test.grp_ev')::uuid; v_new uuid;
begin
  v_new := duplicate_event(grp_ev, '{}'::jsonb);
  if v_new is null or not exists (select 1 from events where id=v_new and status='scheduled') then
    raise exception using errcode='PT001',
      message='M2: admin organizer should still be able to duplicate a group event'; end if;
  raise notice 'OK M2: admin organizer can still duplicate the group event';
end $$;
reset role;

rollback;
