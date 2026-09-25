-- 0107 group integrity (UX Audit — Groups, plan PR 1):
--   B1 nobody writes their own way into a group; B2 nobody deletes their own row past leave_group;
--   B4 members invite when invite_members is on, not when it is off;
--   B5 decline, and re-inviting after a decline or after leaving produces a fresh pending invite;
--   leave_group_preflight / decision 1 (the sole-admin guard is private-only);
--   remove_group_member removes from the group and nothing else.
-- 'PT001' = "expected behaviour did not hold" sentinel; the RPCs raise P0001.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e1070001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gi-a@x.com'),
  ('e1070002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gi-b@x.com'),
  ('e1070003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gi-c@x.com'),
  ('e1070004-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gi-d@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e1070001-0000-0000-0000-000000000001','gi-a@x.com','+351901070001','GiAdmin'),
  ('e1070002-0000-0000-0000-000000000002','gi-b@x.com','+351901070002','GiMember'),
  ('e1070003-0000-0000-0000-000000000003','gi-c@x.com','+351901070003','GiOutsider'),
  ('e1070004-0000-0000-0000-000000000004','gi-d@x.com','+351901070004','GiMember2') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1070001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('GIntegrity','club','PT','public') as cid \gset
reset role;
insert into community_subscriptions (community_id, plan_id) values (:'cid', 'community_pro')
  on conflict (community_id) do update set plan_id='community_pro';
insert into community_members (community_id, user_id, role) values
  (:'cid','e1070002-0000-0000-0000-000000000002','member'),
  (:'cid','e1070004-0000-0000-0000-000000000004','member') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1070001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_group(:'cid','GiPublic',null,false) as gpub \gset
select create_group(:'cid','GiPrivate',null,true) as gpriv \gset
reset role;
select set_config('test.gpub', :'gpub', false), set_config('test.gpriv', :'gpriv', false),
       set_config('test.cid', :'cid', false);
insert into group_members (group_id, user_id) values
  (:'gpub','e1070002-0000-0000-0000-000000000002'),
  (:'gpub','e1070004-0000-0000-0000-000000000004') on conflict do nothing;

-- (1) B1: a community member cannot insert themselves into the private group.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1070002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare g uuid := current_setting('test.gpriv')::uuid;
begin
  begin
    insert into group_members (group_id, user_id) values (g, auth.uid());
    raise exception using errcode='PT001', message='B1: self-insert into a private group must be refused';
  exception when insufficient_privilege then raise notice 'OK B1 self-insert refused';
  end;
end $$;

-- (2) B2: a member cannot delete their own row directly (no policy -> nothing deleted).
do $$
declare g uuid := current_setting('test.gpub')::uuid;
begin
  delete from group_members where group_id=g and user_id=auth.uid();
end $$;
reset role;
do $$ begin
  if not exists (select 1 from group_members where group_id=current_setting('test.gpub')::uuid
                 and user_id='e1070002-0000-0000-0000-000000000002') then
    raise exception using errcode='PT001', message='B2: direct self-delete must not remove the row'; end if;
  raise notice 'OK B2 direct self-delete is a no-op';
end $$;

-- (3) B4: member B invites outsider C while invite_members is on (the default).
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1070002-0000-0000-0000-000000000002","role":"authenticated"}';
select invite_to_group(:'gpub', 'e1070003-0000-0000-0000-000000000003');
reset role;
do $$ begin
  if not exists (select 1 from group_invitations where group_id=current_setting('test.gpub')::uuid
                 and invitee_id='e1070003-0000-0000-0000-000000000003' and status='pending') then
    raise exception using errcode='PT001', message='B4: a member should invite when invite_members is on'; end if;
  raise notice 'OK B4 member invites with the toggle on';
end $$;

-- ... and is refused once the toggle is off.
update community_permissions set invite_members=false where community_id=:'cid';
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1070002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  begin
    perform invite_to_group(current_setting('test.gpub')::uuid, 'e1070001-0000-0000-0000-000000000001');
    raise exception using errcode='PT001', message='B4: a member must not invite with the toggle off';
  exception when sqlstate 'P0001' then raise notice 'OK B4 member refused with the toggle off';
  end;
