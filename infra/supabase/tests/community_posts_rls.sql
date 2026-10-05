-- Posts: create gated by can_create_post (admin OR member+create_posts). Since 0100 a PUBLIC community's
-- posts are readable by any signed-in non-member, who still cannot post (the write did not widen).
-- The request_to_join/private fence and anon are covered by public-community-read.test.mjs.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','powner@x.com'),
  ('e0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pmember@x.com'),
  ('e0000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pout@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e0000001-0000-0000-0000-000000000001','powner@x.com','+351900200001','POwner'),
  ('e0000002-0000-0000-0000-000000000002','pmember@x.com','+351900200002','PMember'),
  ('e0000003-0000-0000-0000-000000000003','pout@x.com','+351900200003','POutsider') on conflict do nothing;

do $$
declare cid uuid;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('PostsC','club','PT','public');
  -- member joins
  perform set_config('request.jwt.claims','{"sub":"e0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  perform join_community(cid, false);

  -- owner (admin) can post
  perform set_config('request.jwt.claims','{"sub":"e0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  insert into community_posts (community_id, author_id, body) values (cid, 'e0000001-0000-0000-0000-000000000001', 'hello');
  raise notice 'OK admin can post';

  -- member can post (create_posts default true)
  perform set_config('request.jwt.claims','{"sub":"e0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  insert into community_posts (community_id, author_id, body) values (cid, 'e0000002-0000-0000-0000-000000000002', 'hi from member');
  raise notice 'OK member can post when create_posts=true';

  -- turn create_posts OFF (as admin) then member post must fail
  perform set_config('request.jwt.claims','{"sub":"e0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  update community_permissions set create_posts=false where community_id=cid;
  perform set_config('request.jwt.claims','{"sub":"e0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  begin
    insert into community_posts (community_id, author_id, body) values (cid, 'e0000002-0000-0000-0000-000000000002', 'blocked');
    raise exception using errcode='PT001', message='member post should be blocked when create_posts=false';
  exception when sqlstate '42501' then raise notice 'OK member post blocked by RLS when create_posts=false';
  end;

  -- outsider reads a public community's posts (0100) but cannot post in it
  perform set_config('request.jwt.claims','{"sub":"e0000003-0000-0000-0000-000000000003","role":"authenticated"}',true);
  if (select count(*) from community_posts where community_id=cid) <> 2 then
    raise exception using errcode='PT001', message='outsider should read a public community''s posts (0100)';
  end if;
  raise notice 'OK non-member reads a public community''s posts';
  begin
    insert into community_posts (community_id, author_id, body) values (cid, 'e0000003-0000-0000-0000-000000000003', 'outsider');
    raise exception using errcode='PT001', message='non-member post should be blocked';
  exception when sqlstate '42501' then raise notice 'OK non-member post blocked by RLS';
  end;
end $$;
rollback;
