-- 0108 (UX Audit — Groups, plan PR 2):
--   departures are recorded on every exit and cleared on rejoin; group_member_list shows both;
--   archive_group cancels upcoming events (notifying players), retires series, and refuses the
--   community's last active group whichever it is; my_groups hides archived groups unless an
--   admin asks for them.
-- 'PT001' = "expected behaviour did not hold" sentinel; the RPCs raise P0001.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e1080001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gd-a@x.com'),
  ('e1080002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gd-b@x.com'),
  ('e1080003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gd-c@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e1080001-0000-0000-0000-000000000001','gd-a@x.com','+351901080001','GdAdmin'),
  ('e1080002-0000-0000-0000-000000000002','gd-b@x.com','+351901080002','GdMember'),
  ('e1080003-0000-0000-0000-000000000003','gd-c@x.com','+351901080003','GdOther') on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1080001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('GDepart','club','PT','public') as cid \gset
reset role;
insert into community_subscriptions (community_id, plan_id) values (:'cid', 'community_pro')
  on conflict (community_id) do update set plan_id='community_pro';
insert into community_members (community_id, user_id, role) values
  (:'cid','e1080002-0000-0000-0000-000000000002','member'),
  (:'cid','e1080003-0000-0000-0000-000000000003','member') on conflict do nothing;
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1080001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_group(:'cid','GdPublic',null,false) as g \gset
reset role;
select set_config('test.g', :'g', false), set_config('test.cid', :'cid', false);

-- (1) B leaves: a departure is recorded, the list shows B greyscale-able (is_member=false).
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1080002-0000-0000-0000-000000000002","role":"authenticated"}';
select join_group(:'g', true);
select leave_group(:'g');
reset role;
do $$ begin
  if not exists (select 1 from group_departures where group_id=current_setting('test.g')::uuid
                 and user_id='e1080002-0000-0000-0000-000000000002') then
    raise exception using errcode='PT001', message='leaving should record a departure'; end if;
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1080001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  if not exists (select 1 from group_member_list(current_setting('test.g')::uuid)
                 where user_id='e1080002-0000-0000-0000-000000000002' and not is_member and left_at is not null) then
    raise exception using errcode='PT001', message='group_member_list should show the departed member'; end if;
  if not exists (select 1 from group_member_list(current_setting('test.g')::uuid)
                 where user_id='e1080001-0000-0000-0000-000000000001' and is_member) then
    raise exception using errcode='PT001', message='group_member_list should show current members'; end if;
  raise notice 'OK departure recorded and listed';
end $$;
reset role;

-- (2) A community member NOT in the public group can read the list (UX-GRP-02 preview avatars).
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1080003-0000-0000-0000-000000000003","role":"authenticated"}';
do $$ begin
  if (select count(*) from group_member_list(current_setting('test.g')::uuid)) < 1 then
    raise exception using errcode='PT001', message='a community member should read a public group list'; end if;
  raise notice 'OK public preview can read the list';
end $$;

-- (3) B rejoins: the departure is cleared.
set local request.jwt.claims = '{"sub":"e1080002-0000-0000-0000-000000000002","role":"authenticated"}';
select join_group(:'g', true);
reset role;
do $$ begin
  if exists (select 1 from group_departures where group_id=current_setting('test.g')::uuid
             and user_id='e1080002-0000-0000-0000-000000000002') then
    raise exception using errcode='PT001', message='rejoining should clear the departure'; end if;
  raise notice 'OK rejoin clears the departure';
end $$;

-- (4) Community removal (remove_member) is an exit too.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1080001-0000-0000-0000-000000000001","role":"authenticated"}';
select remove_member(:'cid', 'e1080002-0000-0000-0000-000000000002');
reset role;
do $$ begin
  if not exists (select 1 from group_departures where group_id=current_setting('test.g')::uuid
                 and user_id='e1080002-0000-0000-0000-000000000002') then
    raise exception using errcode='PT001', message='community removal should record a group departure'; end if;
  raise notice 'OK community removal recorded as a departure';
end $$;

-- (5) Archive: an upcoming event is cancelled and its confirmed player notified; a past one is
-- untouched; the series stops; C (a player) gets event_cancelled.
do $$
declare g uuid := current_setting('test.g')::uuid; up uuid; past uuid; s uuid;
begin
  insert into event_series (group_id, organizer_id, day_of_week, start_time, duration_minutes, invite_lead_days)
  values (g, 'e1080001-0000-0000-0000-000000000001', 3, '18:00', 90, 3) returning id into s;
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts, starts_at,
                      duration_minutes, organizer_role, name, status, is_private)
  values (g, 'e1080001-0000-0000-0000-000000000001', 'americano', 'classic', 'points', 1, now() + interval '2 day',
          90, 'organizing_and_playing', 'GdUpcoming', 'scheduled', false) returning id into up;
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts, starts_at,
                      duration_minutes, organizer_role, name, status, is_private)
  values (g, 'e1080001-0000-0000-0000-000000000001', 'americano', 'classic', 'points', 1, now() - interval '2 day',
          90, 'organizing_and_playing', 'GdPast', 'completed', false) returning id into past;
  insert into event_participants (event_id, user_id, status) values (up, 'e1080003-0000-0000-0000-000000000003', 'confirmed');
  perform set_config('test.up', up::text, false);
  perform set_config('test.past', past::text, false);
  perform set_config('test.s', s::text, false);
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1080001-0000-0000-0000-000000000001","role":"authenticated"}';
select archive_group(:'g');
reset role;
do $$ begin
  if (select status from events where id=current_setting('test.up')::uuid) <> 'cancelled' then
    raise exception using errcode='PT001', message='archive should cancel the upcoming event'; end if;
  if (select status from events where id=current_setting('test.past')::uuid) <> 'completed' then
    raise exception using errcode='PT001', message='archive must not touch a past event'; end if;
  if (select is_active from event_series where id=current_setting('test.s')::uuid) then
    raise exception using errcode='PT001', message='archive should retire the series'; end if;
  if not exists (select 1 from notifications where user_id='e1080003-0000-0000-0000-000000000003'
                 and type='event_cancelled' and event_id=current_setting('test.up')::uuid) then
    raise exception using errcode='PT001', message='the confirmed player should be told'; end if;
  raise notice 'OK archive cancels upcoming events, retires the series, notifies';
end $$;

-- (6) my_groups: A sees the archived group only on request.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1080001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  if exists (select 1 from my_groups() where group_id=current_setting('test.g')::uuid) then
    raise exception using errcode='PT001', message='my_groups must hide archived groups by default'; end if;
  if not exists (select 1 from my_groups(auth.uid(), true)
                 where group_id=current_setting('test.g')::uuid and archived_at is not null) then
    raise exception using errcode='PT001', message='an admin asking for archived groups should get them'; end if;
  raise notice 'OK my_groups archived opt-in';
end $$;

-- (7) The general group is now the last active one: archiving it is refused.
do $$ begin
  begin
    perform archive_group((select id from groups where community_id=current_setting('test.cid')::uuid and is_general));
    raise exception using errcode='PT001', message='the last active group must not be archived';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%last_active_group%' then raise exception using errcode='PT001', message='wrong code: '||sqlerrm; end if;
    raise notice 'OK last active group guarded (%)', sqlerrm;
  end;
end $$;
reset role;
rollback;
