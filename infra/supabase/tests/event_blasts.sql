-- 5G-4: event_blasts + blast_templates + send_event_blast RPC.
-- Verifies opt-in recipient counting, no_community/channels_required guards,
-- organizer-only send + read RLS, and can_customize_blast tier gating.
-- 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','blast-u1@x.com'),
  ('e0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','blast-u2@x.com'),
  ('e0000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','blast-m1@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e0000001-0000-0000-0000-000000000001','blast-u1@x.com','+351900400001','BlastOrganizer'),
  ('e0000002-0000-0000-0000-000000000002','blast-u2@x.com','+351900400002','BlastNonOrganizer'),
  ('e0000003-0000-0000-0000-000000000003','blast-m1@x.com','+351900400003','BlastMember') on conflict do nothing;

do $$
declare
  u1  uuid := 'e0000001-0000-0000-0000-000000000001';
  u2  uuid := 'e0000002-0000-0000-0000-000000000002';
  m1  uuid := 'e0000003-0000-0000-0000-000000000003';
  cid uuid;
  g   uuid;
  ev  uuid;
  ev2 uuid;
  n   integer;
  cc  boolean;
begin
  -- ---- As U1: create the community (owner) ----
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('BlastC','club','PT','public');

  -- ---- Seed events + participants under role postgres (fixture, bypasses RLS) ----
  -- Reuse the community's auto-created general group (starter caps groups_per_community at 1).
  perform set_config('role','postgres',true);
  select id into g from groups where community_id = cid order by created_at limit 1;

  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    g, u1, 'americano', 'classic', 'points',
    1, now() + interval '1 day', 90, 'organizing_and_playing', 'BlastEv', 'scheduled', false
  ) returning id into ev;

  insert into event_participants (event_id, user_id, status) values (ev, m1, 'confirmed');
  insert into user_settings (user_id, notifications_email, notifications_whatsapp)
    values (m1, true, false);

  -- Standalone event (no community).
  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    null, u1, 'americano', 'classic', 'points',
    1, now() + interval '1 day', 90, 'organizing_and_playing', 'BlastEv2', 'scheduled', true
  ) returning id into ev2;

  -- ============================================================
  -- As U1 (organizer): assertions 1-4 + 6 + 7
  -- ============================================================
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);

  -- (1) email channel: M1 opted in -> returns 1 + inserts a row.
  select sent_to_count into n from send_event_blast(ev, null, 'Hi', 'Body', null, array['email']);
  if n <> 1 then
    raise exception using errcode='PT001', message='expected send_event_blast(email) = 1, got '||n;
  end if;
  perform set_config('role','postgres',true);
  select count(*) into n from event_blasts where event_id = ev;
  if n <> 1 then
    raise exception using errcode='PT001', message='expected 1 event_blasts row after email send, got '||n;
  end if;
  perform set_config('role','authenticated',true);
  raise notice 'OK send email: returns 1 and inserts 1 row';

  -- (2) whatsapp channel: M1 opted out -> returns 0.
  select sent_to_count into n from send_event_blast(ev, null, 'Hi', 'Body', null, array['whatsapp']);
  if n <> 0 then
    raise exception using errcode='PT001', message='expected send_event_blast(whatsapp) = 0, got '||n;
  end if;
  raise notice 'OK send whatsapp: returns 0 (M1 opted out)';

  -- (3) standalone event -> no_community.
  begin
    perform send_event_blast(ev2, null, 'Hi', 'Body', null, array['email']);
    raise exception using errcode='PT001', message='standalone event should raise no_community';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('no_community' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for standalone event: '||sqlerrm;
      end if;
  end;
  raise notice 'OK standalone: blocked with no_community';

  -- (4) empty channels -> channels_required.
  begin
    perform send_event_blast(ev, null, 'Hi', 'Body', null, array[]::text[]);
    raise exception using errcode='PT001', message='empty channels should raise channels_required';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('channels_required' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for empty channels: '||sqlerrm;
      end if;
  end;
  raise notice 'OK empty channels: blocked with channels_required';

  -- (5) As U2 (non-organizer) -> forbidden.
  perform set_config('request.jwt.claims','{"sub":"e0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  begin
    perform send_event_blast(ev, null, 'Hi', 'Body', null, array['email']);
    raise exception using errcode='PT001', message='non-organizer should not be able to send a blast';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('forbidden' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for non-organizer send: '||sqlerrm;
      end if;
  end;
  raise notice 'OK non-organizer: blocked with forbidden';

  -- (6) Read visibility (RLS): U2 reads 0, U1 reads >= 1.
  select count(*) into n from event_blasts where event_id = ev;
  if n <> 0 then
    raise exception using errcode='PT001', message='non-organizer should read 0 event_blasts (RLS), got '||n;
  end if;
  raise notice 'OK rls: non-organizer reads 0 rows';

  perform set_config('request.jwt.claims','{"sub":"e0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  select count(*) into n from event_blasts where event_id = ev;
  if n < 1 then
    raise exception using errcode='PT001', message='organizer should read >= 1 event_blasts, got '||n;
  end if;
  raise notice 'OK rls: organizer reads >= 1 rows';

  -- (7) can_customize_blast: boolean for the starter (implicit) plan, then true after community_pro.
  cc := can_customize_blast(ev);
  if cc is null then
    raise exception using errcode='PT001', message='can_customize_blast should return a boolean, got null';
  end if;
  raise notice 'OK can_customize_blast: returns a boolean (%)', cc;

  -- Grant the community a Community Pro subscription (unique(community_id); personal tenant has no row).
  perform set_config('role','postgres',true);
  insert into community_subscriptions (community_id, plan_id, status, dimension)
    values (cid, 'community_pro', 'active', 'community')
    on conflict (community_id) do update set plan_id = excluded.plan_id, status = excluded.status;
  perform set_config('role','authenticated',true);

  if can_customize_blast(ev) is distinct from true then
    raise exception using errcode='PT001', message='can_customize_blast should be true under community_pro';
  end if;
  raise notice 'OK can_customize_blast: true under community_pro';

  raise notice 'OK event_blasts';
end $$;
rollback;
