-- The two-role model as a standing invariant, not just a one-time migration step (0098).
--
-- The migration's own `do $$` self-check runs once, at apply time. This file re-asserts the same
-- things against whatever state the database is in when the suite runs, so a later migration or a
-- seed that reintroduces an owner row fails here rather than in production.
--
-- The four last-admin paths and the Basic upgrade live in community_manage.sql; the permission
-- toggles live in community_permission_toggles.sql.
-- 'PT001' = "expected behaviour did not hold".
begin;

do $$
declare v_n int; v_txt text;
begin
  -- 1. The backfill left nothing behind, anywhere.
  select count(*) into v_n from community_members where role = 'owner';
  if v_n <> 0 then
    raise exception using errcode='PT001', message=format('%s community_members rows still hold role=owner', v_n);
  end if;
  raise notice 'OK no owner rows remain';

  -- 2. The value cannot come back through the front door.
  select pg_get_constraintdef(oid) into v_txt from pg_constraint
   where conrelid = 'public.community_members'::regclass and conname = 'community_members_role_check';
  if v_txt is null or v_txt like '%owner%' then
    raise exception using errcode='PT001',
      message=format('community_members_role_check still admits owner (%s)', coalesce(v_txt,'missing'));
  end if;
  raise notice 'OK the role CHECK admits only admin/member';

  -- 3. …nor the back door: there is no transfer_ownership to promote anyone into it.
  if exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='transfer_ownership') then
    raise exception using errcode='PT001', message='transfer_ownership still exists';
  end if;
  raise notice 'OK transfer_ownership is gone';
end $$;

-- 4. The cap allows exactly one admin on Starter, whose co_organizers limit is 0. This is the
--    reading that makes the backfill and create_community_with_personal_tenant possible at all:
--    a co-organizer is an admin BEYOND THE FIRST.
insert into auth.users (id, instance_id, aud, role, email) values
  ('cb000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rl1@x.com'),
  ('cb000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rl2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('cb000001-0000-0000-0000-000000000001','rl1@x.com','+351900500001','Rl1'),
  ('cb000002-0000-0000-0000-000000000002','rl2@x.com','+351900500002','Rl2') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"cb000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('RolesC','friends','PT','public') as cid \gset
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cb000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ declare cid uuid := (select id from communities where name='RolesC' order by created_at desc limit 1);
begin perform join_community(cid, false); end $$;
reset role;

do $$
declare cid uuid := (select id from communities where name='RolesC' order by created_at desc limit 1);
begin
  if community_plan(cid) <> 'starter' then
    raise exception using errcode='PT001', message='fixture drift: RolesC should be on starter'; end if;
  if coalesce((select value from plan_limits where plan_id='starter' and limit_key='co_organizers'), -1) <> 0 then
    raise exception using errcode='PT001', message='fixture drift: starter co_organizers should be 0'; end if;
  if (select count(*) from community_members where community_id=cid and role='admin') <> 1 then
    raise exception using errcode='PT001', message='a starter community must hold its one creator-admin'; end if;
  raise notice 'OK starter holds one admin despite co_organizers = 0';

  begin
    update community_members set role='admin' where community_id=cid and user_id='cb000002-0000-0000-0000-000000000002';
    raise exception using errcode='PT001', message='the SECOND admin on starter should hit the cap';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%co_organizers%' then
      raise exception using errcode='PT001', message='wrong code for the cap: ' || sqlerrm; end if;
    raise notice 'OK the second admin on starter is still capped (%)', sqlerrm;
  end;
end $$;
rollback;
