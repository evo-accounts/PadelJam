-- explore_players: surfaces profiles sharing a community/group with the viewer; excludes self and
-- non-co-members.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e4000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ep1@x.com'),
  ('e4000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ep2@x.com'),
  ('e4000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ep3@x.com'),
  ('e4000004-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ep4@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e4000001-0000-0000-0000-000000000001','ep1@x.com','+351900500001','EpOwner'),
  ('e4000002-0000-0000-0000-000000000002','ep2@x.com','+351900500002','EpCoMember'),
  ('e4000003-0000-0000-0000-000000000003','ep3@x.com','+351900500003','EpStranger'),
  ('e4000004-0000-0000-0000-000000000004','ep4@x.com','+351900500004','EpGroupMate') on conflict do nothing;

do $$
declare cid uuid; gen_gid uuid;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e4000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('EpC','club','PT','public');

  perform set_config('role','postgres',true);
  insert into community_members (community_id, user_id, role) values (cid,'e4000002-0000-0000-0000-000000000002','member') on conflict do nothing;

  -- group co-membership arm: find the general group created by create_community_with_personal_tenant
  -- and add viewer + EpGroupMate to it (EpGroupMate shares no community with viewer)
  select id into gen_gid from groups where community_id = cid and is_general = true limit 1;
  insert into group_members (group_id, user_id) values (gen_gid,'e4000001-0000-0000-0000-000000000001') on conflict do nothing;
  insert into group_members (group_id, user_id) values (gen_gid,'e4000004-0000-0000-0000-000000000004') on conflict do nothing;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e4000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  if not exists (select 1 from explore_players(50,0) where id = 'e4000002-0000-0000-0000-000000000002') then
    raise exception using errcode='PT001', message='co-member not surfaced';
  end if;
  if exists (select 1 from explore_players(50,0) where id = 'e4000003-0000-0000-0000-000000000003') then
    raise exception using errcode='PT001', message='stranger surfaced';
  end if;
  if exists (select 1 from explore_players(50,0) where id = 'e4000001-0000-0000-0000-000000000001') then
    raise exception using errcode='PT001', message='self surfaced';
  end if;
  if not exists (select 1 from explore_players(50,0) where id = 'e4000004-0000-0000-0000-000000000004') then
    raise exception using errcode='PT001', message='group co-member not surfaced (union arm)';
  end if;

  raise notice 'OK explore_players';
end $$;
rollback;
