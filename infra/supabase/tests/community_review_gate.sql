-- CM-40: review gate — a member may write/edit a community review only after
-- participating (confirmed roster) in >= 3 COMPLETED events whose group belongs to
-- the community. 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rev-u1@x.com'),
  ('e0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rev-u2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e0000001-0000-0000-0000-000000000001','rev-u1@x.com','+351900200001','RevReviewer'),
  ('e0000002-0000-0000-0000-000000000002','rev-u2@x.com','+351900200002','RevNonMember') on conflict do nothing;

do $$
declare
  cid uuid;
  gid uuid;
  u1  uuid := 'e0000001-0000-0000-0000-000000000001';
  n   integer;
begin
  -- U1 creates the community (becomes owner + member).
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('RevC','club','PT','public');

  -- Reuse the default group created by create_community_with_personal_tenant
  -- (groups_per_community cap is 1 on the seeded plan, so we cannot add another).
  select id into gid from groups where community_id = cid limit 1;
  if gid is null then
    raise exception using errcode='PT001', message='expected a default group for the community';
  end if;

  -- Seed events + participants as a privileged role (fixture setup, not under test).
  perform set_config('role','postgres',true);
  -- 2 completed events, each with U1 confirmed.
  for i in 1..2 loop
    declare ev uuid;
    begin
      insert into events (
        group_id, organizer_id, event_type, specification, scoring_mode,
        num_courts, starts_at, duration_minutes, organizer_role, name, status
      ) values (
        gid, u1, 'americano', 'classic', 'points',
        1, now() - interval '1 day', 90, 'organizing_and_playing', 'Ev'||i, 'completed'
      ) returning id into ev;
      insert into event_participants (event_id, user_id, status) values (ev, u1, 'confirmed');
    end;
  end loop;
  perform set_config('role','authenticated',true);

  -- ---- Step 4: only 2 completed events => NOT eligible ----
  if can_review_community(cid) then
    raise exception using errcode='PT001', message='can_review_community should be false with only 2 events';
  end if;
  raise notice 'OK gate: 2 events => can_review_community = false';

  begin
    perform upsert_community_review(cid, 5::smallint, 'x');
    raise exception using errcode='PT001', message='expected upsert to raise (only 2 events) but it succeeded';
  exception
    when sqlstate 'PT001' then raise;  -- re-raise our own sentinel
    when others then
      if position('review_requires_participation' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error: '||sqlerrm;
      end if;
  end;
  raise notice 'OK gate: upsert blocked with review_requires_participation';

  -- ---- Step 5: add a 3rd completed event + confirmed participant => eligible ----
  perform set_config('role','postgres',true);
  declare ev3 uuid;
  begin
    insert into events (
      group_id, organizer_id, event_type, specification, scoring_mode,
      num_courts, starts_at, duration_minutes, organizer_role, name, status
    ) values (
      gid, u1, 'americano', 'classic', 'points',
      1, now() - interval '1 day', 90, 'organizing_and_playing', 'Ev3', 'completed'
    ) returning id into ev3;
    insert into event_participants (event_id, user_id, status) values (ev3, u1, 'confirmed');
  end;
  perform set_config('role','authenticated',true);

  if not can_review_community(cid) then
    raise exception using errcode='PT001', message='can_review_community should be true with 3 events';
  end if;
  raise notice 'OK gate: 3 events => can_review_community = true';

  -- write a review
  perform upsert_community_review(cid, 5::smallint, 'great');
  select count(*) into n from community_reviews where community_id = cid and user_id = u1 and rating = 5;
  if n <> 1 then
    raise exception using errcode='PT001', message='expected exactly 1 review with rating 5, got '||n;
  end if;

  -- edit the review (upsert again) — still exactly one row, rating now 4
  perform upsert_community_review(cid, 4::smallint, 'edited');
  select count(*) into n from community_reviews where community_id = cid and user_id = u1;
  if n <> 1 then
    raise exception using errcode='PT001', message='upsert created a second row instead of editing, got '||n;
  end if;
  select count(*) into n from community_reviews where community_id = cid and user_id = u1 and rating = 4;
  if n <> 1 then
    raise exception using errcode='PT001', message='edit did not update rating to 4';
  end if;
  raise notice 'OK upsert: review created then edited (single row, rating 4)';

  -- ---- Step 6: U2 is a member of nothing => not_a_member ----
  perform set_config('request.jwt.claims','{"sub":"e0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  begin
    perform upsert_community_review(cid, 5::smallint, 'x');
    raise exception using errcode='PT001', message='expected upsert to raise not_a_member but it succeeded';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('not_a_member' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for non-member: '||sqlerrm;
      end if;
  end;
  raise notice 'OK non-member: upsert blocked with not_a_member';

  raise notice 'OK community_review_gate';
end $$;
rollback;
