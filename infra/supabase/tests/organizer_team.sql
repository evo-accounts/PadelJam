-- 5G-3 (JM-29..32): organizer team-assignment RPCs.
-- Verifies assign (pairing rule), remove (partner demotion), switch (slot swap + demote),
-- and organizer gating. 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('a1000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','team-u1@x.com'),
  ('a1000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','team-u2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('a1000001-0000-0000-0000-000000000001','team-u1@x.com','+351900400001','TeamOrganizer'),
  ('a1000002-0000-0000-0000-000000000002','team-u2@x.com','+351900400002','TeamNonOrganizer') on conflict do nothing;

do $$
declare
  u1 uuid := 'a1000001-0000-0000-0000-000000000001';
  u2 uuid := 'a1000002-0000-0000-0000-000000000002';
  ev uuid;
  p1 uuid; p2 uuid; p3 uuid;
  v_team1 uuid;
  v_confirmed boolean;
  v_status text;
  v_pa uuid; v_pb uuid;
begin
  -- ---- Fixture setup under privileged role (not under test) ----
  perform set_config('role','postgres',true);
  -- group_id=null forces is_private=true per events_standalone_private CHECK.
  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    null, u1, 'americano', 'team', 'points',
    1, now() + interval '1 day', 90, 'organizing_and_playing', 'TeamEv', 'scheduled', true
  ) returning id into ev;
  insert into event_participants (event_id, user_id, status) values (ev, u1, 'invited') returning id into p1;
  insert into event_participants (event_id, user_id, status) values (ev, u2, 'invited') returning id into p2;
  insert into event_participants (event_id, guest_name, status) values (ev, 'GuestThree', 'invited') returning id into p3;

  -- ---- As U1 (organizer) for the assertion groups ----
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"a1000001-0000-0000-0000-000000000001","role":"authenticated"}',true);

  -- (1) assign P1 to team1 slot a => is_confirmed=false, P1 status='invited'
  perform organizer_assign_to_team(ev, p1, 1, 'a');
  perform set_config('role','postgres',true);
  select id, is_confirmed into v_team1, v_confirmed from event_teams where event_id=ev and team_number=1;
  if v_team1 is null then
    raise exception using errcode='PT001', message='team 1 should exist after assign P1';
  end if;
  if v_confirmed <> false then
    raise exception using errcode='PT001', message='(1) team1 should be is_confirmed=false, got '||v_confirmed;
  end if;
  select status into v_status from event_participants where id=p1;
  if v_status <> 'invited' then
    raise exception using errcode='PT001', message='(1) P1 should be invited (lone), got '||v_status;
  end if;
  raise notice 'OK assign P1 -> team1 unpaired, P1 invited';

  -- (2) assign P2 to team1 slot b => is_confirmed=true, P1 & P2 status='confirmed'
  perform set_config('role','authenticated',true);
  perform organizer_assign_to_team(ev, p2, 1, 'b');
  perform set_config('role','postgres',true);
  select is_confirmed into v_confirmed from event_teams where event_id=ev and team_number=1;
  if v_confirmed <> true then
    raise exception using errcode='PT001', message='(2) team1 should be is_confirmed=true, got '||v_confirmed;
  end if;
  select status into v_status from event_participants where id=p1;
  if v_status <> 'confirmed' then
    raise exception using errcode='PT001', message='(2) P1 should be confirmed, got '||v_status;
  end if;
  select status into v_status from event_participants where id=p2;
  if v_status <> 'confirmed' then
    raise exception using errcode='PT001', message='(2) P2 should be confirmed, got '||v_status;
  end if;
  raise notice 'OK assign P2 -> team1 confirmed, P1 & P2 confirmed';

  -- (3) remove_from_team P1 => team1 is_confirmed=false, neither slot is P1; P1 invited AND P2 demoted to invited
  perform set_config('role','authenticated',true);
  perform organizer_remove_from_team(ev, p1);
  perform set_config('role','postgres',true);
  select is_confirmed, player_a_id, player_b_id into v_confirmed, v_pa, v_pb
    from event_teams where event_id=ev and team_number=1;
  if v_confirmed <> false then
    raise exception using errcode='PT001', message='(3) team1 should be is_confirmed=false, got '||v_confirmed;
  end if;
  if v_pa = p1 or v_pb = p1 then
    raise exception using errcode='PT001', message='(3) team1 should not reference P1 in any slot';
  end if;
  select status into v_status from event_participants where id=p1;
  if v_status <> 'invited' then
    raise exception using errcode='PT001', message='(3) P1 should be invited after removal, got '||v_status;
  end if;
  select status into v_status from event_participants where id=p2;
  if v_status <> 'invited' then
    raise exception using errcode='PT001', message='(3) partner P2 should be demoted to invited, got '||v_status;
  end if;
  raise notice 'OK remove P1 -> team1 unpaired, P1 & partner P2 demoted to invited';

  -- (4) re-pair P1+P2, then switch_players(P2, P3) where P3 was invited (no slot)
  --     => P3 in P2's old slot & confirmed; P2 invited (no slot); team1 still confirmed (P1+P3)
  perform set_config('role','authenticated',true);
  perform organizer_assign_to_team(ev, p1, 1, 'a');
  perform organizer_assign_to_team(ev, p2, 1, 'b');
  perform organizer_switch_players(ev, p2, p3);
  perform set_config('role','postgres',true);
  select is_confirmed, player_a_id, player_b_id into v_confirmed, v_pa, v_pb
    from event_teams where event_id=ev and team_number=1;
  if v_confirmed <> true then
    raise exception using errcode='PT001', message='(4) team1 should be is_confirmed=true after switch, got '||v_confirmed;
  end if;
  if not (v_pa = p1 and v_pb = p3) then
    raise exception using errcode='PT001', message='(4) team1 should be P1(a)+P3(b), got a='||coalesce(v_pa::text,'null')||' b='||coalesce(v_pb::text,'null');
  end if;
  select status into v_status from event_participants where id=p3;
  if v_status <> 'confirmed' then
    raise exception using errcode='PT001', message='(4) P3 should be confirmed in P2 old slot, got '||v_status;
  end if;
  select status into v_status from event_participants where id=p2;
  if v_status <> 'invited' then
    raise exception using errcode='PT001', message='(4) P2 should be invited (no slot) after switch, got '||v_status;
  end if;
  raise notice 'OK switch P2<->P3 -> P3 confirmed in slot, P2 invited, team1 confirmed (P1+P3)';

  -- (4b) same-team switch (P1 & P3 are both on team1) must be a harmless no-op, NOT a check_violation.
  perform set_config('role','authenticated',true);
  perform organizer_switch_players(ev, p1, p3);
  perform set_config('role','postgres',true);
  select is_confirmed, player_a_id, player_b_id into v_confirmed, v_pa, v_pb
    from event_teams where event_id=ev and team_number=1;
  if not (v_confirmed = true and v_pa = p1 and v_pb = p3) then
    raise exception using errcode='PT001', message='(4b) same-team switch should be a no-op, got confirmed='||v_confirmed||' a='||coalesce(v_pa::text,'null')||' b='||coalesce(v_pb::text,'null');
  end if;
  raise notice 'OK same-team switch is a no-op';

  -- (5) As U2 (non-organizer): organizer_assign_to_team must raise forbidden
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"a1000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  begin
    perform organizer_assign_to_team(ev, p1, 1, 'a');
    raise exception using errcode='PT001', message='(5) non-organizer should not be able to assign to team';
  exception
    when sqlstate 'PT001' then raise;  -- re-raise our own sentinel
    when others then
      if position('forbidden' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='(5) wrong error for non-organizer assign: '||sqlerrm;
      end if;
  end;
  raise notice 'OK non-organizer assign blocked with forbidden';

  raise notice 'OK organizer_team';
end $$;
rollback;
