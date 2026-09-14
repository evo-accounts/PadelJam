-- The two toggles migration 0098 added (UX-COMM-17), proved to GATE creation rather than merely
-- being stored. 0012 had ruled both out as "admin-only, never columns here"; this file is the
-- evidence that the reversal reaches the server and is not client-side decoration.
--
-- Covered per toggle: the RPC, the `can_*` predicate the UI reads, and — for groups — the direct
-- PostgREST insert policy, which is the path that bypasses the RPC entirely.
-- 'PT001' = "expected behaviour did not hold"; the RPCs raise P0001.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('cf000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ptadmin@x.com'),
  ('cf000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ptmem@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('cf000001-0000-0000-0000-000000000001','ptadmin@x.com','+351900400001','PtAdmin'),
  ('cf000002-0000-0000-0000-000000000002','ptmem@x.com','+351900400002','PtMember') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"cf000001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('ToggleC','club','PT','public') as cid \gset
reset role;
-- Pro plan so the group cap (starter = 1, already used by the general group) never masks a
-- permission refusal with a cap refusal.
insert into community_subscriptions (community_id, plan_id)
  select id, 'community_pro' from communities where name='ToggleC' order by created_at desc limit 1
  on conflict (community_id) do update set plan_id='community_pro';

set local role authenticated;
set local request.jwt.claims = '{"sub":"cf000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ declare cid uuid := (select id from communities where name='ToggleC' order by created_at desc limit 1);
begin perform join_community(cid, false); end $$;
reset role;

-- ---------------------------------------------------------------------------
-- create_groups: OFF by default, so the member is refused on every path.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"cf000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare cid uuid := (select id from communities where name='ToggleC' order by created_at desc limit 1);
begin
  if (select create_groups from community_permissions where community_id=cid) then
    raise exception using errcode='PT001', message='create_groups should default OFF'; end if;
  if can_create_group(cid) then
    raise exception using errcode='PT001', message='can_create_group should be false with the toggle off'; end if;
  begin
    perform create_group(cid, 'MemberGroup');
    raise exception using errcode='PT001', message='create_group should be refused with the toggle off';
  exception when sqlstate 'P0001' then raise notice 'OK create_groups off: RPC refused (%)', sqlerrm;
  end;
  -- The direct path: "groups: insert" (0009) used to be admin-only and now asks may_create_group.
  -- RLS refuses with 42501, not P0001.
  begin
    insert into groups (community_id, name) values (cid, 'DirectGroup');
    raise exception using errcode='PT001', message='the groups insert policy should refuse a member with the toggle off';
  exception when insufficient_privilege then raise notice 'OK create_groups off: RLS insert refused';
  end;
end $$;
reset role;

-- Turn it on (as the admin, through the table's own write policy) and the same member succeeds.
set local role authenticated;
set local request.jwt.claims = '{"sub":"cf000001-0000-0000-0000-000000000001","role":"authenticated"}';
update community_permissions set create_groups = true
  where community_id = (select id from communities where name='ToggleC' order by created_at desc limit 1);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"cf000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare cid uuid := (select id from communities where name='ToggleC' order by created_at desc limit 1); g uuid;
begin
  if not can_create_group(cid) then
    raise exception using errcode='PT001', message='can_create_group should be true with the toggle on'; end if;
  g := create_group(cid, 'MemberGroup');
  if g is null then raise exception using errcode='PT001', message='create_group returned null'; end if;
  raise notice 'OK create_groups on: a plain member created a group';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- create_events: ON by default, so the member may create in a group they belong to; turning it
-- OFF must refuse them while leaving the admin untouched.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"cf000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare cid uuid := (select id from communities where name='ToggleC' order by created_at desc limit 1);
        gen uuid; e uuid;
begin
  select id into gen from groups where community_id=cid and is_general;
  if not can_create_event(gen) then
    raise exception using errcode='PT001', message='can_create_event should be true with create_events on'; end if;
  e := create_event(jsonb_build_object(
    'group_id', gen, 'name', 'Member event', 'event_type', 'americano', 'specification', 'classic',
    'scoring_mode', 'points', 'scoring_value', 24, 'organizer_role', 'organizing_only',
    'num_courts', 1, 'starts_at', (now() + interval '7 days')::text, 'duration_minutes', 90));
  if e is null then raise exception using errcode='PT001', message='create_event returned null'; end if;
  raise notice 'OK create_events on: a plain member created a group event';
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"cf000001-0000-0000-0000-000000000001","role":"authenticated"}';
update community_permissions set create_events = false
  where community_id = (select id from communities where name='ToggleC' order by created_at desc limit 1);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"cf000002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare cid uuid := (select id from communities where name='ToggleC' order by created_at desc limit 1); gen uuid;
begin
  select id into gen from groups where community_id=cid and is_general;
  if can_create_event(gen) then
    raise exception using errcode='PT001', message='can_create_event should be false with the toggle off'; end if;
  begin
    perform create_event(jsonb_build_object(
      'group_id', gen, 'name', 'Blocked event', 'event_type', 'americano', 'specification', 'classic',
      'scoring_mode', 'points', 'scoring_value', 24, 'organizer_role', 'organizing_only',
      'num_courts', 1, 'starts_at', (now() + interval '7 days')::text, 'duration_minutes', 90));
    raise exception using errcode='PT001', message='create_event should be refused with the toggle off';
  exception when sqlstate 'P0001' then raise notice 'OK create_events off: RPC refused (%)', sqlerrm;
  end;
end $$;
reset role;

-- The admin is never constrained by the toggles, both now being off for them too.
set local role authenticated;
set local request.jwt.claims = '{"sub":"cf000001-0000-0000-0000-000000000001","role":"authenticated"}';
update community_permissions set create_groups = false
  where community_id = (select id from communities where name='ToggleC' order by created_at desc limit 1);
do $$
declare cid uuid := (select id from communities where name='ToggleC' order by created_at desc limit 1); gen uuid;
begin
  select id into gen from groups where community_id=cid and is_general;
  if not can_create_group(cid) then
    raise exception using errcode='PT001', message='an admin must be able to create groups with the toggle off'; end if;
  if not can_create_event(gen) then
    raise exception using errcode='PT001', message='an admin must be able to create events with the toggle off'; end if;
  perform create_group(cid, 'AdminGroup');
  raise notice 'OK an admin is never constrained by the member toggles';
end $$;
reset role;
rollback;
