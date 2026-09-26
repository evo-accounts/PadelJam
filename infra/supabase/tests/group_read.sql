-- Groups RLS read: public groups visible to community members, private groups only to their members.
-- group_members + group_seasons of a private group hidden from non-members, visible to admins/members.
-- 'PT001' = "expected behaviour did not hold" sentinel (distinct from RLS's silent row-filtering).
-- The community is request_to_join on purpose: since 0100 a PUBLIC community's open groups and
-- non-private group events are readable by any signed-in user, which would bypass the group-member
-- branch tested here. That public branch is covered by public-community-read.test.mjs.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e1000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','grown@x.com'),
  ('e1000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','grmem@x.com'),
  ('e1000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','groutsider@x.com'),
  ('e1000004-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','grprivmem@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e1000001-0000-0000-0000-000000000001','grown@x.com','+351901000001','GrOwner'),
  ('e1000002-0000-0000-0000-000000000002','grmem@x.com','+351901000002','GrMember'),
  ('e1000003-0000-0000-0000-000000000003','groutsider@x.com','+351901000003','GrOutsider'),
  ('e1000004-0000-0000-0000-000000000004','grprivmem@x.com','+351901000004','GrPrivMember') on conflict do nothing;

-- Owner creates a request_to_join community (basic plan so >1 group fits), one public + one private group.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('GReadC','club','PT','request_to_join') as cid \gset
reset role;
insert into community_subscriptions (community_id, plan_id)
  select id, 'basic' from communities where name='GReadC' order by created_at desc limit 1
  on conflict (community_id) do update set plan_id='basic';

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_group(:'cid','PubGroup',null,false) as pub_gid \gset
select create_group(:'cid','PrivGroup',null,true) as priv_gid \gset
reset role;
-- Stash the ids as session settings so do-blocks can read them regardless of RLS/role.
select set_config('test.pub_gid', :'pub_gid', false);
select set_config('test.priv_gid', :'priv_gid', false);
select set_config('test.cid', :'cid', false);

-- A community member (joined) sees the public group but NOT the private group.
insert into community_members (community_id, user_id, role)
  values (:'cid','e1000002-0000-0000-0000-000000000002','member') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare pub_gid uuid := current_setting('test.pub_gid')::uuid;
        priv_gid uuid := current_setting('test.priv_gid')::uuid;
begin
  if (select count(*) from groups where id = pub_gid) <> 1 then
    raise exception using errcode='PT001', message='community member should see the public group'; end if;
  if (select count(*) from groups where id = priv_gid) <> 0 then
    raise exception using errcode='PT001', message='private group leaked to a non-member community member'; end if;
  -- private group's members + seasons hidden from this non-member
  if (select count(*) from group_members where group_id = priv_gid) <> 0 then
    raise exception using errcode='PT001', message='private group_members leaked to non-member'; end if;
  if (select count(*) from group_seasons where group_id = priv_gid) <> 0 then
    raise exception using errcode='PT001', message='private group_seasons leaked to non-member'; end if;
  raise notice 'OK community member: public group visible; private group + members + seasons hidden';
end $$;
reset role;

-- A non-community-member (outsider) of a non-public community sees neither group.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1000003-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
declare pub_gid uuid := current_setting('test.pub_gid')::uuid;
        priv_gid uuid := current_setting('test.priv_gid')::uuid;
begin
  if (select count(*) from groups where id in (pub_gid, priv_gid)) <> 0 then
    raise exception using errcode='PT001', message='outsider should see no groups of this community'; end if;
  raise notice 'OK outsider: sees neither public nor private group';
end $$;
reset role;

-- A member OF the private group DOES see it (+ its members + seasons).
insert into community_members (community_id, user_id, role)
  values (:'cid','e1000004-0000-0000-0000-000000000004','member') on conflict do nothing;
insert into group_members (group_id, user_id)
  values (:'priv_gid','e1000004-0000-0000-0000-000000000004') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1000004-0000-0000-0000-000000000004","role":"authenticated"}';
do $$
declare priv_gid uuid := current_setting('test.priv_gid')::uuid;
begin
  if (select count(*) from groups where id = priv_gid) <> 1 then
    raise exception using errcode='PT001', message='private group member should see the private group'; end if;
  if (select count(*) from group_members where group_id = priv_gid and user_id = auth.uid()) <> 1 then
    raise exception using errcode='PT001', message='private group member should see their own membership row'; end if;
  if (select count(*) from group_seasons where group_id = priv_gid) < 1 then
    raise exception using errcode='PT001', message='private group member should see group_seasons'; end if;
  raise notice 'OK private group member: group + members + seasons visible';
end $$;
reset role;

-- A community admin (the owner) sees the private group's members + seasons too.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare priv_gid uuid := current_setting('test.priv_gid')::uuid;
begin
  if (select count(*) from group_members where group_id = priv_gid) < 1 then
    raise exception using errcode='PT001', message='community admin should see private group_members'; end if;
  raise notice 'OK community admin: private group_members visible';
end $$;
reset role;
rollback;
