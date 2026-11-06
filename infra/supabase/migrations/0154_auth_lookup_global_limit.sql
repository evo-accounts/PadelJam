-- PAD-159: auth_methods_for let a signed-out caller check unlimited emails and phones. The address
-- limit keyed on x-forwarded-for, which the client chooses, so rotating it (or sending none)
-- bypassed it: 40 of 40 calls answered locally.
--
-- Fix: a GLOBAL bucket of 120 lookups per 15 minutes is what bounds bulk lookups across all
-- identifiers and addresses; and the address key prefers cf-connecting-ip. 120 clears real
-- sign-ins (about 8 a minute); over it, lookupAuthMethods returns null on the client, the code is
-- still sent, and the sheet shows its only-way-in state. No client change.
--
-- Correction to 0096's comments: an unknown identifier is NOT identical to a real account. A real
-- email account answers has_email: true, an unknown one all-false. The lookup is allowed by design
-- (the sheet is for people who cannot get a code); it is bounded, not hidden.
--
-- Body is 0101's (the latest; 0134/0136/0142/0144 only touched search_path/grants), with the above.
-- Concurrent calls can overshoot the cap by about the pool size: count and insert are not atomic.

create or replace function auth_methods_for(p_identifier text)
returns table (has_email boolean, has_phone boolean, has_google boolean,
               has_apple boolean, has_password boolean,
               email_masked text, phone_masked text)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  c_window    constant interval := interval '15 minutes';
  c_id_limit  constant integer  := 5;
  c_ip_limit  constant integer  := 30;
  c_global_limit constant integer := 120;
  v_raw       text := btrim(coalesce(p_identifier, ''));
  v_is_phone  boolean;
  v_norm      text;
  v_id_bucket text;
  v_ip        text;
  v_ip_bucket text := null;
  v_hits      integer;
  v_user_id   uuid;
  v_email     text;
  v_phone     text;
  v_pwd       boolean;
begin
  -- Classify first: a bare or E.164 phone number, otherwise treat it as an email.
  v_is_phone := v_raw ~ '^\+?[1-9][0-9]{6,14}$';
  -- Normalise so the two spellings of one phone share a rate-limit bucket (otherwise adding and
  -- removing the '+' would double the allowance) and emails are case-insensitive.
  v_norm := case when v_is_phone then ltrim(v_raw, '+') else lower(v_raw) end;
  v_id_bucket := 'id:' || md5(lower(v_norm));

  -- The address key is cf-connecting-ip when present (Cloudflare overwrites it, so a client cannot
  -- choose it), otherwise the FIRST x-forwarded-for value, which is client-supplied and spoofable.
  -- Not the last x-forwarded-for value: on hosted it could be an internal hop, which would put every
  -- user in one 30-call bucket. Because the address can be spoofed, the address limit is only a
  -- brake on one noisy source. The per-identifier limit bounds one account; the GLOBAL bucket below
  -- is what bounds bulk lookups across all identifiers and addresses.
  -- current_setting(..., true) returns null when PostgREST did not set the GUC (a direct psql
  -- call, a trigger), and the cast/extract must not throw in that case.
  begin
    v_ip := coalesce(
      nullif(btrim(nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip'), ''),
      split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1));
  exception when others then
    v_ip := null;
  end;
  v_ip := nullif(btrim(coalesce(v_ip, '')), '');
  if v_ip is not null then
    v_ip_bucket := 'ip:' || md5(v_ip);
  end if;

  -- Prune before counting so the counts need no time predicate and the table stays small.
  -- NOTE: this DELETE takes row locks, which is exactly why the function is `volatile` and NOT
  -- parallel-safe. That is fine at "someone tapped Try another way" volume. Do not "optimise"
  -- this into a stable/parallel-safe function — the limiter would stop writing.
  delete from auth_lookup_attempts a where a.at < now() - c_window;

  select count(*) into v_hits
    from auth_lookup_attempts a
   where a.bucket = v_id_bucket and a.at >= now() - c_window;
  if v_hits >= c_id_limit then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  if v_ip_bucket is not null then
    select count(*) into v_hits
      from auth_lookup_attempts a
     where a.bucket = v_ip_bucket and a.at >= now() - c_window;
    if v_hits >= c_ip_limit then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  end if;

  select count(*) into v_hits
    from auth_lookup_attempts a
   where a.bucket = 'global' and a.at >= now() - c_window;
  if v_hits >= c_global_limit then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into auth_lookup_attempts (bucket) values (v_id_bucket);
  insert into auth_lookup_attempts (bucket) values ('global');
  if v_ip_bucket is not null then
    insert into auth_lookup_attempts (bucket) values (v_ip_bucket);
  end if;

  -- An empty identifier is answered without a lookup, and NOT because it is obviously fruitless:
  -- GoTrue stores a missing email/phone as '' rather than NULL, so `lower(u.email) = ''` would
  -- match an arbitrary phone-only account and hand a stranger's masked phone back for no input.
  -- The attempt above is still recorded, so an empty string costs the same as any other guess.
  if v_norm = '' then
    return query select false, false, false, false, false, null::text, null::text;
    return;
  end if;

  -- auth.users, NOT profiles. auth.users is authoritative for what can sign in, and a user can
  -- exist there with no profiles row at all — that is precisely the mid-signup state where "Try
  -- another way" matters most (identifier verified, account not completed).
  if v_is_phone then
    -- THE FORMAT TRAP: GoTrue stores auth.users.phone WITHOUT the leading '+', while clients send
    -- E.164 WITH one. complete-account/index.ts matches both spellings for the same reason; a
    -- single-spelling comparison silently reports "no methods" for every phone account.
    select u.id, u.email, u.phone, exists (select 1 from auth_password_set s where s.user_id = u.id)
      into v_user_id, v_email, v_phone, v_pwd
      from auth.users u
     where u.phone in (v_norm, '+' || v_norm)
     limit 1;
  else
    select u.id, u.email, u.phone, exists (select 1 from auth_password_set s where s.user_id = u.id)
      into v_user_id, v_email, v_phone, v_pwd
      from auth.users u
     where lower(u.email) = v_norm
     limit 1;
  end if;

  -- Social providers come from auth.identities and NOWHERE else. Never infer "has Google" from an
  -- @gmail.com address: a Gmail address with only a password would be offered a Google button
  -- that cannot sign the user in, which is the exact dead end this feature exists to remove.
  return query
  select
    (v_email is not null and v_email <> ''),
    (v_phone is not null and v_phone <> ''),
    (v_user_id is not null and exists (select 1 from auth.identities i where i.user_id = v_user_id and i.provider = 'google')),
    (v_user_id is not null and exists (select 1 from auth.identities i where i.user_id = v_user_id and i.provider = 'apple')),
    coalesce(v_pwd, false),
    mask_email(v_email),
    mask_phone(v_phone);
end;
$$;

revoke execute on function auth_methods_for(text) from public, anon, authenticated;
grant execute on function auth_methods_for(text) to anon, authenticated;

do $$
begin
  if not has_function_privilege('anon', 'public.auth_methods_for(text)', 'execute') then
    raise exception 'anon lost auth_methods_for — "Try another way" cannot run before sign-in';
  end if;
end $$;
