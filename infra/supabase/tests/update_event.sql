-- JM-24: update_event RPC — organizer edits a scheduled event's mutable fields.
-- Verifies organizer gate (forbidden), status gate (not_editable), standby capacity guard
-- (standby_below_roster), standalone stays private (0122: refused, was forced), and a happy-path field update.
-- 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','upd-u1@x.com'),
  ('f0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','upd-u2@x.com'),
  ('f0000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','upd-m1@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f0000001-0000-0000-0000-000000000001','upd-u1@x.com','+351900500001','UpdOrganizer'),
  ('f0000002-0000-0000-0000-000000000002','upd-u2@x.com','+351900500002','UpdNonOrganizer'),
  ('f0000003-0000-0000-0000-000000000003','upd-m1@x.com','+351900500003','UpdStandby') on conflict do nothing;

do $$
declare
  u1  uuid := 'f0000001-0000-0000-0000-000000000001';
  u2  uuid := 'f0000002-0000-0000-0000-000000000002';
  m1  uuid := 'f0000003-0000-0000-0000-000000000003';
  cid uuid;
  g   uuid;
  ev  uuid;
  ev2 uuid;
  payload jsonb;
  v_name text;
  v_scoring int;
  v_starts timestamptz;
  v_private boolean;
  v_counts boolean;
begin
  -- ---- As U1: create the community (owner) ----
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"f0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('UpdC','club','PT','public');

  -- ---- Seed events under role postgres (fixture, bypasses RLS) ----
  -- Reuse the community's auto-created general group (starter caps groups_per_community at 1).
  perform set_config('role','postgres',true);
  select id into g from groups where community_id = cid order by created_at limit 1;

  -- Scheduled group event, organizer U1, allow_standby=true / standby_spots=2.
  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status,
    is_private, allow_standby, standby_spots
  ) values (
    g, u1, 'americano', 'classic', 'points',
    1, now() + interval '1 day', 90, 'organizing_and_playing', 'UpdEv', 'scheduled',
    false, true, 2
  ) returning id into ev;

  -- Standalone scheduled event, organizer U1, is_private=true (events_standalone_private).
  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status,
    is_private, allow_standby, standby_spots
  ) values (
    null, u1, 'americano', 'classic', 'points',
    1, now() + interval '1 day', 90, 'organizing_and_playing', 'UpdEv2', 'scheduled',
    true, true, 2
  ) returning id into ev2;

  -- ============================================================
  -- (1) As U1 (organizer): happy-path edit -> row reflects new values.
  -- ============================================================
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"f0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);

  payload := jsonb_build_object(
    'name','New Name','description','d',
    'starts_at',(now()+interval '2 days')::text,
    'duration_minutes',90,'scoring_mode','points','scoring_value',24,
    'allow_standby',true,'standby_spots',2,'is_private',false,
    'entrance_fee_enabled',false,'players_submit_results',false,
    'organizer_role','organizing_only');
  perform update_event(ev, payload);

  perform set_config('role','postgres',true);
  select name, scoring_value, starts_at into v_name, v_scoring, v_starts from events where id = ev;
  if v_name <> 'New Name' then
    raise exception using errcode='PT001', message='expected name=New Name, got '||coalesce(v_name,'<null>');
  end if;
  if v_scoring <> 24 then
    raise exception using errcode='PT001', message='expected scoring_value=24, got '||coalesce(v_scoring::text,'<null>');
  end if;
  if v_starts < now() + interval '1 day 12 hours' then
    raise exception using errcode='PT001', message='expected starts_at updated to ~2 days out';
  end if;
  raise notice 'OK organizer edit: name/scoring/starts_at updated';

  -- C1: toggling a public group event to private must turn ranking OFF (counts_for_ranking).
  perform set_config('role','authenticated',true);
  perform update_event(ev, jsonb_build_object(
    'name','New Name','starts_at',(now()+interval '2 days')::text,'duration_minutes',90,
    'scoring_mode','points','scoring_value',24,'allow_standby',false,'is_private',true,
    'entrance_fee_enabled',false,'players_submit_results',false,'organizer_role','organizing_only'));
  perform set_config('role','postgres',true);
  select is_private, counts_for_ranking into v_private, v_counts from events where id = ev;
  if not v_private or v_counts then
    raise exception using errcode='PT001',
      message='expected is_private=true + counts_for_ranking=false after going private, got priv='||v_private||' counts='||v_counts;
  end if;
  raise notice 'OK ranking: public->private turns counts_for_ranking off';

  -- ============================================================
  -- (2) As U2 (non-organizer) -> forbidden.
  -- ============================================================
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"f0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  begin
    perform update_event(ev, payload);
    raise exception using errcode='PT001', message='non-organizer should not be able to edit the event';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('forbidden' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for non-organizer edit: '||sqlerrm;
      end if;
  end;
  raise notice 'OK non-organizer: blocked with forbidden';

  -- ============================================================
  -- (3) in_progress event -> not_editable (set status under postgres, call as U1, reset).
  -- ============================================================
  perform set_config('role','postgres',true);
  update events set status = 'in_progress' where id = ev;
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"f0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  begin
    perform update_event(ev, payload);
    raise exception using errcode='PT001', message='in_progress event should raise not_editable';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('not_editable' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for in_progress edit: '||sqlerrm;
      end if;
  end;
  perform set_config('role','postgres',true);
  update events set status = 'scheduled' where id = ev;
  raise notice 'OK in_progress: blocked with not_editable';

  -- ============================================================
  -- (4) Standby participant present + allow_standby=false -> standby_below_roster.
  -- ============================================================
  perform set_config('role','postgres',true);
  insert into event_participants (event_id, user_id, status, is_standby)
    values (ev, m1, 'confirmed', true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"f0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  begin
    perform update_event(ev, jsonb_build_object(
      'name','New Name','description','d',
      'starts_at',(now()+interval '2 days')::text,
      'duration_minutes',90,'scoring_mode','points','scoring_value',24,
      'allow_standby',false,'standby_spots',0,'is_private',false,
      'entrance_fee_enabled',false,'players_submit_results',false,
      'organizer_role','organizing_only'));
    raise exception using errcode='PT001', message='lowering standby below roster should raise standby_below_roster';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('standby_below_roster' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for standby guard: '||sqlerrm;
      end if;
  end;
  raise notice 'OK standby guard: blocked with standby_below_roster';

  -- ============================================================
  -- (5) Standalone event + is_private=false payload -> standalone_must_be_private (0122, D14; was
  --     silently forced), is_private stays true.
  -- ============================================================
  begin
    perform update_event(ev2, jsonb_build_object(
      'name','Standalone New','description','d',
      'starts_at',(now()+interval '2 days')::text,
      'duration_minutes',90,'scoring_mode','points','scoring_value',24,
      'allow_standby',true,'standby_spots',2,'is_private',false,
      'entrance_fee_enabled',false,'players_submit_results',false,
      'organizer_role','organizing_only'));
    raise exception using errcode='PT001', message='a standalone event must refuse is_private=false';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('standalone_must_be_private' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error: '||sqlerrm; end if;
  end;
  perform set_config('role','postgres',true);
  select is_private into v_private from events where id = ev2;
  if v_private is distinct from true then
    raise exception using errcode='PT001', message='standalone event is_private should stay true, got '||coalesce(v_private::text,'<null>');
  end if;
  raise notice 'OK standalone: is_private=false refused (standalone_must_be_private)';

  raise notice 'OK update_event';
end $$;
rollback;
