-- join_group: public join adds community_members + group_members (GR-09); private join forbidden.
-- invite_to_group (admin) + accept_group_invitation (invitee) -> both memberships + accepted row (GR-10).
-- invite by non-admin -> forbidden; accept with no pending invite -> invitation_not_found. All P0001.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e1200001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gjown@x.com'),
  ('e1200002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gjpub@x.com'),
  ('e1200003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gjinv@x.com'),
  ('e1200004-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gjnoadmin@x.com'),
  ('e1200005-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gjnopend@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e1200001-0000-0000-0000-000000000001','gjown@x.com','+351901200001','GjOwner'),
  ('e1200002-0000-0000-0000-000000000002','gjpub@x.com','+351901200002','GjPubJoiner'),
  ('e1200003-0000-0000-0000-000000000003','gjinv@x.com','+351901200003','GjInvitee'),
  ('e1200004-0000-0000-0000-000000000004','gjnoadmin@x.com','+351901200004','GjNonAdmin'),
  ('e1200005-0000-0000-0000-000000000005','gjnopend@x.com','+351901200005','GjNoPending') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1200001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('GJoinC','club','PT','public') as cid \gset
reset role;
insert into community_subscriptions (community_id, plan_id)
  select id, 'basic' from communities where name='GJoinC' order by created_at desc limit 1
  on conflict (community_id) do update set plan_id='basic';

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1200001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_group(:'cid','PubJoinGroup',null,false) as pub_gid \gset
select create_group(:'cid','PrivJoinGroup',null,true) as priv_gid \gset
reset role;
select set_config('test.cid', :'cid', false);
select set_config('test.pub_gid', :'pub_gid', false);
select set_config('test.priv_gid', :'priv_gid', false);

-- Public group: a user who is NOT yet a community member joins -> both memberships exist (GR-09).
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1200002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare cid uuid := current_setting('test.cid')::uuid;
        pub_gid uuid := current_setting('test.pub_gid')::uuid;
begin
  perform join_group(pub_gid);
  if not exists (select 1 from community_members where community_id=cid and user_id=auth.uid()) then
    raise exception using errcode='PT001', message='GR-09: public join must add community_members row'; end if;
  if not exists (select 1 from group_members where group_id=pub_gid and user_id=auth.uid()) then
    raise exception using errcode='PT001', message='GR-09: public join must add group_members row'; end if;
  raise notice 'OK public join_group -> community_members + group_members (GR-09)';
end $$;
reset role;

-- Private group: join_group must raise group_private_join_forbidden (P0001).
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1200002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare priv_gid uuid := current_setting('test.priv_gid')::uuid;
begin
  begin
    perform join_group(priv_gid);
    raise exception using errcode='PT001', message='private join_group should be forbidden';
  exception when sqlstate 'P0001' then raise notice 'OK private join blocked (%)', sqlerrm;
  end;
end $$;
reset role;

-- invite_to_group by a group admin (owner), then accept_group_invitation by the invitee (GR-10).
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1200001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare priv_gid uuid := current_setting('test.priv_gid')::uuid;
begin
  perform invite_to_group(priv_gid, 'e1200003-0000-0000-0000-000000000003');
  if not exists (select 1 from group_invitations
                 where group_id=priv_gid and invitee_id='e1200003-0000-0000-0000-000000000003' and status='pending') then
    raise exception using errcode='PT001', message='invite_to_group should create a pending invitation'; end if;
  raise notice 'OK invite_to_group (admin) created pending invitation';
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1200003-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
declare cid uuid := current_setting('test.cid')::uuid;
        priv_gid uuid := current_setting('test.priv_gid')::uuid;
begin
  perform accept_group_invitation(priv_gid);
  if not exists (select 1 from community_members where community_id=cid and user_id=auth.uid()) then
    raise exception using errcode='PT001', message='GR-10: accept must add community_members row'; end if;
  if not exists (select 1 from group_members where group_id=priv_gid and user_id=auth.uid()) then
    raise exception using errcode='PT001', message='GR-10: accept must add group_members row'; end if;
  if not exists (select 1 from group_invitations where group_id=priv_gid and invitee_id=auth.uid()
                 and status='accepted' and responded_at is not null) then
    raise exception using errcode='PT001', message='GR-10: invitation must be accepted with responded_at set'; end if;
  raise notice 'OK accept_group_invitation -> memberships + accepted/responded_at (GR-10)';
end $$;
reset role;

-- invite_to_group by a non-admin must raise forbidden (P0001).
-- gjnoadmin is a plain community member but not an admin.
insert into community_members (community_id, user_id, role)
  values (:'cid','e1200004-0000-0000-0000-000000000004','member') on conflict do nothing;
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1200004-0000-0000-0000-000000000004","role":"authenticated"}';
do $$
declare priv_gid uuid := current_setting('test.priv_gid')::uuid;
begin
  begin
    perform invite_to_group(priv_gid, 'e1200005-0000-0000-0000-000000000005');
    raise exception using errcode='PT001', message='non-admin invite_to_group should be forbidden';
  exception when sqlstate 'P0001' then raise notice 'OK non-admin invite blocked (%)', sqlerrm;
  end;
end $$;
reset role;

-- accept_group_invitation with no pending invite must raise invitation_not_found (P0001).
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1200005-0000-0000-0000-000000000005","role":"authenticated"}';
do $$
declare priv_gid uuid := current_setting('test.priv_gid')::uuid;
begin
  begin
    perform accept_group_invitation(priv_gid);
    raise exception using errcode='PT001', message='accept with no pending invite should raise invitation_not_found';
  exception when sqlstate 'P0001' then raise notice 'OK accept without invite blocked (%)', sqlerrm;
  end;
end $$;
reset role;
rollback;
