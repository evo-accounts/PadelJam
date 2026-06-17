-- 5H-A: event_timer + set_event_timer RPC.
-- Verifies organizer-gated start/pause/resume/reset, duration = scoring_value*60,
-- and non-organizer forbidden. 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','timer-u1@x.com'),
  ('f0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','timer-u2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f0000001-0000-0000-0000-000000000001','timer-u1@x.com','+351900500001','TimerOrganizer'),
  ('f0000002-0000-0000-0000-000000000002','timer-u2@x.com','+351900500002','TimerNonOrganizer') on conflict do nothing;

do $$
declare
  u1  uuid := 'f0000001-0000-0000-0000-000000000001';
  u2  uuid := 'f0000002-0000-0000-0000-000000000002';
  ev  uuid;
  t   event_timer%rowtype;
begin
  -- ---- Seed a time-mode in-progress event under role postgres (fixture, bypasses RLS) ----
  -- Standalone event (group_id null -> is_private must be true per events_standalone_private).
  perform set_config('role','postgres',true);
  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode, scoring_value,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    null, u1, 'americano', 'classic', 'time', 15,
    1, now() + interval '1 day', 90, 'organizing_and_playing', 'TimerEv', 'in_progress', true
  ) returning id into ev;

  -- ============================================================
  -- As U1 (organizer): assertions 1-4
  -- ============================================================
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"f0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);

  -- (1) start -> running, duration 900, started_at not null.
  perform set_event_timer(ev,'start');
  perform set_config('role','postgres',true);
  select * into t from event_timer where event_id = ev;
  if t.status <> 'running' then
    raise exception using errcode='PT001', message='expected status running after start, got '||coalesce(t.status,'<null>');
  end if;
  if t.duration_seconds <> 900 then
    raise exception using errcode='PT001', message='expected duration_seconds 900 (15*60), got '||t.duration_seconds;
  end if;
  if t.started_at is null then
    raise exception using errcode='PT001', message='expected started_at not null after start';
  end if;
  raise notice 'OK start: running, duration 900, started_at set';

  -- (2) pause -> paused, paused_at not null.
  perform set_config('role','authenticated',true);
  perform set_event_timer(ev,'pause');
  perform set_config('role','postgres',true);
  select * into t from event_timer where event_id = ev;
  if t.status <> 'paused' then
    raise exception using errcode='PT001', message='expected status paused after pause, got '||coalesce(t.status,'<null>');
  end if;
  if t.paused_at is null then
    raise exception using errcode='PT001', message='expected paused_at not null after pause';
  end if;
  raise notice 'OK pause: paused, paused_at set';

  -- (3) resume -> running, paused_at null.
  perform set_config('role','authenticated',true);
  perform set_event_timer(ev,'resume');
  perform set_config('role','postgres',true);
  select * into t from event_timer where event_id = ev;
  if t.status <> 'running' then
    raise exception using errcode='PT001', message='expected status running after resume, got '||coalesce(t.status,'<null>');
  end if;
  if t.paused_at is not null then
    raise exception using errcode='PT001', message='expected paused_at null after resume';
  end if;
  raise notice 'OK resume: running, paused_at cleared';

  -- (4) reset -> idle, started_at null.
  perform set_config('role','authenticated',true);
  perform set_event_timer(ev,'reset');
  perform set_config('role','postgres',true);
  select * into t from event_timer where event_id = ev;
  if t.status <> 'idle' then
    raise exception using errcode='PT001', message='expected status idle after reset, got '||coalesce(t.status,'<null>');
  end if;
  if t.started_at is not null then
    raise exception using errcode='PT001', message='expected started_at null after reset';
  end if;
  raise notice 'OK reset: idle, started_at cleared';

  -- (5) As U2 (non-organizer) -> forbidden.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"f0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  begin
    perform set_event_timer(ev,'start');
    raise exception using errcode='PT001', message='non-organizer should not be able to control the timer';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('forbidden' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for non-organizer: '||sqlerrm;
      end if;
  end;
  raise notice 'OK non-organizer: blocked with forbidden';

  raise notice 'OK event_timer';
end $$;
rollback;
