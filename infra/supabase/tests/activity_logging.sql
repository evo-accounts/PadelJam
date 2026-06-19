-- A3: server-side activity logging. Verifies update_event logs 'event_edited' with the right
-- changed groups; invite_to_event logs one 'invited' per invitee; accept/decline log with the
-- invitee as actor; and a migrated organizer action (mark_confirmed) logs exactly once from the RPC.
-- 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','act-u1@x.com'),
  ('e0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','act-p1@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e0000001-0000-0000-0000-000000000001','act-u1@x.com','+351900800001','ActOrganizer'),
  ('e0000002-0000-0000-0000-000000000002','act-p1@x.com','+351900800002','ActPlayer') on conflict do nothing;

do $$
declare
  u1  uuid := 'e0000001-0000-0000-0000-000000000001';
  p1  uuid := 'e0000002-0000-0000-0000-000000000002';
  cid uuid;
  g   uuid;
  ev  uuid;
  pid uuid;
  base jsonb;
  v_changes jsonb;
  n int;
  v_actor uuid;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('ActC','club','PT','public');

  perform set_config('role','postgres',true);
  select id into g from groups where community_id = cid order by created_at limit 1;
  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode, scoring_value,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    g, u1, 'americano', 'classic', 'points', 24,
    2, now() + interval '2 day', 90, 'organizing_only', 'ActEv', 'scheduled', false
  ) returning id into ev;

  base := jsonb_build_object(
    'name','ActEv','description','d',
    'starts_at',(now()+interval '2 day')::text,'duration_minutes',90,
    'scoring_mode','points','scoring_value',24,
    'allow_standby',false,'is_private',false,
    'entrance_fee_enabled',false,'players_submit_results',false,'organizer_role','organizing_only',
    'num_courts',2,'has_location',false,
    'manual_location_name',null,'manual_location_address',null,'venue_id',null);

  -- (1) edit: change starts_at (+3 day) and scoring_value -> event_edited with ['date','scoring'].
  perform set_config('role','authenticated',true);
  perform update_event(ev, base || jsonb_build_object('starts_at',(now()+interval '3 day')::text,'scoring_value',32));
  perform set_config('role','postgres',true);
  select detail->'changes' into v_changes from event_activity where event_id=ev and action='event_edited';
  if v_changes is null or not (v_changes ? 'date') or not (v_changes ? 'scoring') then
    raise exception using errcode='PT001', message='event_edited should record date+scoring, got '||coalesce(v_changes::text,'<null>');
  end if;
  raise notice 'OK edit logs event_edited with changed groups';

  -- (2) invite two people -> two 'invited' rows.
  perform set_config('role','authenticated',true);
  perform invite_to_event(ev, jsonb_build_array(
    jsonb_build_object('invitee_id', p1::text),
    jsonb_build_object('name','Guest Invite','email','gi@x.com')));
  perform set_config('role','postgres',true);
  select count(*) into n from event_activity where event_id=ev and action='invited';
  if n <> 2 then
    raise exception using errcode='PT001', message='expected 2 invited rows, got '||n;
  end if;
  raise notice 'OK invite logs one invited per invitee';

  -- (3) p1 accepts -> invite_accepted with actor = p1.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  perform accept_event_invitation(ev);
  perform set_config('role','postgres',true);
  select actor_id into v_actor from event_activity where event_id=ev and action='invite_accepted';
  if v_actor is distinct from p1 then
    raise exception using errcode='PT001', message='invite_accepted actor should be the invitee';
  end if;
  raise notice 'OK accept logs invite_accepted (actor=invitee)';

  -- (4) organizer mark_confirmed -> exactly one server-side 'confirmed' row with target_name.
  perform set_config('role','postgres',true);
  select id into pid from event_participants where event_id=ev and user_id=p1;
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  perform organizer_mark_confirmed(pid);
  perform set_config('role','postgres',true);
  select count(*) into n from event_activity where event_id=ev and action='confirmed';
  if n <> 1 then
    raise exception using errcode='PT001', message='expected exactly one confirmed row from the RPC, got '||n;
  end if;
  if not exists (select 1 from event_activity where event_id=ev and action='confirmed'
                 and detail->>'target_name' = 'ActPlayer') then
    raise exception using errcode='PT001', message='confirmed row should carry server-derived target_name';
  end if;
  raise notice 'OK organizer_mark_confirmed logs server-side once with target_name';

  raise notice 'OK activity_logging';
end $$;
rollback;
