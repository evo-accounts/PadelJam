-- Email delivery: event_roster_csv (0076) + the blast recipient RPCs (0076, 0143/0144).
-- Verifies organizer-only roster CSV (header + row + comma escaping), forbidden for non-organizer,
-- and blast_email_recipients_for returning opted-in member emails to the SERVICE ROLE (send-blast,
-- after verifying the caller) for the blast's organizer only. Since 0143/0144 no signed-in caller
-- may execute either recipient function: organizers must not read participants' email addresses.
-- 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('d0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','del-u1@x.com'),
  ('d0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','del-u2@x.com'),
  ('d0000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','del-m1@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('d0000001-0000-0000-0000-000000000001','del-u1@x.com','+351900500001','DelOrganizer'),
  ('d0000002-0000-0000-0000-000000000002','del-u2@x.com','+351900500002','DelNonOrganizer'),
  ('d0000003-0000-0000-0000-000000000003','del-m1@x.com','+351900500003','DelMember') on conflict do nothing;

do $$
declare
  u1  uuid := 'd0000001-0000-0000-0000-000000000001';
  u2  uuid := 'd0000002-0000-0000-0000-000000000002';
  m1  uuid := 'd0000003-0000-0000-0000-000000000003';
  cid uuid;
  g   uuid;
  ev  uuid;
  v_blast uuid;
  csv text;
  n   integer;
begin
  -- ---- As U1: create the community (owner) ----
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"d0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('DelC','club','PT','public');

  -- ---- Seed event + participants under role postgres (fixture, bypasses RLS) ----
  -- Reuse the community's auto-created general group.
  perform set_config('role','postgres',true);
  select id into g from groups where community_id = cid order by created_at limit 1;
  -- 0124 (B10): a custom blast needs custom_broadcasts (Basic and above).
  insert into community_subscriptions (community_id, plan_id, status, dimension)
    values (cid, 'community_pro', 'active', 'community');

  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    g, u1, 'americano', 'classic', 'points',
    1, now() + interval '1 day', 90, 'organizing_and_playing', 'DelEv', 'scheduled', false
  ) returning id into ev;

  -- Member M1 (confirmed) opted in to email.
  insert into event_participants (event_id, user_id, status, joined_at, confirmed_at)
    values (ev, m1, 'confirmed', now(), now());
  insert into user_settings (user_id, notifications_email, notifications_whatsapp)
    values (m1, true, false);

  -- Manual participant whose name contains a comma (CSV escaping).
  insert into event_participants (event_id, guest_name, status, joined_at)
    values (ev, 'Smith, Jo', 'confirmed', now() + interval '1 minute');

  -- ============================================================
  -- As U1 (organizer)
  -- ============================================================
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"d0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);

  -- (1) roster CSV: header + data rows + comma-escaped guest name.
  csv := event_roster_csv(ev);
  if split_part(csv, E'\n', 1)
     <> 'name,user_type,status,is_standby,joined_at,confirmed_at,has_paid,paid_at,fee_amount' then
    raise exception using errcode='PT001', message='unexpected roster CSV header: '||split_part(csv, E'\n', 1);
  end if;
  if position('member' in csv) = 0 then
    raise exception using errcode='PT001', message='roster CSV should contain a member row';
  end if;
  if position('"Smith, Jo"' in csv) = 0 then
    raise exception using errcode='PT001', message='comma name should be quoted in CSV: '||csv;
  end if;
  raise notice 'OK roster_csv: header + member row + comma escaping';

  -- (3a) record a blast and capture id.
  select blast_id into v_blast from send_event_blast(ev, null, 'Hi', 'Body', null, array['email']);
  if v_blast is null then
    raise exception using errcode='PT001', message='send_event_blast should return a blast id';
  end if;

  -- (3b) the organizer cannot read the recipient emails, through either function.
  begin
    perform * from blast_email_recipients(v_blast);
    raise exception using errcode='PT001', message='organizer should not execute blast_email_recipients';
  exception
    when sqlstate 'PT001' then raise;
    when insufficient_privilege then null;
  end;
  begin
    perform * from blast_email_recipients_for(v_blast, u1);
    raise exception using errcode='PT001', message='organizer should not execute blast_email_recipients_for';
  exception
    when sqlstate 'PT001' then raise;
    when insufficient_privilege then null;
  end;
  raise notice 'OK recipients: an organizer session cannot read emails';

  -- (3c) the service role, the way send-blast calls it (no `sub`), gets M1 for the organizer.
  perform set_config('role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  select count(*) into n from blast_email_recipients_for(v_blast, u1);
  if n <> 1 then
    raise exception using errcode='PT001', message='expected 1 opted-in recipient, got '||n;
  end if;
  raise notice 'OK blast_email_recipients_for: 1 opted-in member for the organizer';

  -- (3d) ...and nothing for someone who does not organize the event.
  begin
    perform * from blast_email_recipients_for(v_blast, u2);
    raise exception using errcode='PT001', message='service role should not resolve recipients for a non-organizer';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('forbidden' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for a non-organizer id: '||sqlerrm;
      end if;
  end;
  raise notice 'OK blast_email_recipients_for: non-organizer id refused with forbidden';
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"d0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);

  -- ============================================================
  -- As U2 (non-organizer)
  -- ============================================================
  perform set_config('request.jwt.claims','{"sub":"d0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);

  -- (2) roster CSV -> forbidden.
  begin
    perform event_roster_csv(ev);
    raise exception using errcode='PT001', message='non-organizer should not read roster CSV';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('forbidden' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for non-organizer roster CSV: '||sqlerrm;
      end if;
  end;
  raise notice 'OK roster_csv: non-organizer blocked with forbidden';

  -- (3e) recipients -> no EXECUTE for any signed-in caller.
  begin
    perform * from blast_email_recipients_for(v_blast, u2);
    raise exception using errcode='PT001', message='non-organizer should not read blast recipients';
  exception
    when sqlstate 'PT001' then raise;
    when insufficient_privilege then null;
  end;
  raise notice 'OK blast_email_recipients_for: non-organizer session blocked';

  raise notice 'OK email_delivery';
end $$;
rollback;
