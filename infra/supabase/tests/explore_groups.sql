-- explore_groups: surfaces public groups in visible communities to non-members; hides private groups
-- and groups the viewer already belongs to.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e2000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','eg1@x.com'),
  ('e2000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','eg2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e2000001-0000-0000-0000-000000000001','eg1@x.com','+351900300001','EgOwner'),
  ('e2000002-0000-0000-0000-000000000002','eg2@x.com','+351900300002','EgViewer') on conflict do nothing;

do $$
declare cid uuid; gid_pub uuid; gid_priv uuid;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e2000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('EgPubC','club','PT','public');

  perform set_config('role','postgres',true);
  -- starter plan allows only 1 group; upgrade to basic (limit=3) so we can add test groups.
  insert into community_subscriptions (community_id, plan_id)
    values (cid,'basic') on conflict (community_id) do update set plan_id='basic';
  insert into groups (community_id, name, is_private) values (cid,'EgPubG',false) returning id into gid_pub;
  insert into groups (community_id, name, is_private) values (cid,'EgPrivG',true) returning id into gid_priv;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e2000002-0000-0000-0000-000000000002","role":"authenticated"}',true);

  if not exists (select 1 from explore_groups(50,0) where id = gid_pub) then
    raise exception using errcode='PT001', message='public group not surfaced to non-member';
  end if;
  if exists (select 1 from explore_groups(50,0) where id = gid_priv) then
    raise exception using errcode='PT001', message='private group leaked';
  end if;

  perform set_config('role','postgres',true);
  insert into group_members (group_id, user_id) values (gid_pub,'e2000002-0000-0000-0000-000000000002') on conflict do nothing;
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e2000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  if exists (select 1 from explore_groups(50,0) where id = gid_pub) then
    raise exception using errcode='PT001', message='joined group still surfaced';
  end if;

  raise notice 'OK explore_groups';
end $$;
rollback;
