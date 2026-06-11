-- Build a starter community owned by a test user, then prove each cap blocks.
-- IMPORTANT: the triggers raise SQLSTATE 'P0001'. The "expected to block" sentinel uses a DISTINCT
-- code 'PT001' so the `when sqlstate 'P0001'` handler can never swallow a real failure.
begin;
insert into auth.users (id, instance_id, aud, role, email)
  values ('88888888-8888-8888-8888-888888888888','00000000-0000-0000-0000-000000000000','authenticated','authenticated','capx@example.com')
  on conflict do nothing;
-- profiles row required: create_community_with_personal_tenant sets communities.created_by -> profiles.
insert into profiles (id, email, phone, full_name)
  values ('88888888-8888-8888-8888-888888888888','capx@example.com','+351188888888','Capx') on conflict do nothing;
set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}';

select create_community_with_personal_tenant('Caps','friends','PT') as cid \gset
set local role postgres;  -- bypass RLS for the test fixtures; triggers still fire

-- GROUPS CAP (starter = 1, general already exists): a 2nd group must fail.
do $$
declare cid uuid := (select id from communities where name='Caps' order by created_at desc limit 1);
begin
  begin
    insert into groups (community_id, name) values (cid, 'Second Group');
    raise exception using errcode='PT001', message='EXPECTED groups cap to block, but insert succeeded';
  exception when sqlstate 'P0001' then
    raise notice 'OK groups cap blocked: %', sqlerrm;
  end;
end $$;

-- CO-ORGANIZER CAP (starter = 0): promoting any member to admin must fail.
do $$
declare
  cid  uuid := (select id from communities where name='Caps' order by created_at desc limit 1);
  muid uuid := '00000000-0000-0000-0000-0000000000aa';
begin
  insert into auth.users (id, instance_id, aud, role)
    values (muid, '00000000-0000-0000-0000-000000000000','authenticated','authenticated')
    on conflict do nothing;
  -- profiles row required: community_members.user_id FK -> profiles (migration 0031).
  insert into profiles (id, email, phone, full_name)
    values (muid, 'capmember@example.com', '+351188888889', 'CapMember') on conflict do nothing;
  insert into community_members (community_id, user_id, role) values (cid, muid, 'member'); -- member cap: 1<10 ok
  begin
    update community_members set role='admin' where community_id=cid and user_id=muid;
    raise exception using errcode='PT001', message='EXPECTED co_organizers cap to block promotion, but it succeeded';
  exception when sqlstate 'P0001' then
    raise notice 'OK co_organizers cap blocked: %', sqlerrm;
  end;
end $$;

-- GROUPS CAP excludes archived groups (regression for 0017): archiving the general group frees the
-- starter slot so a replacement group can be created.
do $$
declare cid uuid := (select id from communities where name='Caps' order by created_at desc limit 1);
begin
  update groups set archived_at = now() where community_id = cid and is_general;
  insert into groups (community_id, name) values (cid, 'Replacement'); -- 0 active < 1 → allowed
  raise notice 'OK archived general group frees the starter group slot';
exception when sqlstate 'P0001' then
  raise exception using errcode='PT001', message='EXPECTED replacement group allowed after archiving general';
end $$;

rollback;