end $$;
reset role;
update community_permissions set invite_members=true where community_id=:'cid';

-- (4) B5: C declines; A re-invites; C has a fresh pending invite and a second notification.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1070003-0000-0000-0000-000000000003","role":"authenticated"}';
select decline_group_invitation(:'gpub');
reset role;
do $$ begin
  if not exists (select 1 from group_invitations where group_id=current_setting('test.gpub')::uuid
                 and invitee_id='e1070003-0000-0000-0000-000000000003' and status='declined') then
    raise exception using errcode='PT001', message='B5: decline should mark the invitation declined'; end if;
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1070001-0000-0000-0000-000000000001","role":"authenticated"}';
select invite_to_group(:'gpub', 'e1070003-0000-0000-0000-000000000003');
reset role;
do $$ begin
  if not exists (select 1 from group_invitations where group_id=current_setting('test.gpub')::uuid
                 and invitee_id='e1070003-0000-0000-0000-000000000003' and status='pending') then
    raise exception using errcode='PT001', message='B5: re-invite after decline should be pending again'; end if;
  if (select count(*) from notifications where user_id='e1070003-0000-0000-0000-000000000003'
      and type='group_invite' and group_id=current_setting('test.gpub')::uuid) <> 2 then
    raise exception using errcode='PT001', message='B5: the re-invite should notify again'; end if;
  raise notice 'OK B5 decline then re-invite';
end $$;

-- C accepts (joins the community too), leaves, and can be invited again.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1070003-0000-0000-0000-000000000003","role":"authenticated"}';
select accept_group_invitation(:'gpub', true);
select leave_group(:'gpub');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1070001-0000-0000-0000-000000000001","role":"authenticated"}';
select invite_to_group(:'gpub', 'e1070003-0000-0000-0000-000000000003');
reset role;
do $$ begin
  if not exists (select 1 from group_invitations where group_id=current_setting('test.gpub')::uuid
                 and invitee_id='e1070003-0000-0000-0000-000000000003' and status='pending') then
    raise exception using errcode='PT001', message='B5: re-invite after leaving should be pending'; end if;
  raise notice 'OK B5 re-invite after leaving';
end $$;

-- (5) Decision 1: A is the only admin in both groups. Private -> blocked; public -> free to leave.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1070001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  if leave_group_preflight(current_setting('test.gpriv')::uuid) <> 'sole_admin' then
    raise exception using errcode='PT001', message='preflight: sole admin of a private group'; end if;
  if leave_group_preflight(current_setting('test.gpub')::uuid) <> 'ok' then
    raise exception using errcode='PT001', message='preflight: a public group never blocks'; end if;
  perform leave_group(current_setting('test.gpub')::uuid);
  if leave_group_preflight(current_setting('test.gpub')::uuid) <> 'not_a_member' then
    raise exception using errcode='PT001', message='preflight: after leaving'; end if;
  raise notice 'OK preflight + public-group leave';
end $$;

-- (6) remove_group_member: A (still admin of the public group, member or not) removes D.
do $$ begin
  perform remove_group_member(current_setting('test.gpub')::uuid, 'e1070004-0000-0000-0000-000000000004');
end $$;
reset role;
do $$ begin
  if exists (select 1 from group_members where group_id=current_setting('test.gpub')::uuid
             and user_id='e1070004-0000-0000-0000-000000000004') then
    raise exception using errcode='PT001', message='remove_group_member should remove the row'; end if;
  if not exists (select 1 from community_members where community_id=current_setting('test.cid')::uuid
                 and user_id='e1070004-0000-0000-0000-000000000004') then
    raise exception using errcode='PT001', message='remove_group_member must keep them in the community'; end if;
  raise notice 'OK remove_group_member is group-only';
end $$;

-- ... and a plain member cannot.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1070002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  begin
    perform remove_group_member(current_setting('test.gpub')::uuid, 'e1070003-0000-0000-0000-000000000003');
    raise exception using errcode='PT001', message='a plain member must not remove anyone';
  exception when sqlstate 'P0001' then raise notice 'OK plain member cannot remove';
  end;
end $$;
reset role;
rollback;
