-- Reviews: since 0137 a review is written and edited only through upsert_community_review. A member
-- ends with exactly one review (the second call updates it, no duplicate); a direct UPDATE or upsert
-- is refused for want of the privilege; a non-member is denied. Since 0069 the INSERT policy also
-- requires can_review_community (>= 3 completed events participated); eligibility is seeded here as
-- fixture — the gate itself is covered by community_review_gate.sql.
begin;
insert into auth.users (id, instance_id, aud, role) values
  ('40000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('40000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('40000001-0000-0000-0000-000000000001','rvown@x.com','+351900400001','RvOwner'),
  ('40000002-0000-0000-0000-000000000002','rvout@x.com','+351900400002','RvOutsider') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"40000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('ReviewC','club','PT','public') as cid \gset
reset role;

-- Seed review eligibility for the owner: 3 completed events in the community's default
-- group with a confirmed roster spot (privileged fixture setup, not under test).
do $$
declare cid uuid := (select id from communities where name='ReviewC' order by created_at desc limit 1);
        gid uuid; ev uuid;
begin
  select id into gid from groups where community_id = cid limit 1;
  for i in 1..3 loop
    insert into events (group_id, organizer_id, event_type, specification, scoring_mode,
      num_courts, starts_at, duration_minutes, organizer_role, name, status)
    values (gid, '40000001-0000-0000-0000-000000000001', 'americano', 'classic', 'points',
      1, now() - interval '1 day', 90, 'organizing_and_playing', 'RvEv'||i, 'completed')
    returning id into ev;
    insert into event_participants (event_id, user_id, status)
      values (ev, '40000001-0000-0000-0000-000000000001', 'confirmed');
  end loop;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"40000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ declare cid uuid := (select id from communities where name='ReviewC' order by created_at desc limit 1);
begin
  perform upsert_community_review(cid, 4::smallint, 'good');
  perform upsert_community_review(cid, 5::smallint, 'better');
  -- Editing goes through the RPC alone: the API roles have no UPDATE on community_reviews (0137),
  -- so neither a direct UPDATE nor the direct upsert this test used to write with gets through.
  begin
    update community_reviews set rating = 1 where community_id = cid and user_id = auth.uid();
    raise exception using errcode='PT001', message='direct review UPDATE should be refused (0137)';
  exception when sqlstate '42501' then raise notice 'OK direct review UPDATE refused (0137)';
  end;
  begin
    insert into community_reviews (community_id, user_id, rating, body) values (cid, auth.uid(), 1, 'direct')
      on conflict (community_id, user_id) do update set rating=excluded.rating, body=excluded.body;
    raise exception using errcode='PT001', message='direct review upsert should be refused (0137)';
  exception when sqlstate '42501' then raise notice 'OK direct review upsert refused (0137)';
  end;
  if (select count(*) from community_reviews where community_id=cid and user_id=auth.uid()) <> 1 then
    raise exception using errcode='PT001', message='member should have exactly one review (upsert)'; end if;
  if (select rating from community_reviews where community_id=cid and user_id=auth.uid()) <> 5 then
    raise exception using errcode='PT001', message='second upsert_community_review should update the rating'; end if;
  raise notice 'OK member: single review via upsert_community_review, updated to 5';
end $$;
reset role;

-- non-member cannot insert a review
set local role authenticated;
set local request.jwt.claims = '{"sub":"40000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ declare cid uuid := (select id from communities where name='ReviewC' order by created_at desc limit 1);
begin
  begin
    insert into community_reviews (community_id, user_id, rating) values (cid, auth.uid(), 3);
    raise exception using errcode='PT001', message='non-member review should be blocked by RLS';
  exception when sqlstate '42501' then raise notice 'OK non-member review blocked by RLS';
  end;
end $$;
reset role;
rollback;
