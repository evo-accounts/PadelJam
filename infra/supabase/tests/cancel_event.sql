-- 5G-6: cancel_event RPC (standard + recurring) + event_cancelled notification.
-- Verifies organizer-gating, only_this/this_and_upcoming scopes, series deactivation,
-- confirmed-member notifications, and the not_cancellable / forbidden guards.
-- 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('c0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cancel-u1@x.com'),
  ('c0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cancel-u2@x.com'),
  ('c0000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cancel-m1@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('c0000001-0000-0000-0000-000000000001','cancel-u1@x.com','+351900500001','CancelOrganizer'),
  ('c0000002-0000-0000-0000-000000000002','cancel-u2@x.com','+351900500002','CancelNonOrganizer'),
  ('c0000003-0000-0000-0000-000000000003','cancel-m1@x.com','+351900500003','CancelMember') on conflict do nothing;

do $$
declare
  u1  uuid := 'c0000001-0000-0000-0000-000000000001';
  u2  uuid := 'c0000002-0000-0000-0000-000000000002';
  m1  uuid := 'c0000003-0000-0000-0000-000000000003';
  cid uuid;
  g   uuid;
  ev1 uuid;
  ev2 uuid;
  ev3 uuid;
  s   uuid;
  st  text;
  active boolean;
  del timestamptz;
  n   integer;
begin
  -- ---- As U1: create the community (owner) ----
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"c0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('CancelC','club','PT','public');

  -- ---- Seed events + series + participants under role postgres (fixture, bypasses RLS) ----
  perform set_config('role','postgres',true);
  select id into g from groups where community_id = cid order by created_at limit 1;

  -- ev1: standard scheduled event
  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    g, u1, 'americano', 'classic', 'points',
    1, now() + interval '1 day', 90, 'organizing_and_playing', 'CancelEv1', 'scheduled', false
  ) returning id into ev1;

  -- s: event_series
  insert into event_series (group_id, organizer_id, day_of_week, start_time, duration_minutes, invite_lead_days)
  values (g, u1, 3, '18:00', 90, 3) returning id into s;

  -- ev2: recurring scheduled event in series s
  insert into events (
    group_id, series_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    g, s, u1, 'americano', 'classic', 'points',
    1, now() + interval '2 day', 90, 'organizing_and_playing', 'CancelEv2', 'scheduled', false
  ) returning id into ev2;

  -- ev3: fresh standard scheduled event for the forbidden check
  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    g, u1, 'americano', 'classic', 'points',
    1, now() + interval '3 day', 90, 'organizing_and_playing', 'CancelEv3', 'scheduled', false
  ) returning id into ev3;

  -- M1 confirmed on ev1 and ev2
  insert into event_participants (event_id, user_id, status) values
    (ev1, m1, 'confirmed'),
    (ev2, m1, 'confirmed');

  -- ============================================================
  -- As U1 (organizer)
  -- ============================================================
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"c0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);

  -- (1) only_this: ev1 cancelled + exactly one event_cancelled notification for M1 on ev1.
  perform cancel_event(ev1, 'only_this');
  perform set_config('role','postgres',true);
  select status into st from events where id = ev1;
  if st <> 'cancelled' then
    raise exception using errcode='PT001', message='expected ev1.status=cancelled, got '||coalesce(st,'<null>');
  end if;
  select count(*) into n from notifications
    where type='event_cancelled' and user_id=m1 and event_id=ev1;
  if n <> 1 then
    raise exception using errcode='PT001', message='expected 1 event_cancelled notification for M1 on ev1, got '||n;
  end if;
  perform set_config('role','authenticated',true);
  raise notice 'OK only_this: ev1 cancelled + 1 notification';

  -- (2) this_and_upcoming: ev2 cancelled, series s deactivated, notification for M1 on ev2.
  perform cancel_event(ev2, 'this_and_upcoming');
  perform set_config('role','postgres',true);
  select status into st from events where id = ev2;
  if st <> 'cancelled' then
    raise exception using errcode='PT001', message='expected ev2.status=cancelled, got '||coalesce(st,'<null>');
  end if;
  select is_active, deleted_at into active, del from event_series where id = s;
  if active <> false or del is null then
    raise exception using errcode='PT001', message='expected series s is_active=false + deleted_at set, got is_active='||active||' deleted_at='||coalesce(del::text,'<null>');
  end if;
  select count(*) into n from notifications
    where type='event_cancelled' and user_id=m1 and event_id=ev2;
  if n <> 1 then
    raise exception using errcode='PT001', message='expected 1 event_cancelled notification for M1 on ev2, got '||n;
  end if;
  perform set_config('role','authenticated',true);
  raise notice 'OK this_and_upcoming: ev2 cancelled + series deactivated + notification';

  -- (3) As U2 (non-organizer) on fresh scheduled ev3 -> forbidden.
  perform set_config('request.jwt.claims','{"sub":"c0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  begin
    perform cancel_event(ev3, 'only_this');
    raise exception using errcode='PT001', message='non-organizer should not be able to cancel an event';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('forbidden' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for non-organizer cancel: '||sqlerrm;
      end if;
  end;
  raise notice 'OK non-organizer: blocked with forbidden';

  -- (4) As U1: cancel ev1 again -> not_cancellable (already cancelled).
  perform set_config('request.jwt.claims','{"sub":"c0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  begin
    perform cancel_event(ev1, 'only_this');
    raise exception using errcode='PT001', message='re-cancelling ev1 should raise not_cancellable';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('not_cancellable' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for re-cancel: '||sqlerrm;
      end if;
  end;
  raise notice 'OK re-cancel: blocked with not_cancellable';

  raise notice 'OK cancel_event';
end $$;
rollback;
