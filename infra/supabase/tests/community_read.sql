-- Widened communities READ must show the community ROW to any authenticated user (join modal),
-- but must NOT leak the roster/posts of a private/request community to non-members.
-- 'PT001' = "expected behaviour did not hold" sentinel (distinct from RLS's silent row-filtering).
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('d0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rown@x.com'),
  ('d0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rdmem@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('d0000001-0000-0000-0000-000000000001','rown@x.com','+351900100001','RdOwner'),
  ('d0000002-0000-0000-0000-000000000002','rdmem@x.com','+351900100002','RdNonMember') on conflict do nothing;

do $$
declare cid_priv uuid; cid_pub uuid;
begin
  -- The owned-community cap was lifted in 0098 (UX-COMM-09), so one user could hold both. The
  -- fixture keeps a single private community: what is under test is the non-member's view of it.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"d0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid_priv := create_community_with_personal_tenant('PrivC','club','PT','private');

  -- non-member's perspective
  perform set_config('request.jwt.claims','{"sub":"d0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  if (select count(*) from communities where id = cid_priv) <> 1 then
    raise exception using errcode='PT001', message='non-member cannot read the community row (widened read broken)';
  end if;
  if (select count(*) from community_members where community_id = cid_priv) <> 0 then
    raise exception using errcode='PT001', message='private roster leaked to non-member';
  end if;
  if (select count(*) from community_posts where community_id = cid_priv) <> 0 then
    raise exception using errcode='PT001', message='private posts leaked to non-member';
  end if;
  raise notice 'OK private: row visible to non-member; roster + posts hidden';
end $$;

-- public community under a different owner: roster visible to any authenticated user
do $$
declare cid_pub uuid;
begin
  perform set_config('request.jwt.claims','{"sub":"d0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  cid_pub := create_community_with_personal_tenant('PubC','club','PT','public');
  perform set_config('request.jwt.claims','{"sub":"d0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  if (select count(*) from community_members where community_id = cid_pub) < 1 then
    raise exception using errcode='PT001', message='public community roster should be visible to any authenticated user';
  end if;
  raise notice 'OK public: roster visible to non-member (discovery)';
end $$;
rollback;
