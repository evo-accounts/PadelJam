-- 5H-B: post_event_result + event_result_summary RPCs + result_event_id FK.
-- Verifies organizer-gated result posting (completed + has-community guards,
-- already_posted/no_community/not_completed/forbidden errors) and the
-- community-member gate on event_result_summary.
-- 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','res-u1@x.com'),
  ('f0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','res-u2@x.com'),
  ('f0000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','res-m1@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f0000001-0000-0000-0000-000000000001','res-u1@x.com','+351900500001','ResOrganizer'),
  ('f0000002-0000-0000-0000-000000000002','res-u2@x.com','+351900500002','ResNonMember'),
  ('f0000003-0000-0000-0000-000000000003','res-m1@x.com','+351900500003','ResMember') on conflict do nothing;

do $$
declare
  u1  uuid := 'f0000001-0000-0000-0000-000000000001';
  u2  uuid := 'f0000002-0000-0000-0000-000000000002';
  m1  uuid := 'f0000003-0000-0000-0000-000000000003';
  cid uuid;
  g   uuid;
  ev  uuid;
  ev2 uuid;
  ev3 uuid;
  p   uuid;
  n   integer;
begin
  -- ---- As U1: create the community (owner); M1 joins as a member ----
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"f0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('ResC','club','PT','public');

  -- ---- Seed events + participants + membership under role postgres (fixture, bypasses RLS) ----
  perform set_config('role','postgres',true);
  -- Reuse the community's auto-created general group.
  select id into g from groups where community_id = cid order by created_at limit 1;

  -- M1 is a community member; U2 is NOT.
  insert into community_members (community_id, user_id, role)
    values (cid, m1, 'member') on conflict do nothing;

  -- Completed community event (group_id = g).
  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    g, u1, 'americano', 'classic', 'points',
    1, now() - interval '1 day', 90, 'organizing_and_playing', 'ResEv', 'completed', false
  ) returning id into ev;
  insert into event_participants (event_id, user_id, status) values (ev, m1, 'confirmed');

  -- Standalone completed event (no community).
  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    null, u1, 'americano', 'classic', 'points',
    1, now() - interval '1 day', 90, 'organizing_and_playing', 'ResEv2', 'completed', true
  ) returning id into ev2;

  -- Scheduled community event.
  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    g, u1, 'americano', 'classic', 'points',
    1, now() + interval '1 day', 90, 'organizing_and_playing', 'ResEv3', 'scheduled', false
  ) returning id into ev3;

  -- ============================================================
  -- As U1 (organizer): assertions 1-4
  -- ============================================================
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"f0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);

  -- (1) post_event_result(ev) -> returns a uuid; community_posts row exists.
  p := post_event_result(ev);
  if p is null then
    raise exception using errcode='PT001', message='post_event_result(ev) should return a uuid';
  end if;
  perform set_config('role','postgres',true);
  select count(*) into n from community_posts
    where id = p and kind = 'result' and result_event_id = ev and community_id = cid;
  if n <> 1 then
    raise exception using errcode='PT001', message='expected 1 result post (kind/result_event_id/community_id), got '||n;
  end if;
  perform set_config('role','authenticated',true);
  raise notice 'OK post: returns uuid + inserts kind=result post';

  -- (2) post_event_result(ev) again -> already_posted.
  begin
    perform post_event_result(ev);
    raise exception using errcode='PT001', message='second post should raise already_posted';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('already_posted' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for second post: '||sqlerrm;
      end if;
  end;
  raise notice 'OK already_posted';

  -- (3) post_event_result(ev2) standalone -> no_community.
  begin
    perform post_event_result(ev2);
    raise exception using errcode='PT001', message='standalone event should raise no_community';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('no_community' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for standalone event: '||sqlerrm;
      end if;
  end;
  raise notice 'OK no_community';

  -- (4) post_event_result(ev3) scheduled -> not_completed.
  begin
    perform post_event_result(ev3);
    raise exception using errcode='PT001', message='scheduled event should raise not_completed';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('not_completed' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for scheduled event: '||sqlerrm;
      end if;
  end;
  raise notice 'OK not_completed';

  -- (5) As U2 (non-organizer) -> forbidden.
  perform set_config('request.jwt.claims','{"sub":"f0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  begin
    perform post_event_result(ev);
    raise exception using errcode='PT001', message='non-organizer should not be able to post a result';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('forbidden' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for non-organizer post: '||sqlerrm;
      end if;
  end;
  raise notice 'OK forbidden';

  -- (6) event_result_summary(ev): member M1 sees >=0 rows; non-member U2 sees 0 rows.
  perform set_config('request.jwt.claims','{"sub":"f0000003-0000-0000-0000-000000000003","role":"authenticated"}',true);
  select count(*) into n from event_result_summary(ev);
  if n < 0 then
    raise exception using errcode='PT001', message='member summary should return >= 0 rows, got '||n;
  end if;
  raise notice 'OK summary: member reads % rows (>= 0)', n;

  perform set_config('request.jwt.claims','{"sub":"f0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  select count(*) into n from event_result_summary(ev);
  if n <> 0 then
    raise exception using errcode='PT001', message='non-member summary should return 0 rows, got '||n;
  end if;
  raise notice 'OK summary: non-member reads 0 rows';

  -- (7)
  raise notice 'OK event_result_post';
end $$;
rollback;
