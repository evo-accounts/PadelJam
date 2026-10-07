-- Manage, under the two-role model (migration 0098). This file used to be built entirely on
-- transfer_ownership, which no longer exists.
--
-- What it proves now:
--   * the creator lands as an ADMIN and the co-organizer cap still bites on the SECOND one
--     (the "beyond the first" reading — starter's limit is 0 and yet one admin exists);
--   * a Basic upgrade admits that second admin;
--   * archive still cascades to groups;
--   * the last-admin guard refuses all four departures, and the promotion is the way out.
begin;
insert into auth.users (id, instance_id, aud, role) values
  ('b0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('b0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('b0000001-0000-0000-0000-000000000001','mown@x.com','+351900300001','MOwner'),
  ('b0000002-0000-0000-0000-000000000002','mmem@x.com','+351900300002','MMember') on conflict do nothing;

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

-- THE CAP, post-0098. Starter's co_organizers limit is 0, and the creator is nonetheless an admin:
-- the limit counts admins BEYOND THE FIRST. Promoting a second one must still be refused.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare cid uuid := (select id from communities where name='ManageC' order by created_at desc limit 1);
begin
  if (select role from community_members where community_id=cid and user_id='b0000001-0000-0000-0000-000000000001') <> 'admin' then
    raise exception using errcode='PT001', message='creator should be an admin, not an owner';
  end if;
  if (select count(*) from community_members where community_id=cid and role='admin') <> 1 then
    raise exception using errcode='PT001', message='starter should hold exactly the one admin';
  end if;
  begin
    update community_members set role='admin' where community_id=cid and user_id='b0000002-0000-0000-0000-000000000002';
    raise exception using errcode='PT001', message='a SECOND admin on starter should hit the co_organizers cap';
  exception when sqlstate 'P0001' then raise notice 'OK starter: 1 admin allowed, 2nd blocked (%)', sqlerrm;
  end;
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
