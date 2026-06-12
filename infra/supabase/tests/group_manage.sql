-- leave_group: sole community owner -> sole_owner_must_transfer (GR-24); sole admin group-member ->
-- sole_admin_must_add_another, then succeeds after a 2nd admin joins; plain member leaves OK.
-- start_new_season (admin) rotates seasons; non-admin -> forbidden. archive/unarchive toggle archived_at.
-- 'PT001' = "expected behaviour did not hold" sentinel; the RPCs raise P0001.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e1300001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gmown@x.com'),
  ('e1300002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gmadmin@x.com'),
  ('e1300003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gmadmin2@x.com'),
  ('e1300004-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gmmem@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e1300001-0000-0000-0000-000000000001','gmown@x.com','+351901300001','GmOwner'),
  ('e1300002-0000-0000-0000-000000000002','gmadmin@x.com','+351901300002','GmAdmin'),
  ('e1300003-0000-0000-0000-000000000003','gmadmin2@x.com','+351901300003','GmAdmin2'),
  ('e1300004-0000-0000-0000-000000000004','gmmem@x.com','+351901300004','GmMember') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1300001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('GManageC','club','PT','public') as cid \gset
reset role;
-- pro plan: unlimited groups + co-organizers for the admin scenarios below.
insert into community_subscriptions (community_id, plan_id)
  select id, 'community_pro' from communities where name='GManageC' order by created_at desc limit 1
  on conflict (community_id) do update set plan_id='community_pro';

-- Seed community members: owner is already a member (owner role). Add admins + a plain member.
insert into community_members (community_id, user_id, role) values
  (:'cid','e1300002-0000-0000-0000-000000000002','admin'),
  (:'cid','e1300003-0000-0000-0000-000000000003','member'),
  (:'cid','e1300004-0000-0000-0000-000000000004','member') on conflict do nothing;

-- Group G1 used for the leave scenarios. Created by owner (owner becomes a group member).
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1300001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_group(:'cid','LeaveGroup',null,false) as g1 \gset
reset role;
select set_config('test.g1', :'g1', false);

-- (1) Sole community owner who is a group member -> sole_owner_must_transfer (GR-24).
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1300001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare g1 uuid := current_setting('test.g1')::uuid;
begin
  begin
    perform leave_group(g1);
    raise exception using errcode='PT001', message='sole owner leave_group should raise sole_owner_must_transfer';
  exception when sqlstate 'P0001' then raise notice 'OK GR-24 sole owner blocked (%)', sqlerrm;
  end;
end $$;
reset role;

-- (2) Sole admin group-member. Build group G2 whose only owner/admin member is the admin (not the owner).
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1300002-0000-0000-0000-000000000002","role":"authenticated"}';
select create_group(:'cid','AdminLeaveGroup',null,false) as g2 \gset
reset role;
select set_config('test.g2', :'g2', false);
-- G2 currently has only the admin (gmadmin) as a group member (its creator). The owner is NOT in G2.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1300002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare g2 uuid := current_setting('test.g2')::uuid;
begin
  begin
    perform leave_group(g2);
    raise exception using errcode='PT001', message='sole admin leave_group should raise sole_admin_must_add_another';
  exception when sqlstate 'P0001' then raise notice 'OK sole admin blocked (%)', sqlerrm;
  end;
end $$;
reset role;
-- Promote gmadmin2 to community admin and add to G2, then the first admin can leave.
update community_members set role='admin' where community_id=:'cid' and user_id='e1300003-0000-0000-0000-000000000003';
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1300003-0000-0000-0000-000000000003","role":"authenticated"}';
do $$ declare g2 uuid := current_setting('test.g2')::uuid; begin
  insert into group_members (group_id, user_id) values (g2, auth.uid()) on conflict do nothing;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1300002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare g2 uuid := current_setting('test.g2')::uuid;
begin
  perform leave_group(g2);
  if exists (select 1 from group_members where group_id=g2 and user_id=auth.uid()) then
    raise exception using errcode='PT001', message='admin leave should succeed once a 2nd admin is present'; end if;
  raise notice 'OK sole admin leave succeeds after a 2nd admin is added';
end $$;
reset role;

-- (3) Plain member leaves a public group -> succeeds, group_members row removed.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1300004-0000-0000-0000-000000000004","role":"authenticated"}';
do $$ declare g1 uuid := current_setting('test.g1')::uuid; begin
  insert into group_members (group_id, user_id) values (g1, auth.uid()) on conflict do nothing;
  perform leave_group(g1);
  if exists (select 1 from group_members where group_id=g1 and user_id=auth.uid()) then
    raise exception using errcode='PT001', message='plain member leave should remove group_members row'; end if;
  raise notice 'OK plain member leaves public group';
end $$;
reset role;

-- (4) start_new_season by an admin rotates seasons; exactly one open season afterwards.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1300001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare g1 uuid := current_setting('test.g1')::uuid; v_next int;
begin
  v_next := start_new_season(g1);
  if v_next <> 2 then raise exception using errcode='PT001', message='start_new_season should return season 2'; end if;
  if exists (select 1 from group_seasons where group_id=g1 and season_number=1 and ended_at is null) then
    raise exception using errcode='PT001', message='previous season should be closed (ended_at set)'; end if;
  if not exists (select 1 from group_seasons where group_id=g1 and season_number=2 and ended_at is null) then
    raise exception using errcode='PT001', message='new open season_number=2 should exist'; end if;
  if (select count(*) from group_seasons where group_id=g1 and ended_at is null) <> 1 then
    raise exception using errcode='PT001', message='exactly one open season expected'; end if;
  raise notice 'OK start_new_season: closed S1, opened S2, exactly one open';
end $$;
reset role;

-- Non-admin start_new_season -> forbidden (P0001). gmmem is a plain member.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1300004-0000-0000-0000-000000000004","role":"authenticated"}';
do $$
declare g1 uuid := current_setting('test.g1')::uuid;
begin
  begin
    perform start_new_season(g1);
    raise exception using errcode='PT001', message='non-admin start_new_season should be forbidden';
  exception when sqlstate 'P0001' then raise notice 'OK non-admin start_new_season blocked (%)', sqlerrm;
  end;
end $$;
reset role;

-- (5) archive_group by admin sets archived_at; unarchive_group clears it. Non-admin archive -> forbidden.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1300001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare g1 uuid := current_setting('test.g1')::uuid;
begin
  perform archive_group(g1);
  if (select archived_at from groups where id=g1) is null then
    raise exception using errcode='PT001', message='archive_group should set archived_at'; end if;
  perform unarchive_group(g1);
  if (select archived_at from groups where id=g1) is not null then
    raise exception using errcode='PT001', message='unarchive_group should clear archived_at'; end if;
  raise notice 'OK archive/unarchive toggle archived_at';
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1300004-0000-0000-0000-000000000004","role":"authenticated"}';
do $$
declare g1 uuid := current_setting('test.g1')::uuid;
begin
  begin
    perform archive_group(g1);
    raise exception using errcode='PT001', message='non-admin archive_group should be forbidden';
  exception when sqlstate 'P0001' then raise notice 'OK non-admin archive blocked (%)', sqlerrm;
  end;
end $$;
reset role;
rollback;
