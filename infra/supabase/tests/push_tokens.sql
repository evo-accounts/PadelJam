-- Push (Expo): push_tokens table + register_push_token RPC + notify_push trigger.
-- Verifies upsert (insert / re-register same token / second token), invalid_platform guard,
-- own-row read RLS, and the critical trigger-no-op-when-unconfigured case (no app.send_push_url
-- -> notifications INSERT must NOT error). 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('a0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','push-u1@x.com'),
  ('a0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','push-u2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('a0000001-0000-0000-0000-000000000001','push-u1@x.com','+351900500001','PushU1'),
  ('a0000002-0000-0000-0000-000000000002','push-u2@x.com','+351900500002','PushU2') on conflict do nothing;

do $$
declare
  u1 uuid := 'a0000001-0000-0000-0000-000000000001';
  u2 uuid := 'a0000002-0000-0000-0000-000000000002';
  n        integer;
  v_plat   text;
  v_first  timestamptz;
  v_second timestamptz;
begin
  -- ---- As U1 ----
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"a0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);

  -- (1) register a token -> exactly 1 row for U1.
  perform register_push_token('ExponentPushToken[aaa]','ios');
  select count(*) into n from push_tokens where user_id = u1;
  if n <> 1 then
    raise exception using errcode='PT001', message='expected 1 push_tokens row after first register, got '||n;
  end if;
  select platform, updated_at into v_plat, v_first
    from push_tokens where user_id = u1 and expo_token = 'ExponentPushToken[aaa]';
  raise notice 'OK register: 1 row (platform=%)', v_plat;

  -- (2) re-register same token with a different platform -> still 1 row, platform updated, updated_at refreshed.
  --     (now() is fixed per transaction, so the refreshed value matches transaction time, i.e. >= the first.)
  perform register_push_token('ExponentPushToken[aaa]','android');
  select count(*) into n from push_tokens where user_id = u1;
  if n <> 1 then
    raise exception using errcode='PT001', message='re-register same token should keep 1 row, got '||n;
  end if;
  select platform, updated_at into v_plat, v_second
    from push_tokens where user_id = u1 and expo_token = 'ExponentPushToken[aaa]';
  if v_plat <> 'android' then
    raise exception using errcode='PT001', message='re-register should update platform to android, got '||v_plat;
  end if;
  if v_second < v_first then
    raise exception using errcode='PT001', message='re-register should refresh updated_at (not go backwards)';
  end if;
  raise notice 'OK re-register: still 1 row, platform=android, updated_at refreshed';

  -- (3) register a second distinct token -> 2 rows for U1.
  perform register_push_token('ExponentPushToken[bbb]','ios');
  select count(*) into n from push_tokens where user_id = u1;
  if n <> 2 then
    raise exception using errcode='PT001', message='expected 2 push_tokens rows after second token, got '||n;
  end if;
  raise notice 'OK second token: 2 rows';

  -- (4) invalid platform -> invalid_platform.
  begin
    perform register_push_token('x','windows');
    raise exception using errcode='PT001', message='windows platform should raise invalid_platform';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('invalid_platform' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for invalid platform: '||sqlerrm;
      end if;
  end;
  raise notice 'OK invalid platform: blocked with invalid_platform';

  -- (5) RLS: as U2, cannot read U1's tokens.
  perform set_config('request.jwt.claims','{"sub":"a0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  select count(*) into n from push_tokens;
  if n <> 0 then
    raise exception using errcode='PT001', message='U2 should read 0 push_tokens (RLS), got '||n;
  end if;
  raise notice 'OK rls: U2 reads 0 rows';

  -- (6) Trigger no-op when unconfigured: under role postgres, inserting a notification must NOT error
  --     (app.send_push_url is unset, so notify_push returns early without touching net).
  perform set_config('role','postgres',true);
  insert into notifications (user_id, type) values (u1, 'follow');
  raise notice 'OK trigger no-op: notification insert succeeded with app.send_push_url unset';

  raise notice 'OK push_tokens';
end $$;
rollback;
