-- Manage, under the two-role model (migration 0098). This file used to be built entirely on
-- transfer_ownership, which no longer exists.
--
-- What it proves now:
--   * the creator lands as an ADMIN; Starter admits a second admin (co_organizers 3 since 0156);
--   * on Basic (co_organizers 1, the "beyond the first" reading) a second admin fits and a third is refused;
--   * archive still cascades to groups;
--   * the last-admin guard refuses all four departures, and the promotion is the way out.
begin;
insert into auth.users (id, instance_id, aud, role) values
  ('b0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('b0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('b0000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('b0000001-0000-0000-0000-000000000001','mown@x.com','+351900300001','MOwner'),
  ('b0000002-0000-0000-0000-000000000002','mmem@x.com','+351900300002','MMember'),
  ('b0000003-0000-0000-0000-000000000003','mmem3@x.com','+351900300003','MMember3') on conflict do nothing;

-- creator makes a community; a second user joins.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('ManageC','club','PT','public') as cid \gset
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ declare cid uuid := (select id from communities where name='ManageC' order by created_at desc limit 1);
begin perform join_community(cid, false); end $$;
reset role;
insert into community_members (community_id, user_id, role)
  select id, 'b0000003-0000-0000-0000-000000000003', 'member' from communities where name='ManageC' order by created_at desc limit 1;

-- STARTER, post-0156: co_organizers is 3, so a second admin is admitted. Demote it again so the
-- rest of the file keeps its single-admin shape.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare cid uuid := (select id from communities where name='ManageC' order by created_at desc limit 1);
begin
  if (select role from community_members where community_id=cid and user_id='b0000001-0000-0000-0000-000000000001') <> 'admin' then
    raise exception using errcode='PT001', message='creator should be an admin, not an owner';
  end if;
  if (select count(*) from community_members where community_id=cid and role='admin') <> 1 then
    raise exception using errcode='PT001', message='starter should start with exactly the one admin';
  end if;
  update community_members set role='admin' where community_id=cid and user_id='b0000002-0000-0000-0000-000000000002';
  raise notice 'OK starter: a 2nd admin is allowed';
  update community_members set role='member' where community_id=cid and user_id='b0000002-0000-0000-0000-000000000002';
end $$;

-- Upgrade to Basic as postgres (community_subscriptions is service-role/seed-write-only, no client policy).
reset role;
update community_subscriptions set plan_id='basic'
  where community_id=(select id from communities where name='ManageC' order by created_at desc limit 1);
insert into community_subscriptions (community_id, plan_id)
  select id, 'basic' from communities where name='ManageC' order by created_at desc limit 1
  on conflict (community_id) do update set plan_id='basic';

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare cid uuid := (select id from communities where name='ManageC' order by created_at desc limit 1); n int;
begin
  -- Basic's cap: a 2nd admin fits, a 3rd is refused ("beyond the first" reading, limit 1).
  update community_members set role='admin' where community_id=cid and user_id='b0000002-0000-0000-0000-000000000002';
  begin
    update community_members set role='admin' where community_id=cid and user_id='b0000003-0000-0000-0000-000000000003';
    raise exception using errcode='PT001', message='a THIRD admin on basic should hit the co_organizers cap';
  exception when sqlstate 'P0001' then raise notice 'OK basic: 2 admins allowed, 3rd blocked (%)', sqlerrm;
  end;
  update community_members set role='member' where community_id=cid and user_id='b0000002-0000-0000-0000-000000000002';

  -- archive cascades to groups, returns group count
  n := archive_community(cid, true);
  if (select count(*) from groups where community_id=cid and archived_at is null) <> 0 then
    raise exception using errcode='PT001', message='archive did not cascade to groups'; end if;
  raise notice 'OK archive_community cascaded to % group(s)', n;
  perform archive_community(cid, false);

  -- THE LAST-ADMIN GUARD. One admin, one member: every departure is refused, and each one has to
  -- raise the distinct code the app maps (not a bare 'forbidden').
  begin
    perform leave_community(cid);
    raise exception using errcode='PT001', message='last admin should not be able to leave';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%last_admin_must_promote_first%' then
      raise exception using errcode='PT001', message='leave raised the wrong code: ' || sqlerrm; end if;
    raise notice 'OK last admin cannot leave (%)', sqlerrm;
  end;

  begin
    perform remove_member(cid, 'b0000001-0000-0000-0000-000000000001');
    raise exception using errcode='PT001', message='last admin should not be removable';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%last_admin_must_promote_first%' then
      raise exception using errcode='PT001', message='remove raised the wrong code: ' || sqlerrm; end if;
    raise notice 'OK last admin cannot be removed (%)', sqlerrm;
  end;

  -- Demotion is a raw UPDATE under the "community_members: update" policy (0009) — RLS cannot
  -- count survivors, which is exactly why the guard is a trigger.
  begin
    update community_members set role='member'
      where community_id=cid and user_id='b0000001-0000-0000-0000-000000000001';
    raise exception using errcode='PT001', message='last admin should not be demotable';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%last_admin_must_promote_first%' then
      raise exception using errcode='PT001', message='demote raised the wrong code: ' || sqlerrm; end if;
    raise notice 'OK last admin cannot be demoted (%)', sqlerrm;
  end;

  begin
    -- The delete-account edge function runs the deletion as service_role (claims without a `sub`)
    -- for the id it verified (0143/0144). The role switch is undone with this block's subtransaction.
    perform set_config('role', 'service_role', true);
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    perform soft_delete_account('b0000001-0000-0000-0000-000000000001'::uuid);
    raise exception using errcode='PT001', message='last admin should not be able to delete their account';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%last_admin_must_promote_first%' then
      raise exception using errcode='PT001', message='account deletion raised the wrong code: ' || sqlerrm; end if;
    raise notice 'OK last admin cannot delete their account (%)', sqlerrm;
  end;

  -- The remedy from UX-COMM-20/23: promote somebody, then leave. Basic's cap allows the 2nd admin.
  update community_members set role='admin' where community_id=cid and user_id='b0000002-0000-0000-0000-000000000002';
  raise notice 'OK 2nd admin admitted after the Basic upgrade';
  perform leave_community(cid);
  if exists (select 1 from community_members where community_id=cid and user_id='b0000001-0000-0000-0000-000000000001') then
    raise exception using errcode='PT001', message='leave did not happen once a second admin existed'; end if;
  raise notice 'OK leaving works once another admin exists';
end $$;
reset role;

-- The other half of the rule: the sole admin of a community with NOBODY else may always go —
-- there is nothing left to orphan, and an account must never be undeletable because of it.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare cid uuid;
begin
  cid := create_community_with_personal_tenant('SoloC','friends','PT','public');
  perform leave_community(cid);
  if exists (select 1 from community_members where community_id=cid) then
    raise exception using errcode='PT001', message='a sole admin with no other members should be able to leave'; end if;
  raise notice 'OK sole admin with no other members may leave';
end $$;
reset role;
rollback;
