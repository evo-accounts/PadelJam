-- A3: server-side activity logging. Verifies update_event logs 'event_edited' with the right
-- changed groups; invite_to_event logs one 'invited' per invitee; accept/decline log with the
-- invitee as actor; and an organizer action (confirming an invitee) logs exactly once from the RPC.
-- 0122: the event is a PRIVATE group event (a public one takes no invitations, D12), invitees are
-- group members, the 'invited' / 'invite_accepted' rows come from the invitation trigger, the
-- player's own join from the participant trigger, and the organizer confirms an INVITEE
-- (organizer_confirm_invitee) — a waiting-list player is not confirmable.
-- 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','act-u1@x.com'),
  ('e0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','act-p1@x.com'),
  ('e0000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','act-p2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e0000001-0000-0000-0000-000000000001','act-u1@x.com','+351900800001','ActOrganizer'),
  ('e0000002-0000-0000-0000-000000000002','act-p1@x.com','+351900800002','ActPlayer'),
  ('e0000003-0000-0000-0000-000000000003','act-p2@x.com','+351900800003','ActPlayer2') on conflict do nothing;

do $$
declare
  u1  uuid := 'e0000001-0000-0000-0000-000000000001';
  p1  uuid := 'e0000002-0000-0000-0000-000000000002';
  p2  uuid := 'e0000003-0000-0000-0000-000000000003';
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
    2, now() + interval '2 day', 90, 'organizing_only', 'ActEv', 'scheduled', true
  ) returning id into ev;
  insert into community_members (community_id, user_id, role) values (cid, p1, 'member'), (cid, p2, 'member')
    on conflict do nothing;
  insert into group_members (group_id, user_id) values (g, p1), (g, p2) on conflict do nothing;

  base := jsonb_build_object(
    'name','ActEv','description','d',
    'starts_at',(now()+interval '2 day')::text,'duration_minutes',90,
    'scoring_mode','points','scoring_value',24,
    'allow_standby',false,'is_private',true,
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

  -- (2) invite two members (a contact-only entry is skipped since 0113) -> two 'invited' rows.
  perform set_config('role','authenticated',true);
  perform invite_to_event(ev, jsonb_build_array(
    jsonb_build_object('invitee_id', p1::text),
    jsonb_build_object('invitee_id', p2::text),
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
  if not exists (select 1 from event_activity where event_id=ev and action='joined' and actor_id=p1) then
    raise exception using errcode='PT001', message='the join should be logged (actor=player)';
  end if;
  raise notice 'OK accept logs invite_accepted + joined (actor=invitee)';

  -- (4) the organizer confirms the other invitee -> exactly one server-side 'confirmed' row with
  -- target_name, and no invite_accepted / joined on the player's behalf.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  pid := organizer_confirm_invitee(ev, p2);
  perform set_config('role','postgres',true);
  if exists (select 1 from event_activity where event_id=ev and actor_id=p2) then
    raise exception using errcode='PT001', message='an organizer confirmation must not log as the player';
  end if;
  select count(*) into n from event_activity where event_id=ev and action='confirmed';
  if n <> 1 then
    raise exception using errcode='PT001', message='expected exactly one confirmed row from the RPC, got '||n;
  end if;
  if not exists (select 1 from event_activity where event_id=ev and action='confirmed'
                 and detail->>'target_name' = 'ActPlayer2') then
    raise exception using errcode='PT001', message='confirmed row should carry server-derived target_name';
  end if;
  raise notice 'OK organizer_confirm_invitee logs server-side once with target_name';

  raise notice 'OK activity_logging';
end $$;
rollback;
