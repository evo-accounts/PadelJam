-- create_group: returns a uuid; creator is sole initial group_member (GR-05); season_number=1 row
-- exists (GR-20); is_general=false. Non-admin -> forbidden. Blank name -> name_required (both P0001).
-- 'PT001' = "expected behaviour did not hold" sentinel (distinct from the P0001 the RPC raises).
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e1100001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gcown@x.com'),
  ('e1100002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gcmem@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e1100001-0000-0000-0000-000000000001','gcown@x.com','+351901100001','GcOwner'),
  ('e1100002-0000-0000-0000-000000000002','gcmem@x.com','+351901100002','GcMember') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1100001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('GCreateC','club','PT','public') as cid \gset
reset role;
-- basic plan so the general group + a new group both fit (starter=1).
insert into community_subscriptions (community_id, plan_id)
  select id, 'basic' from communities where name='GCreateC' order by created_at desc limit 1
  on conflict (community_id) do update set plan_id='basic';
-- plain member joins (non-admin for the forbidden case).
insert into community_members (community_id, user_id, role)
  values (:'cid','e1100002-0000-0000-0000-000000000002','member') on conflict do nothing;

-- Owner (community admin) creates a group: returns uuid, sole creator member, season 1, not general.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1100001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_group(:'cid','MadeGroup','desc',false) as gid \gset
do $$
declare gid uuid := (select id from groups where name='MadeGroup' order by created_at desc limit 1);
begin
  if gid is null then raise exception using errcode='PT001', message='create_group returned null'; end if;
  if (select count(*) from group_members where group_id=gid) <> 1
     or not exists (select 1 from group_members where group_id=gid and user_id=auth.uid()) then
    raise exception using errcode='PT001', message='GR-05: creator must be the sole initial group member'; end if;
  if not exists (select 1 from group_seasons where group_id=gid and season_number=1) then
    raise exception using errcode='PT001', message='GR-20: season_number=1 row must exist'; end if;
  if (select is_general from groups where id=gid) <> false then
    raise exception using errcode='PT001', message='created group must have is_general=false'; end if;
  raise notice 'OK create_group: uuid + sole creator member (GR-05) + season 1 (GR-20) + is_general=false';
end $$;
reset role;

-- Non-admin (plain member) calling create_group must raise forbidden (P0001).
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1100002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare cid uuid := (select id from communities where name='GCreateC' order by created_at desc limit 1);
begin
  begin
    perform create_group(cid,'MemberGroup',null,false);
    raise exception using errcode='PT001', message='non-admin create_group should raise forbidden';
  exception when sqlstate 'P0001' then raise notice 'OK non-admin create_group blocked (%)', sqlerrm;
  end;
end $$;
reset role;

-- Blank name must raise name_required (P0001).
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1100001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare cid uuid := (select id from communities where name='GCreateC' order by created_at desc limit 1);
begin
  begin
    perform create_group(cid,'   ',null,false);
    raise exception using errcode='PT001', message='blank name create_group should raise name_required';
  exception when sqlstate 'P0001' then raise notice 'OK blank name blocked (%)', sqlerrm;
  end;
end $$;
reset role;
rollback;
