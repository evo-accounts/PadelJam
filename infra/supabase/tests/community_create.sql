-- Create RPC contract: general group "[name] group", create_posts default true, owner role,
-- Starter implicit (community_plan='starter'), owned-cap blocks a 2nd create.
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

  if (select name from groups where community_id=cid and is_general) <> 'Createy group' then
    raise exception using errcode='PT001', message='general group name should be "Createy group"'; end if;
  if (select create_posts from community_permissions where community_id=cid) is not true then
    raise exception using errcode='PT001', message='create_posts should default true'; end if;
  -- community_plan is an internal helper (0094): not executable by authenticated, so ask as postgres.
  perform set_config('role','postgres',true);
  if community_plan(cid) <> 'starter' then
    raise exception using errcode='PT001', message='community should resolve to starter implicitly'; end if;
  perform set_config('role','authenticated',true);
  if (select role from community_members where community_id=cid and user_id='c0000001-0000-0000-0000-000000000001') <> 'owner' then
    raise exception using errcode='PT001', message='creator should be owner'; end if;
  raise notice 'OK create: general="Createy group", create_posts=true, starter implicit, owner set';

  if can_create_community() then
    raise exception using errcode='PT001', message='can_create_community should be false after owning one'; end if;
  raise notice 'OK can_create_community=false after owning one';

  begin
    perform create_community_with_personal_tenant('Second','club','PT');
    raise exception using errcode='PT001', message='2nd create should be blocked by owned-cap';
  exception when sqlstate 'P0001' then raise notice 'OK 2nd create blocked: %', sqlerrm;
  end;
end $$;
rollback;
