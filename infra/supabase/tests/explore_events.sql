-- explore_events: upcoming non-private events in public groups; excludes past, private, completed,
-- and events the viewer organizes/participates in.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e3000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ee1@x.com'),
  ('e3000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ee2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e3000001-0000-0000-0000-000000000001','ee1@x.com','+351900400001','EeOrg'),
  ('e3000002-0000-0000-0000-000000000002','ee2@x.com','+351900400002','EeViewer') on conflict do nothing;

do $$
declare cid uuid; gid uuid; ev_up uuid; ev_past uuid; ev_priv uuid; ev_done uuid;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e3000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('EeC','club','PT','public');

  perform set_config('role','postgres',true);
  -- starter plan allows only 1 group; upgrade to basic (limit=3) so we can add a test group.
  insert into community_subscriptions (community_id, plan_id)
    values (cid,'basic') on conflict (community_id) do update set plan_id='basic';
  insert into groups (community_id, name, is_private) values (cid,'EeG',false) returning id into gid;
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name, is_private)
    values (gid,'e3000001-0000-0000-0000-000000000001','americano','classic','points',2,
            now() + interval '2 days',60,'organizing_only','EeUpcoming',false) returning id into ev_up;
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name, is_private)
    values (gid,'e3000001-0000-0000-0000-000000000001','americano','classic','points',2,
            now() - interval '2 days',60,'organizing_only','EePast',false) returning id into ev_past;
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name, is_private)
    values (gid,'e3000001-0000-0000-0000-000000000001','americano','classic','points',2,
            now() + interval '3 days',60,'organizing_only','EePriv',true) returning id into ev_priv;
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name, is_private, status)
    values (gid,'e3000001-0000-0000-0000-000000000001','americano','classic','points',2,
            now() + interval '4 days',60,'organizing_only','EeDone',false,'completed') returning id into ev_done;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e3000002-0000-0000-0000-000000000002","role":"authenticated"}',true);

  if not exists (select 1 from explore_events(50,0) where (event).id = ev_up) then
    raise exception using errcode='PT001', message='upcoming public event not surfaced';
  end if;
  if exists (select 1 from explore_events(50,0) where (event).id = ev_past) then
    raise exception using errcode='PT001', message='past event surfaced';
  end if;
  if exists (select 1 from explore_events(50,0) where (event).id = ev_priv) then
    raise exception using errcode='PT001', message='private event surfaced';
  end if;
  if exists (select 1 from explore_events(50,0) where (event).id = ev_done) then
    raise exception using errcode='PT001', message='completed event surfaced';
  end if;

  perform set_config('request.jwt.claims','{"sub":"e3000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  if exists (select 1 from explore_events(50,0) where (event).id = ev_up) then
    raise exception using errcode='PT001', message='own event surfaced to organizer';
  end if;

  perform set_config('role','postgres',true);
  insert into event_participants (event_id, user_id, status) values (ev_up,'e3000002-0000-0000-0000-000000000002','confirmed') on conflict do nothing;
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e3000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  if exists (select 1 from explore_events(50,0) where (event).id = ev_up) then
    raise exception using errcode='PT001', message='joined event surfaced';
  end if;

  raise notice 'OK explore_events';
end $$;
rollback;
