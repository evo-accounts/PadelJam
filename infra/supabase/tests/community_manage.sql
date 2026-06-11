-- Manage: make_admin hits co-org cap on starter, succeeds after Basic upgrade; archive cascades to
-- groups; transfer_ownership swaps roles + frees the owned-cap; owner cannot leave.
begin;
insert into auth.users (id, instance_id, aud, role) values
  ('b0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('b0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('b0000001-0000-0000-0000-000000000001','mown@x.com','+351900300001','MOwner'),
  ('b0000002-0000-0000-0000-000000000002','mmem@x.com','+351900300002','MMember') on conflict do nothing;

-- owner creates a community; member joins.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('ManageC','club','PT','public') as cid \gset
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ declare cid uuid := (select id from communities where name='ManageC' order by created_at desc limit 1);
begin perform join_community(cid, false); end $$;
reset role;

-- make_admin on starter (co_organizers=0) must be blocked by the cap trigger; then upgrade to basic and succeed.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare cid uuid := (select id from communities where name='ManageC' order by created_at desc limit 1);
begin
  begin
    update community_members set role='admin' where community_id=cid and user_id='b0000002-0000-0000-0000-000000000002';
    raise exception using errcode='PT001', message='make_admin on starter should hit co_organizers cap';
  exception when sqlstate 'P0001' then raise notice 'OK make_admin blocked on starter (%)', sqlerrm;
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
  -- promote succeeds now (co_organizers=1 on Basic)
  update community_members set role='admin' where community_id=cid and user_id='b0000002-0000-0000-0000-000000000002';
  raise notice 'OK make_admin succeeds after Basic upgrade';

  -- archive cascades to groups, returns group count
  n := archive_community(cid, true);
  if (select count(*) from groups where community_id=cid and archived_at is null) <> 0 then
    raise exception using errcode='PT001', message='archive did not cascade to groups'; end if;
  raise notice 'OK archive_community cascaded to % group(s)', n;
  perform archive_community(cid, false); -- unarchive for the transfer test

  -- owner cannot leave
  begin
    perform leave_community(cid);
    raise exception using errcode='PT001', message='owner leave should require transfer first';
  exception when sqlstate 'P0001' then raise notice 'OK owner cannot leave (%)', sqlerrm;
  end;

  -- transfer ownership to the (now admin) member; old owner becomes admin and can create again
  perform transfer_ownership(cid, 'b0000002-0000-0000-0000-000000000002');
  if (select role from community_members where community_id=cid and user_id='b0000002-0000-0000-0000-000000000002') <> 'owner' then
    raise exception using errcode='PT001', message='transfer did not set new owner'; end if;
  if not can_create_community() then
    raise exception using errcode='PT001', message='old owner should be able to create again after transfer'; end if;
  raise notice 'OK transfer_ownership swapped roles + freed owned-cap';
end $$;
reset role;
rollback;
