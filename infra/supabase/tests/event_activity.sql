-- JM-40: event_activity table. Since 0122 (D15/B11) every row is written server-side: the
-- client-callable log_event_activity RPC is gone, _log_activity is internal, and the player's own
-- actions are logged by triggers. Verifies: no client write path, the action vocabulary CHECK,
-- trigger-stamped actors, and organizer-only read RLS. 'PT001' = "expected behaviour did not hold".
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
  -- The forgeable writer is gone and the internal one is closed to clients.
  if to_regprocedure('public.log_event_activity(uuid, text, jsonb)') is not null then
    raise exception using errcode='PT001', message='log_event_activity must be dropped'; end if;
  if has_function_privilege('authenticated', 'public._log_activity(uuid, uuid, text, jsonb)', 'execute') then
    raise exception using errcode='PT001', message='_log_activity must not be executable by authenticated'; end if;

  -- Seed a private group-less event (fixture setup, not under test); u2 is invited.
  perform set_config('role','postgres',true);
  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    null, u1, 'americano', 'classic', 'points',
    1, now() + interval '2 day', 90, 'organizing_only', 'ActEv', 'scheduled', true
  ) returning id into ev;
  insert into event_invitations (event_id, invitee_id, invited_by) values (ev, u2, u1);

  -- ---- As U2: a direct insert is refused (no insert policy) ----
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"f0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  begin
    insert into event_activity (event_id, actor_id, action) values (ev, u1, 'removed');
    raise exception using errcode='PT001', message='a client insert into event_activity must fail';
  exception
    when sqlstate 'PT001' then raise;
    when others then null;
  end;
  raise notice 'OK client: no direct write';

  -- ---- As U2: joining logs 'joined' with the player as actor (trigger) ----
  perform join_event(ev);
  perform set_config('role','postgres',true);
  select count(*) into n from event_activity where event_id = ev and action = 'joined' and actor_id = u2;
  if n <> 1 then
    raise exception using errcode='PT001', message='expected 1 joined row stamped with the player, got '||n;
  end if;
  raise notice 'OK trigger: joined logged (actor = player)';

  -- ---- The vocabulary CHECK refuses an unknown action ----
  begin
    insert into event_activity (event_id, actor_id, action) values (ev, u1, 'bogus');
    raise exception using errcode='PT001', message='bogus action should violate event_activity_action_check';
  exception
    when sqlstate 'PT001' then raise;
    when check_violation then null;
  end;
  raise notice 'OK check: bogus action refused';

  -- ---- Read visibility: organizer-only RLS ----
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"f0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  select count(*) into n from event_activity where event_id = ev;
  if n <> 0 then
    raise exception using errcode='PT001', message='participant should read 0 activity rows (RLS), got '||n;
  end if;
  raise notice 'OK rls: participant reads 0 rows';

  -- As U1 (organizer): reads the invited + joined rows.
  perform set_config('request.jwt.claims','{"sub":"f0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  select count(*) into n from event_activity where event_id = ev;
  if n < 2 then
    raise exception using errcode='PT001', message='organizer should read the log, got '||n;
  end if;
  raise notice 'OK rls: organizer reads the log';

  raise notice 'OK event_activity';
end $$;
rollback;
