-- Create RPC contract: general group "[name] Group", the five permission toggles at UX-COMM-17's
-- defaults, the creator as ADMIN, Starter implicit (community_plan='starter'), and NO owned-community
-- cap — UX-COMM-09 lifts it, so a second create must now succeed (migration 0098).
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('c0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cr@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('c0000001-0000-0000-0000-000000000001','cr@x.com','+351900000001','Creator') on conflict do nothing;

do $$
declare cid uuid;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"c0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('Createy','club','PT','public','desc','Lisbon',null,null,false,null);

  if (select name from groups where community_id=cid and is_general) <> 'Createy Group' then
    raise exception using errcode='PT001', message='general group name should be "Createy Group"'; end if;
  if not exists (select 1 from group_seasons s join groups g on g.id = s.group_id
                 where g.community_id=cid and g.is_general and s.season_number=1 and s.ended_at is null) then
    raise exception using errcode='PT001', message='general group should open season 1 (0107)'; end if;
  -- UX-COMM-17: posts, events and invites on; groups and approvals off.
  if not exists (select 1 from community_permissions
                 where community_id=cid and create_posts and create_events and invite_members
                   and not create_groups and not approve_join_requests) then
    raise exception using errcode='PT001',
      message='new community should start on the UX-COMM-17 permission matrix'; end if;
  -- community_plan is an internal helper (0094): not executable by authenticated, so ask as postgres.
  perform set_config('role','postgres',true);
  if community_plan(cid) <> 'starter' then
    raise exception using errcode='PT001', message='community should resolve to starter implicitly'; end if;
  perform set_config('role','authenticated',true);
  if (select role from community_members where community_id=cid and user_id='c0000001-0000-0000-0000-000000000001') <> 'admin' then
    raise exception using errcode='PT001', message='creator should be an admin'; end if;
  raise notice 'OK create: general="Createy Group", permission matrix, starter implicit, creator=admin';

  -- The cap is gone (UX-COMM-09: "New community" is always available; plan limits do not apply
  -- during the MVP). The zero-argument signature is kept, so the client query still compiles.
  if not can_create_community() then
    raise exception using errcode='PT001', message='can_create_community should stay true after creating one'; end if;
  perform create_community_with_personal_tenant('Second','club','PT');
  if (select count(*) from community_members cm join communities c2 on c2.id=cm.community_id
      where cm.user_id='c0000001-0000-0000-0000-000000000001' and cm.role='admin') <> 2 then
    raise exception using errcode='PT001', message='a second community should be creatable'; end if;
  raise notice 'OK the one-community cap is lifted';
end $$;
rollback;
