-- Build a starter community owned by a test user, then prove Starter's launch limits (0156: unlimited
-- groups, 3 co-organizers) and that Basic's caps still block.
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

-- GROUPS: Starter has no groups cap since 0156, so a 2nd and a 3rd group succeed.
do $$
declare cid uuid := (select id from communities where name='Caps' order by created_at desc limit 1);
begin
  insert into groups (community_id, name) values (cid, 'Second Group');
  insert into groups (community_id, name) values (cid, 'Third Group');
  insert into groups (community_id, name) values (cid, 'Fourth Group');
  raise notice 'OK starter has no groups cap';
end $$;

-- CO-ORGANIZER CAP (starter = 3): three promotions succeed, the fourth is refused.
do $$
declare
  cid  uuid := (select id from communities where name='Caps' order by created_at desc limit 1);
  muid uuid;
  n    int;
begin
  for n in 1..4 loop
    muid := ('00000000-0000-0000-0000-0000000000a'||n)::uuid;
    insert into auth.users (id, instance_id, aud, role)
      values (muid, '00000000-0000-0000-0000-000000000000','authenticated','authenticated')
      on conflict do nothing;
    -- profiles row required: community_members.user_id FK -> profiles (migration 0031).
    insert into profiles (id, email, phone, full_name)
      values (muid, 'capmember'||n||'@example.com', '+35118888888'||n, 'CapMember'||n) on conflict do nothing;
    insert into community_members (community_id, user_id, role) values (cid, muid, 'member');
    if n < 4 then
      update community_members set role='admin' where community_id=cid and user_id=muid;
    end if;
  end loop;
  raise notice 'OK three co-organizers allowed on starter';
  begin
    update community_members set role='admin' where community_id=cid and user_id=muid;
    raise exception using errcode='PT001', message='EXPECTED co_organizers cap to block the 4th promotion, but it succeeded';
  exception when sqlstate 'P0001' then
    raise notice 'OK co_organizers cap blocked the 4th: %', sqlerrm;
  end;
end $$;

-- BASIC (groups = 3, general counts) still caps, and the cap excludes archived groups (regression
-- for 0017): archiving a group frees a slot so a replacement can be created.
do $$
declare cid uuid := (select id from communities where name='Caps' order by created_at desc limit 1);
begin
  insert into community_subscriptions (community_id, dimension, plan_id, status, provider)
    values (cid, 'community', 'basic', 'active', 'manual');
  -- the community holds 4 groups from the Starter block; trim it to the Basic cap of 3
  delete from groups where community_id = cid and name = 'Fourth Group';
  begin
    insert into groups (community_id, name) values (cid, 'Over Cap');
    raise exception using errcode='PT001', message='EXPECTED basic groups cap to block, but insert succeeded';
  exception when sqlstate 'P0001' then
    raise notice 'OK basic groups cap blocked: %', sqlerrm;
  end;
  update groups set archived_at = now() where community_id = cid and name = 'Second Group';
  insert into groups (community_id, name) values (cid, 'Replacement'); -- 2 active < 3 → allowed
  raise notice 'OK archived group frees the basic group slot';
exception when sqlstate 'P0001' then
  raise exception using errcode='PT001', message='EXPECTED replacement group allowed after archiving';
end $$;

rollback;
