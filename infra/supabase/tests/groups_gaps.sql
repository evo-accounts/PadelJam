-- groups_gaps: my_groups.is_managing; add_group_admins (admin adds a community admin; non-admin forbidden).
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('fc000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gg1@x.com'),
  ('fc000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gg2@x.com'),
  ('fc000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gg3@x.com')
  on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('fc000001-0000-0000-0000-000000000001','gg1@x.com','+351900100001','Admin GG'),
  ('fc000002-0000-0000-0000-000000000002','gg2@x.com','+351900100002','Other Admin GG'),
  ('fc000003-0000-0000-0000-000000000003','gg3@x.com','+351900100003','Plain GG')
  on conflict do nothing;

do $$
declare a constant uuid := 'fc000001-0000-0000-0000-000000000001';  -- owner+group admin+member
  b constant uuid := 'fc000002-0000-0000-0000-000000000002';         -- community admin, NOT in group
  c constant uuid := 'fc000003-0000-0000-0000-000000000003';         -- plain (non-admin)
  v_tenant uuid; v_comm uuid; v_group uuid; v_managing boolean; v_in int;
begin
  insert into tenants (type, name, country) values ('community','GG Tenant','PT') returning id into v_tenant;
  insert into communities (tenant_id, name, type, privacy) values (v_tenant,'GG Community','club','public') returning id into v_comm;
  insert into community_subscriptions (community_id, plan_id) values (v_comm,'community_pro')
    on conflict (community_id) do update set plan_id='community_pro';
  insert into community_members (community_id, user_id, role) values (v_comm, a, 'admin'), (v_comm, b, 'admin'), (v_comm, c, 'member');
  insert into groups (community_id, name) values (v_comm,'GG Group') returning id into v_group;
  insert into group_members (group_id, user_id) values (v_group, a);

  -- my_groups.is_managing = true for the owner/admin 'a'
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', a), true);
  select is_managing into v_managing from my_groups() where group_id = v_group;
  if v_managing is not true then raise exception using errcode='PT001', message='is_managing not true for admin'; end if;

  -- add_group_admins: admin 'a' adds community admin 'b' (eligible); 'c' (non-admin) is skipped
  perform add_group_admins(v_group, array[b, c]);
  select count(*) into v_in from group_members where group_id = v_group and user_id = b;
  if v_in <> 1 then raise exception using errcode='PT001', message='community admin b not added'; end if;
  select count(*) into v_in from group_members where group_id = v_group and user_id = c;
  if v_in <> 0 then raise exception using errcode='PT001', message='non-admin c wrongly added'; end if;

  -- non-admin caller -> forbidden
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c), true);
  begin
    perform add_group_admins(v_group, array[c]);
    raise exception using errcode='PT001', message='expected forbidden for non-admin caller';
  exception when others then
    if sqlerrm <> 'forbidden' then raise exception using errcode='PT001', message='wrong err: '||sqlerrm; end if;
  end;

  raise notice 'OK groups_gaps';
end $$;
rollback;
