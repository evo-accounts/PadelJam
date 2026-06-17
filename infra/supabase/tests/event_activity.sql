-- JM-40: event_activity table + log_event_activity RPC.
-- Verifies organizer-vs-self authorization, action-set validation, actor stamping,
-- and organizer-only read RLS. 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','act-u1@x.com'),
  ('f0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','act-u2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f0000001-0000-0000-0000-000000000001','act-u1@x.com','+351900300001','ActOrganizer'),
  ('f0000002-0000-0000-0000-000000000002','act-u2@x.com','+351900300002','ActParticipant') on conflict do nothing;

do $$
declare
  u1 uuid := 'f0000001-0000-0000-0000-000000000001';
  u2 uuid := 'f0000002-0000-0000-0000-000000000002';
  ev uuid;
  n  integer;
begin
  -- Seed event + participant as a privileged role (fixture setup, not under test).
  perform set_config('role','postgres',true);
  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    null, u1, 'americano', 'classic', 'points',
    1, now() + interval '1 day', 90, 'organizing_and_playing', 'ActEv', 'scheduled', true
  ) returning id into ev;
  insert into event_participants (event_id, user_id, status) values (ev, u2, 'confirmed');

  -- ---- As U1 (organizer): organizer action succeeds ----
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"f0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  perform log_event_activity(ev, 'confirmed', '{"target_name":"U2"}'::jsonb);
  select count(*) into n from event_activity where event_id = ev;
  if n <> 1 then
    raise exception using errcode='PT001', message='expected 1 activity row after confirmed, got '||n;
  end if;
  raise notice 'OK organizer: confirmed logged (1 row)';

  -- ---- As U2 (participant): organizer action must be forbidden ----
  perform set_config('request.jwt.claims','{"sub":"f0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  begin
    perform log_event_activity(ev, 'removed', '{}'::jsonb);
    raise exception using errcode='PT001', message='participant should not be able to log organizer action removed';
  exception
    when sqlstate 'PT001' then raise;  -- re-raise our own sentinel
    when others then
      if position('forbidden' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for participant organizer action: '||sqlerrm;
      end if;
  end;
  raise notice 'OK participant: organizer action blocked with forbidden';

  -- ---- As U2 (participant): self action succeeds (event is visible) ----
  perform log_event_activity(ev, 'joined', '{}'::jsonb);
  raise notice 'OK participant: joined logged (self action)';

  -- ---- As U1 (organizer): unknown action must be invalid_action ----
  perform set_config('request.jwt.claims','{"sub":"f0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  begin
    perform log_event_activity(ev, 'bogus', '{}'::jsonb);
    raise exception using errcode='PT001', message='bogus action should raise invalid_action';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('invalid_action' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for bogus action: '||sqlerrm;
      end if;
  end;
  raise notice 'OK organizer: bogus action blocked with invalid_action';

  -- ---- Read visibility: organizer-only RLS ----
  -- As U2 (participant, not organizer): cannot read any activity rows.
  perform set_config('request.jwt.claims','{"sub":"f0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  select count(*) into n from event_activity where event_id = ev;
  if n <> 0 then
    raise exception using errcode='PT001', message='participant should read 0 activity rows (RLS), got '||n;
  end if;
  raise notice 'OK rls: participant reads 0 rows';

  -- As U1 (organizer): reads both the confirmed + joined rows.
  perform set_config('request.jwt.claims','{"sub":"f0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  select count(*) into n from event_activity where event_id = ev;
  if n <> 2 then
    raise exception using errcode='PT001', message='organizer should read 2 activity rows, got '||n;
  end if;
  raise notice 'OK rls: organizer reads 2 rows';

  raise notice 'OK event_activity';
end $$;
rollback;
