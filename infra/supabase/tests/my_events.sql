-- my_events: viewer's upcoming organized/going events; excludes past, cancelled, deleted,
-- not-mine; respects the all/organizing/going filter and paging.
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
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e4000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('MeC','club','PT','public');

  perform set_config('role','postgres',true);
  insert into community_subscriptions (community_id, plan_id)
    values (cid,'basic') on conflict (community_id) do update set plan_id='basic';
  insert into groups (community_id, name, is_private) values (cid,'MeG',false) returning id into gid;

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

  if not exists (select 1 from my_events('organizing',50,0) where id = ev_org) then
    raise exception using errcode='PT001', message='organized event missing from organizing'; end if;
  if exists (select 1 from my_events('organizing',50,0) where id = ev_going) then
    raise exception using errcode='PT001', message='going event leaked into organizing'; end if;

  if not exists (select 1 from my_events('going',50,0) where id = ev_going) then
    raise exception using errcode='PT001', message='going event missing from going'; end if;
  if exists (select 1 from my_events('going',50,0) where id = ev_org) then
    raise exception using errcode='PT001', message='organized event leaked into going'; end if;

  if (select count(*) from my_events('all',1,0)) <> 1 then
    raise exception using errcode='PT001', message='limit 1 did not return exactly one row'; end if;
  if (select count(*) from my_events('all',50,2)) <> 0 then
    raise exception using errcode='PT001', message='offset past the result set returned rows'; end if;

  raise notice 'OK my_events';
end $$;
rollback;
