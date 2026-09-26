-- A1: materialize_occurrence RPC — organizer materializes the next weekly occurrence.
-- Verifies: new scheduled event at +7d with copied config + invitations cloned as pending +
-- zero participants; idempotent re-call returns the same id; forbidden / series_inactive guards.
-- 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('a0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mat-u1@x.com'),
  ('a0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mat-u2@x.com'),
  ('a0000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mat-i1@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('a0000001-0000-0000-0000-000000000001','mat-u1@x.com','+351900600001','MatOrganizer'),
  ('a0000002-0000-0000-0000-000000000002','mat-u2@x.com','+351900600002','MatNonOrganizer'),
  ('a0000003-0000-0000-0000-000000000003','mat-i1@x.com','+351900600003','MatInvitee') on conflict do nothing;

do $$
declare
  u1  uuid := 'a0000001-0000-0000-0000-000000000001';
  u2  uuid := 'a0000002-0000-0000-0000-000000000002';
  i1  uuid := 'a0000003-0000-0000-0000-000000000003';
  cid uuid;
  g   uuid;
  s   uuid;
  s2  uuid;
  ev  uuid;
  ev_inactive uuid;
  std uuid;
  new1 uuid;
  new2 uuid;
  v_start timestamptz;
  v_name text;
  v_courts int;
  v_status text;
  n_part int;
  n_inv int;
  inv_status text;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"a0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('MatC','club','PT','public');

  perform set_config('role','postgres',true);
  select id into g from groups where community_id = cid order by created_at limit 1;
  -- 0117: the organizer must be a member of the series' group to materialise.
  insert into group_members (group_id, user_id) values (g, u1) on conflict do nothing;

  -- fixture needs two series in one community; bypass the recurring_events plan cap during seeding.
  alter table event_series disable trigger trg_recurring_events_cap;

  insert into event_series (group_id, organizer_id, day_of_week, start_time, duration_minutes, invite_lead_days)
  values (g, u1, 3, '18:00', 90, 3) returning id into s;

  insert into events (
    group_id, series_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    g, s, u1, 'americano', 'classic', 'points',
    2, now() + interval '2 day', 90, 'organizing_and_playing', 'MatEv', 'scheduled', false
  ) returning id into ev;

  insert into event_invitations (event_id, invitee_id, status, invited_by)
    values (ev, i1, 'pending', u1);
  insert into event_participants (event_id, user_id, status) values (ev, i1, 'confirmed');

  insert into event_series (group_id, organizer_id, day_of_week, start_time, duration_minutes, invite_lead_days, is_active)
  values (g, u1, 4, '19:00', 90, 3, false) returning id into s2;
  insert into events (
    group_id, series_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    g, s2, u1, 'americano', 'classic', 'points',
    1, now() + interval '1 day', 90, 'organizing_and_playing', 'MatInactive', 'scheduled', false
  ) returning id into ev_inactive;

  alter table event_series enable trigger trg_recurring_events_cap;

  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    g, u1, 'americano', 'classic', 'points',
    1, now() + interval '1 day', 90, 'organizing_and_playing', 'MatStd', 'scheduled', false
  ) returning id into std;

  -- (1) organizer materializes
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"a0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  new1 := materialize_occurrence(ev);

  perform set_config('role','postgres',true);
  select starts_at, name, num_courts, status into v_start, v_name, v_courts, v_status
    from events where id = new1;
  if v_start <> (select _series_slot(starts_at, 1) from events where id = ev) then
    raise exception using errcode='PT001', message='new occurrence starts_at should be one week later, same Lisbon wall-clock time (0117)';
  end if;
  if v_name <> 'MatEv' or v_courts <> 2 or v_status <> 'scheduled' then
    raise exception using errcode='PT001', message='new occurrence should copy name/num_courts and be scheduled';
  end if;

  select count(*) into n_inv from event_invitations where event_id = new1;
  select count(*) into n_part from event_participants where event_id = new1;
  -- 0112 (decision 5): the series is a PUBLIC group one, so the occurrence copies no invitation
  -- and the group is told with event_created instead (i1 is not a group member, so nobody here).
  if n_inv <> 0 then
    raise exception using errcode='PT001', message='public occurrence must not copy invitations, got '||n_inv;
  end if;
  if n_part <> 0 then
    raise exception using errcode='PT001', message='new occurrence should have zero participants, got '||n_part;
  end if;
  raise notice 'OK materialize: +7d, config copied, no invitations (public), roster empty';

  -- (2) idempotent
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"a0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  new2 := materialize_occurrence(ev);
  if new2 <> new1 then
    raise exception using errcode='PT001', message='second call should return the same occurrence id';
  end if;
  perform set_config('role','postgres',true);
  if (select count(*) from events where series_id = s and starts_at = (select _series_slot(starts_at, 1) from events where id = ev) and deleted_at is null) <> 1 then
    raise exception using errcode='PT001', message='idempotent re-call must not create a duplicate occurrence';
  end if;
  raise notice 'OK idempotent: re-call returns same id, single row';

  -- (3) non-organizer -> forbidden
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"a0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  begin
    perform materialize_occurrence(ev);
    raise exception using errcode='PT001', message='non-organizer should be forbidden';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('forbidden' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for non-organizer: '||sqlerrm;
      end if;
  end;
  raise notice 'OK non-organizer: forbidden';

  -- (4) inactive series -> series_inactive
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"a0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  begin
    perform materialize_occurrence(ev_inactive);
    raise exception using errcode='PT001', message='inactive series should raise series_inactive';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('series_inactive' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for inactive series: '||sqlerrm;
      end if;
  end;
  raise notice 'OK inactive series: series_inactive';

  -- (5) non-series event -> event_not_found
  begin
    perform materialize_occurrence(std);
    raise exception using errcode='PT001', message='non-series event should raise event_not_found';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('event_not_found' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for non-series event: '||sqlerrm;
      end if;
  end;
  raise notice 'OK non-series: event_not_found';

  raise notice 'OK materialize_occurrence';
end $$;
rollback;
