-- incoming_partner_requests: the request TARGET sees the event request; others see nothing.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f8000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pq1@x.com'),
  ('f8000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pq2@x.com'),
  ('f8000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pq3@x.com')
  on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f8000001-0000-0000-0000-000000000001','pq1@x.com','+351900050001','Org Q'),
  ('f8000002-0000-0000-0000-000000000002','pq2@x.com','+351900050002','Req Q'),
  ('f8000003-0000-0000-0000-000000000003','pq3@x.com','+351900050003','Tgt Q')
  on conflict do nothing;

do $$
declare org constant uuid := 'f8000001-0000-0000-0000-000000000001';
  req constant uuid := 'f8000002-0000-0000-0000-000000000002';
  tgt constant uuid := 'f8000003-0000-0000-0000-000000000003';
  v_event uuid;
  v_count int;
  v_kind text;
  v_requester text;
begin
  insert into events (organizer_id, event_type, specification, scoring_mode, scoring_value,
                      manual_location_name, has_location, num_courts, is_private, starts_at,
                      duration_minutes, organizer_role, name, status)
    values (org, 'americano', 'mixed', 'points', 24, 'Court Q', true, 2, true, now() + interval '1 day',
            90, 'organizing_and_playing', 'Queue Event', 'scheduled')
    returning id into v_event;
  insert into partner_requests (event_id, requester_id, target_id, status)
    values (v_event, req, tgt, 'pending');

  -- The TARGET (who can accept/decline) sees exactly one row, kind=event, requester embedded.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', tgt), true);
  select count(*) into v_count from incoming_partner_requests();
  if v_count <> 1 then
    raise exception using errcode='PT001', message=format('target expected 1 row got %s', v_count); end if;
  select kind, requester_name into v_kind, v_requester from incoming_partner_requests();
  if v_kind <> 'event' or v_requester <> 'Req Q' then
    raise exception using errcode='PT001', message=format('row mismatch kind=%s requester=%s', v_kind, v_requester); end if;

  -- The organizer (not the target) sees nothing via this aggregate.
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', org), true);
  select count(*) into v_count from incoming_partner_requests();
  if v_count <> 0 then
    raise exception using errcode='PT001', message=format('organizer expected 0 got %s', v_count); end if;

  raise notice 'OK incoming_partner_requests';
end $$;
rollback;
