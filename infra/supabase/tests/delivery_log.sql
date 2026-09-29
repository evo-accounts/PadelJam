-- A4: delivery_log RLS + target CHECK + retry_blast gating.
-- 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('d0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dl-u1@x.com'),
  ('d0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dl-u2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('d0000001-0000-0000-0000-000000000001','dl-u1@x.com','+351900900001','DlOrganizer'),
  ('d0000002-0000-0000-0000-000000000002','dl-u2@x.com','+351900900002','DlOther') on conflict do nothing;

do $$
declare
  u1  uuid := 'd0000001-0000-0000-0000-000000000001';
  u2  uuid := 'd0000002-0000-0000-0000-000000000002';
  cid uuid;
  g   uuid;
  ev  uuid;
  bl  uuid;
  dl  uuid;
  n   int;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"d0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('DlC','club','PT','public');

  perform set_config('role','postgres',true);
  select id into g from groups where community_id = cid order by created_at limit 1;
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name, status, is_private)
  values (g, u1, 'americano','classic','points',1, now()+interval '2 day',90,'organizing_only','DlEv','scheduled',false)
  returning id into ev;
  insert into event_blasts (event_id, sender_id, title, description, channels, send_to, sent_to_count)
  values (ev, u1, 'Blast','body', array['email'], 'all', 3) returning id into bl;

  -- target CHECK: an email row with no blast_id (no target at all) must be rejected (no FK noise).
  begin
    insert into delivery_log (channel, status) values ('email', 'sent');
    raise exception using errcode='PT001', message='delivery_target CHECK should reject email row without blast_id';
  exception
    when check_violation then null;  -- expected
  end;
  raise notice 'OK target CHECK rejects malformed row';

  -- seed a FAILED email attempt for the blast.
  insert into delivery_log (channel, blast_id, status, attempt, failed_count, error)
    values ('email', bl, 'failed', 1, 3, 'resend_failed:500') returning id into dl;

  -- RLS: organizer u1 can read the row.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"d0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  select count(*) into n from delivery_log where blast_id = bl;
  if n <> 1 then raise exception using errcode='PT001', message='organizer should read 1 delivery row, got '||n; end if;

  -- RLS: non-organizer u2 cannot read it.
  perform set_config('request.jwt.claims','{"sub":"d0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  select count(*) into n from delivery_log where blast_id = bl;
  if n <> 0 then raise exception using errcode='PT001', message='non-organizer must not read delivery rows, got '||n; end if;
  raise notice 'OK RLS: organizer reads, non-organizer blocked';

  -- retry_blast: organizer + latest attempt failed -> succeeds (no error).
  perform set_config('request.jwt.claims','{"sub":"d0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  perform retry_blast(bl);
  raise notice 'OK retry_blast allowed when latest attempt failed';

  -- retry_blast: non-organizer -> forbidden.
  perform set_config('request.jwt.claims','{"sub":"d0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  begin
    perform retry_blast(bl);
    raise exception using errcode='PT001', message='non-organizer retry should be forbidden';
  exception
    when sqlstate 'PT001' then raise;
    when others then if position('forbidden' in sqlerrm)=0 then
      raise exception using errcode='PT001', message='wrong error for non-organizer retry: '||sqlerrm; end if;
  end;
  raise notice 'OK retry_blast forbidden for non-organizer';

  -- retry_blast: latest attempt 'sent' -> not_retryable.
  perform set_config('role','postgres',true);
  insert into delivery_log (channel, blast_id, status, attempt, sent_count)
    values ('email', bl, 'sent', 2, 3);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"d0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  begin
    perform retry_blast(bl);
    raise exception using errcode='PT001', message='retry should be not_retryable when latest attempt succeeded';
  exception
    when sqlstate 'PT001' then raise;
    when others then if position('not_retryable' in sqlerrm)=0 then
      raise exception using errcode='PT001', message='wrong error for sent-latest retry: '||sqlerrm; end if;
  end;
  raise notice 'OK retry_blast not_retryable when latest attempt sent';

  raise notice 'OK delivery_log';
end $$;
rollback;
