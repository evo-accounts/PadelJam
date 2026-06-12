-- C1 regression (GR-17/GR-35): a community owner/admin who is NOT a member of a PRIVATE group must
-- not be able to edit that group (incl. flipping privacy) or remove its members via the direct-write
-- RLS paths. A member-admin (the owner/creator) still can. RLS silently filters disallowed writes to
-- 0 rows, so we assert row effects. 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e1500001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gpaown@x.com'),
  ('e1500002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gpaadmin@x.com'),
  ('e1500003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gpamem@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e1500001-0000-0000-0000-000000000001','gpaown@x.com','+351901500001','GpaOwner'),
  ('e1500002-0000-0000-0000-000000000002','gpaadmin@x.com','+351901500002','GpaAdmin'),
  ('e1500003-0000-0000-0000-000000000003','gpamem@x.com','+351901500003','GpaMember') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1500001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('GPrivAdminC','club','PT','public') as cid \gset
reset role;
insert into community_subscriptions (community_id, plan_id)
  select id, 'community_pro' from communities where name='GPrivAdminC' order by created_at desc limit 1
  on conflict (community_id) do update set plan_id='community_pro';

-- adminB is a community ADMIN but will NOT be a member of the private group. memberC is a plain
-- community member who WILL be a private-group member (the removal target).
insert into community_members (community_id, user_id, role) values
  (:'cid','e1500002-0000-0000-0000-000000000002','admin'),
  (:'cid','e1500003-0000-0000-0000-000000000003','member') on conflict do nothing;

-- Owner creates a PRIVATE group (owner becomes a group member via create_group).
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1500001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_group(:'cid','PrivAdminGroup',null,true) as gp \gset
reset role;
select set_config('test.gp', :'gp', false);

-- Owner (a group member + community admin = is_group_admin) adds memberC to the private group.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1500001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ declare gp uuid := current_setting('test.gp')::uuid; begin
  insert into group_members (group_id, user_id) values (gp,'e1500003-0000-0000-0000-000000000003') on conflict do nothing;
end $$;
reset role;

-- (1) Non-member community admin CANNOT update the private group (RLS filters to 0 rows).
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1500002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare gp uuid := current_setting('test.gp')::uuid;
begin
  update groups set name='Hacked', is_private=false where id=gp;
  if exists (select 1 from groups where id=gp and (name='Hacked' or is_private=false)) then
    raise exception using errcode='PT001', message='non-member admin must not edit a private group';
  end if;
  raise notice 'OK GR-17: non-member admin blocked from editing private group';
end $$;
reset role;

-- (2) Non-member community admin CANNOT remove a private group's member.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1500002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare gp uuid := current_setting('test.gp')::uuid;
begin
  delete from group_members where group_id=gp and user_id='e1500003-0000-0000-0000-000000000003';
  if not exists (select 1 from group_members where group_id=gp and user_id='e1500003-0000-0000-0000-000000000003') then
    raise exception using errcode='PT001', message='non-member admin must not remove a private group member';
  end if;
  raise notice 'OK GR-35: non-member admin blocked from removing private group member';
end $$;
reset role;

-- (3) Positive control: the owner (member-admin) CAN edit the private group and remove a member.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1500001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare gp uuid := current_setting('test.gp')::uuid;
begin
  update groups set name='Renamed' where id=gp;
  if not exists (select 1 from groups where id=gp and name='Renamed') then
    raise exception using errcode='PT001', message='member-admin should be able to edit the group'; end if;
  delete from group_members where group_id=gp and user_id='e1500003-0000-0000-0000-000000000003';
  if exists (select 1 from group_members where group_id=gp and user_id='e1500003-0000-0000-0000-000000000003') then
    raise exception using errcode='PT001', message='member-admin should be able to remove a member'; end if;
  raise notice 'OK member-admin can edit + remove';
end $$;
reset role;
rollback;
