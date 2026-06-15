-- notifications: RLS (own-row), producer triggers, and partner_request_summary.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f7000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','n1@x.com'),
  ('f7000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','n2@x.com'),
  ('f7000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','n3@x.com')
  on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f7000001-0000-0000-0000-000000000001','n1@x.com','+351900040001','Alice N'),
  ('f7000002-0000-0000-0000-000000000002','n2@x.com','+351900040002','Bob N'),
  ('f7000003-0000-0000-0000-000000000003','n3@x.com','+351900040003','Carol N')
  on conflict do nothing;

do $$
declare a constant uuid := 'f7000001-0000-0000-0000-000000000001';
  b constant uuid := 'f7000002-0000-0000-0000-000000000002';
begin
  -- Seed a row for Alice via definer bypass (insert as superuser, RLS not yet in role context).
  insert into notifications (user_id, type, actor_id, actor_name) values (a, 'follow', b, 'Bob N');

  -- Act as Bob: must NOT see Alice's notification.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', b), true);
  if exists (select 1 from notifications where user_id = a) then
    raise exception using errcode='PT001', message='RLS: other user notification visible'; end if;

  -- Act as Alice: sees her own, can mark read, can delete.
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', a), true);
  if not exists (select 1 from notifications where user_id = a and type='follow') then
    raise exception using errcode='PT001', message='RLS: own notification not visible'; end if;
  update notifications set read_at = now() where user_id = a;
  if exists (select 1 from notifications where user_id = a and read_at is null) then
    raise exception using errcode='PT001', message='mark-read failed'; end if;
  delete from notifications where user_id = a;
  if exists (select 1 from notifications where user_id = a) then
    raise exception using errcode='PT001', message='delete-own failed'; end if;

  raise notice 'OK notifications_rls';
end $$;
rollback;

-- partner_request_summary: counts pending event partner-requests for events I organize.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f7000010-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pq1@x.com'),
  ('f7000011-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pq2@x.com'),
  ('f7000012-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pq3@x.com')
  on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f7000010-0000-0000-0000-000000000010','pq1@x.com','+351900040010','Org PQ'),
  ('f7000011-0000-0000-0000-000000000011','pq2@x.com','+351900040011','Req PQ'),
  ('f7000012-0000-0000-0000-000000000012','pq3@x.com','+351900040012','Tgt PQ')
  on conflict do nothing;

do $$
declare org constant uuid := 'f7000010-0000-0000-0000-000000000010';
  req constant uuid := 'f7000011-0000-0000-0000-000000000011';
  tgt constant uuid := 'f7000012-0000-0000-0000-000000000012';
  v_event uuid;
  v_count int;
begin
  insert into events (organizer_id, event_type, specification, scoring_mode, scoring_value,
                      manual_location_name, has_location, starts_at, duration_minutes,
                      organizer_role, name, status, num_courts, is_private)
    values (org, 'americano', 'mixed', 'points', 24, 'Court A', true, now() + interval '1 day',
            90, 'organizing_and_playing', 'PQ Event', 'scheduled', 2, true)
    returning id into v_event;
  insert into partner_requests (event_id, requester_id, target_id, status)
    values (v_event, req, tgt, 'pending');

  -- partner_request_summary counts requests addressed to ME (the target), per 0063 scope fix.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', tgt), true);
  select partner_request_summary() into v_count;
  if v_count <> 1 then
    raise exception using errcode='PT001', message=format('target summary expected 1 got %s', v_count); end if;

  -- The organizer (not the target) counts 0 via this summary.
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', org), true);
  select partner_request_summary() into v_count;
  if v_count <> 0 then
    raise exception using errcode='PT001', message=format('organizer summary expected 0 got %s', v_count); end if;

  raise notice 'OK partner_request_summary';
end $$;
rollback;

-- producer triggers: follow fires + self-suppressed + block-suppressed; participant-join fans out.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f7000020-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tg1@x.com'),
  ('f7000021-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tg2@x.com'),
  ('f7000022-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tg3@x.com')
  on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f7000020-0000-0000-0000-000000000020','tg1@x.com','+351900040020','Follower One'),
  ('f7000021-0000-0000-0000-000000000021','tg2@x.com','+351900040021','Joiner Two'),
  ('f7000022-0000-0000-0000-000000000022','tg3@x.com','+351900040022','Blocker Three')
  on conflict do nothing;

do $$
declare f1 constant uuid := 'f7000020-0000-0000-0000-000000000020';
  j2 constant uuid := 'f7000021-0000-0000-0000-000000000021';
  b3 constant uuid := 'f7000022-0000-0000-0000-000000000022';
  v_event uuid;
begin
  -- follow fires: f1 follows j2 -> j2 gets a 'follow' notification with actor snapshot.
  insert into follows (follower_id, followee_id) values (f1, j2);
  if not exists (select 1 from notifications
                  where user_id = j2 and type = 'follow' and actor_id = f1 and actor_name = 'Follower One') then
    raise exception using errcode='PT001', message='follow trigger did not fire'; end if;

  -- block-suppressed: b3 blocks j2; b3 follows j2 -> NO notification to j2.
  insert into blocks (blocker_id, blocked_id) values (b3, j2);
  insert into follows (follower_id, followee_id) values (b3, j2);
  if exists (select 1 from notifications where user_id = j2 and actor_id = b3) then
    raise exception using errcode='PT001', message='block did not suppress follow notification'; end if;

  -- participant-join fan-out: j2 joins an event -> follower f1 gets 'follow_joined_event'.
  insert into events (organizer_id, event_type, specification, scoring_mode, scoring_value,
                      manual_location_name, has_location, num_courts, is_private, starts_at,
                      duration_minutes, organizer_role, name, status)
    values (b3, 'americano', 'mixed', 'points', 24, 'Court B', true, 2, true, now() + interval '1 day',
            90, 'organizing_and_playing', 'Join Event', 'scheduled')
    returning id into v_event;
  insert into event_participants (event_id, user_id, status) values (v_event, j2, 'confirmed');
  if not exists (select 1 from notifications
                  where user_id = f1 and type = 'follow_joined_event' and event_id = v_event
                        and entity_name = 'Join Event') then
    raise exception using errcode='PT001', message='participant-join fan-out did not reach follower'; end if;

  raise notice 'OK notifications_triggers';
end $$;
rollback;
