-- 0110 group_invitation_preview (UX-GRP-02): the invitee of a PRIVATE group sees its identity and
-- who invited them; anyone without a pending invitation sees nothing; accepting ends the preview.
-- 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e1100001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gip-a@x.com'),
  ('e1100002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gip-b@x.com'),
  ('e1100003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gip-c@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e1100001-0000-0000-0000-000000000001','gip-a@x.com','+351901100001','GipAdmin'),
  ('e1100002-0000-0000-0000-000000000002','gip-b@x.com','+351901100002','GipInvitee'),
  ('e1100003-0000-0000-0000-000000000003','gip-c@x.com','+351901100003','GipStranger') on conflict do nothing;
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1100001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('GPreview','club','PT','public') as cid \gset
reset role;
insert into community_subscriptions (community_id, plan_id) values (:'cid', 'community_pro')
  on conflict (community_id) do update set plan_id='community_pro';
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1100001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_group(:'cid','GipSecret','Hush',true) as g \gset
select invite_to_group(:'g', 'e1100002-0000-0000-0000-000000000002');
reset role;
select set_config('test.g', :'g', false);

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1100002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare r record;
begin
  if exists (select 1 from groups where id = current_setting('test.g')::uuid) then
    raise exception using errcode='PT001', message='precondition: the invitee cannot read the private group row'; end if;
  select * into r from group_invitation_preview(current_setting('test.g')::uuid);
  if r.name <> 'GipSecret' or r.inviter_name <> 'GipAdmin' or r.member_count <> 1
     or jsonb_array_length(r.members) <> 1 or r.community_name <> 'GPreview' then
    raise exception using errcode='PT001', message='the invitee should see the preview with its inviter'; end if;
  raise notice 'OK invitee sees the preview';
  perform accept_group_invitation(current_setting('test.g')::uuid, true);
  if exists (select 1 from group_invitation_preview(current_setting('test.g')::uuid)) then
    raise exception using errcode='PT001', message='an accepted invitation ends the preview'; end if;
  raise notice 'OK preview ends on accept';
end $$;
set local request.jwt.claims = '{"sub":"e1100003-0000-0000-0000-000000000003","role":"authenticated"}';
do $$ begin
  if exists (select 1 from group_invitation_preview(current_setting('test.g')::uuid)) then
    raise exception using errcode='PT001', message='no invitation, no preview'; end if;
  raise notice 'OK a stranger sees nothing';
end $$;
reset role;
rollback;
