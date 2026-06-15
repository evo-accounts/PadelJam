-- my_groups: a member sees their (active) group with community name + member count; a non-member sees none.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f9000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mg1@x.com'),
  ('f9000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mg2@x.com')
  on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f9000001-0000-0000-0000-000000000001','mg1@x.com','+351900060001','Member MG'),
  ('f9000002-0000-0000-0000-000000000002','mg2@x.com','+351900060002','Outsider MG')
  on conflict do nothing;

do $$
declare a constant uuid := 'f9000001-0000-0000-0000-000000000001';
  b constant uuid := 'f9000002-0000-0000-0000-000000000002';
  v_tenant uuid;
  v_comm uuid;
  v_group uuid;
  v_count int;
  v_cname text;
  v_members int;
begin
  -- A tenant + community + a group, with A as a group member.
  insert into tenants (type, name, country) values ('community', 'MG Tenant', 'PT')
    returning id into v_tenant;
  insert into communities (tenant_id, name, type, privacy) values (v_tenant, 'MG Community', 'club', 'public')
    returning id into v_comm;
  insert into groups (community_id, name) values (v_comm, 'MG Group')
    returning id into v_group;
  insert into group_members (group_id, user_id) values (v_group, a);

  -- A sees exactly one group, with the community name and member_count = 1.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', a), true);
  select count(*) into v_count from my_groups();
  if v_count <> 1 then
    raise exception using errcode='PT001', message=format('member expected 1 group got %s', v_count); end if;
  select community_name, member_count into v_cname, v_members from my_groups();
  if v_cname <> 'MG Community' or v_members <> 1 then
    raise exception using errcode='PT001', message=format('row mismatch community=%s members=%s', v_cname, v_members); end if;

  -- B (non-member) sees none.
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', b), true);
  select count(*) into v_count from my_groups();
  if v_count <> 0 then
    raise exception using errcode='PT001', message=format('non-member expected 0 got %s', v_count); end if;

  raise notice 'OK my_groups';
end $$;
rollback;
