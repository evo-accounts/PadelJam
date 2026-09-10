-- my_events: viewer's current organized/going events; excludes long-past, cancelled, deleted,
-- not-mine; respects the all/organizing/going filter and paging.
--
-- The grace window (0090) is the interesting part: a scheduled event stays listed through its
-- booked slot plus three hours, so it does NOT disappear at the moment it is due to start —
-- which is when the organizer opens the tab to start it. Cases below pin both ends of that
-- window and prove it is measured from the slot's END, not from starts_at.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e4000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','me1@x.com'),
  ('e4000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','me2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e4000001-0000-0000-0000-000000000001','me1@x.com','+351900500001','MeViewer'),
  ('e4000002-0000-0000-0000-000000000002','me2@x.com','+351900500002','MeOther') on conflict do nothing;

do $$
declare cid uuid; gid uuid;
  ev_org uuid; ev_going uuid; ev_past uuid; ev_cancel uuid; ev_other uuid;
  ev_just_started uuid; ev_going_started uuid; ev_grace_in uuid; ev_grace_out uuid;
  ev_long_slot uuid; ev_live_old uuid;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e4000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('MeC','club','PT','public');

  perform set_config('role','postgres',true);
  insert into community_subscriptions (community_id, plan_id)
    values (cid,'basic') on conflict (community_id) do update set plan_id='basic';
  insert into groups (community_id, name, is_private) values (cid,'MeG',false) returning id into gid;

  -- Plainly upcoming: organized, and joined-as-going.
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name)
    values (gid,'e4000001-0000-0000-0000-000000000001','americano','classic','points',2,
            now() + interval '2 days',60,'organizing_only','MeOrg') returning id into ev_org;
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name)
    values (gid,'e4000002-0000-0000-0000-000000000002','americano','classic','points',2,
            now() + interval '3 days',60,'organizing_only','MeGoing') returning id into ev_going;
  insert into event_participants (event_id, user_id, status)
    values (ev_going,'e4000001-0000-0000-0000-000000000001','confirmed') on conflict do nothing;

  -- Long past, never started: aged out of the grace window.
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name)
    values (gid,'e4000001-0000-0000-0000-000000000001','americano','classic','points',2,
            now() - interval '2 days',60,'organizing_only','MePast') returning id into ev_past;
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name, status)
    values (gid,'e4000001-0000-0000-0000-000000000001','americano','classic','points',2,
            now() + interval '2 days',60,'organizing_only','MeCancel','cancelled') returning id into ev_cancel;
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name)
    values (gid,'e4000002-0000-0000-0000-000000000002','americano','classic','points',2,
            now() + interval '5 days',60,'organizing_only','MeOther') returning id into ev_other;

  -- THE REGRESSION: start time just passed, nobody has pressed start. Must still be listed.
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name)
    values (gid,'e4000001-0000-0000-0000-000000000001','americano','classic','points',2,
            now() - interval '10 minutes',60,'organizing_only','MeJustStarted') returning id into ev_just_started;
  -- Same, for a participant rather than the organizer — the grace window is not organizer-only.
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name)
    values (gid,'e4000002-0000-0000-0000-000000000002','americano','classic','points',2,
            now() - interval '30 minutes',60,'organizing_only','MeGoingStarted') returning id into ev_going_started;
  insert into event_participants (event_id, user_id, status)
    values (ev_going_started,'e4000001-0000-0000-0000-000000000001','confirmed') on conflict do nothing;

  -- Inside the window: 60min slot ended 2h ago, grace is 3h.
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name)
    values (gid,'e4000001-0000-0000-0000-000000000001','americano','classic','points',2,
            now() - interval '3 hours',60,'organizing_only','MeGraceIn') returning id into ev_grace_in;
  -- Outside it: same 60min slot ended 4h ago. A never-started event must not linger.
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name)
    values (gid,'e4000001-0000-0000-0000-000000000001','americano','classic','points',2,
            now() - interval '5 hours',60,'organizing_only','MeGraceOut') returning id into ev_grace_out;
  -- Started 4h ago but booked for 6h, so the slot is still running. Included ONLY because the
  -- window is measured from starts_at + duration; a flat 3h-from-start rule would drop it.
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name)
    values (gid,'e4000001-0000-0000-0000-000000000001','americano','classic','points',2,
            now() - interval '4 hours',360,'organizing_only','MeLongSlot') returning id into ev_long_slot;
  -- in_progress ignores the clock entirely: a live event is live until it is finished.
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name, status)
    values (gid,'e4000001-0000-0000-0000-000000000001','americano','classic','points',2,
            now() - interval '3 days',60,'organizing_only','MeLiveOld','in_progress') returning id into ev_live_old;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e4000001-0000-0000-0000-000000000001","role":"authenticated"}',true);

  if not exists (select 1 from my_events('all',50,0) where id = ev_org) then
    raise exception using errcode='PT001', message='organized upcoming event missing from all'; end if;
  if not exists (select 1 from my_events('all',50,0) where id = ev_going) then
    raise exception using errcode='PT001', message='going event missing from all'; end if;
  if exists (select 1 from my_events('all',50,0) where id = ev_past) then
    raise exception using errcode='PT001', message='past event surfaced'; end if;
  if exists (select 1 from my_events('all',50,0) where id = ev_cancel) then
    raise exception using errcode='PT001', message='cancelled event surfaced'; end if;
  if exists (select 1 from my_events('all',50,0) where id = ev_other) then
    raise exception using errcode='PT001', message='unrelated event surfaced'; end if;

  -- Grace window.
  if not exists (select 1 from my_events('all',50,0) where id = ev_just_started) then
    raise exception using errcode='PT001', message='event vanished the moment its start time passed'; end if;
  if not exists (select 1 from my_events('all',50,0) where id = ev_going_started) then
    raise exception using errcode='PT001', message='grace window did not apply to a going event'; end if;
  if not exists (select 1 from my_events('all',50,0) where id = ev_grace_in) then
    raise exception using errcode='PT001', message='event inside the grace window was dropped'; end if;
  if exists (select 1 from my_events('all',50,0) where id = ev_grace_out) then
    raise exception using errcode='PT001', message='never-started event lingered past the grace window'; end if;
  if not exists (select 1 from my_events('all',50,0) where id = ev_long_slot) then
    raise exception using errcode='PT001', message='grace window ignored duration_minutes'; end if;
  if not exists (select 1 from my_events('all',50,0) where id = ev_live_old) then
    raise exception using errcode='PT001', message='long-running in_progress event was dropped'; end if;

  -- A just-started event sorts ABOVE the merely upcoming one: it is the row the organizer
  -- opened the tab for, so it must not be buried under next week's fixtures.
  if (select min(rn) from (select id, row_number() over (order by starts_at) rn
                           from my_events('organizing',50,0)) s where id = ev_just_started)
     >= (select min(rn) from (select id, row_number() over (order by starts_at) rn
                              from my_events('organizing',50,0)) s where id = ev_org) then
    raise exception using errcode='PT001', message='just-started event did not sort above an upcoming one'; end if;

  if not exists (select 1 from my_events('organizing',50,0) where id = ev_org) then
    raise exception using errcode='PT001', message='organized event missing from organizing'; end if;
  if exists (select 1 from my_events('organizing',50,0) where id = ev_going) then
    raise exception using errcode='PT001', message='going event leaked into organizing'; end if;
  if exists (select 1 from my_events('organizing',50,0) where id = ev_going_started) then
    raise exception using errcode='PT001', message='going grace event leaked into organizing'; end if;

  if not exists (select 1 from my_events('going',50,0) where id = ev_going) then
    raise exception using errcode='PT001', message='going event missing from going'; end if;
  if not exists (select 1 from my_events('going',50,0) where id = ev_going_started) then
    raise exception using errcode='PT001', message='going grace event missing from going'; end if;
  if exists (select 1 from my_events('going',50,0) where id = ev_org) then
    raise exception using errcode='PT001', message='organized event leaked into going'; end if;
  if exists (select 1 from my_events('going',50,0) where id = ev_just_started) then
    raise exception using errcode='PT001', message='organized grace event leaked into going'; end if;

  -- Exact totals, so a future widening of the filter cannot pass unnoticed.
  -- organizing: MeOrg, MeJustStarted, MeGraceIn, MeLongSlot, MeLiveOld.
  if (select count(*) from my_events('organizing',50,0)) <> 5 then
    raise exception using errcode='PT001', message='organizing returned an unexpected number of rows'; end if;
  -- going: MeGoing, MeGoingStarted.
  if (select count(*) from my_events('going',50,0)) <> 2 then
    raise exception using errcode='PT001', message='going returned an unexpected number of rows'; end if;
  if (select count(*) from my_events('all',50,0)) <> 7 then
    raise exception using errcode='PT001', message='all returned an unexpected number of rows'; end if;

  if (select count(*) from my_events('all',1,0)) <> 1 then
    raise exception using errcode='PT001', message='limit 1 did not return exactly one row'; end if;
  if (select count(*) from my_events('all',50,7)) <> 0 then
    raise exception using errcode='PT001', message='offset past the result set returned rows'; end if;

  -- unknown filter normalizes to 'all'.
  if not exists (select 1 from my_events('bogus',50,0) where id = ev_org)
     or not exists (select 1 from my_events('bogus',50,0) where id = ev_going) then
    raise exception using errcode='PT001', message='unknown filter did not behave like all'; end if;

  raise notice 'OK my_events';
end $$;
rollback;
