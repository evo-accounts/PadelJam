-- UX-AUTH-04 "Try another way": before a user is authenticated, tell the sheet which sign-in
-- methods would actually sign THIS identifier in, so it can offer real options instead of a menu
-- of every method the app supports.
--
-- THE TRADEOFF, stated plainly. 0083 chose a param-less function precisely so nothing could be
-- enumerated ("Param-less -> no enumeration"). This function is PARAMETERISED, so it makes
-- account existence discoverable: whoever can call it can learn that some identifier has methods
-- attached. That is a deliberate product decision for UX-AUTH-04, not an oversight — a sheet that
-- cannot say which methods exist has to list them all, and every extra option is a dead end the
-- user discovers only after another failed code. The mitigations, all of them in this file:
--   1. masked-only output   — no raw identifier ever leaves the database (mask_email/mask_phone).
--   2. dual rate limits     — per identifier (5 / 15 min) and per caller address (30 / 15 min).
--   3. no "found" flag      — an unknown identifier returns all-false, which is byte-for-byte
--                             what an account whose only method is the one already in use
--                             returns. "Nothing else to offer" and "no such account" are the
--                             same answer on the wire.
-- What an attacker can still learn, so nobody is surprised later: five guesses per identifier per
-- quarter hour, each answering "does this identifier have a sign-in method other than the one
-- being attempted". Deleted accounts are already invisible here — 0087 scrubs their email/phone
-- off auth.users, so their old identifiers match nothing.
--
-- WHY AN RPC AND NOT AN EDGE FUNCTION. Every existing edge function resolves its caller with
-- getUser() on a bearer token (complete-account, delete-account, stream-token, ensure-channel,
-- send-blast, send-roster-csv, provision-social-profile); a pre-auth caller has no token, so that
-- pattern cannot apply. The only function with verify_jwt = false is send-push, and its auth
-- boundary is a shared secret the client does not have. An unauthenticated edge function would
-- therefore be a NEW, wider hole: unauthenticated, service-role-capable, and outside RLS, with
-- rate limiting to be hand-rolled anyway. A security-definer RPC keeps the blast radius to this
-- one function, and the limiter next to the data it protects.
--
-- auth_providers (0003) is deliberately left alone. It is security_invoker and scoped to
-- auth.uid(), so it answers the POST-authentication question ("what is linked to ME?"), which
-- this feature never asks — at "Try another way" time there is no session yet. Two objects, two
-- questions; widening the view to take a parameter would have turned a safe, self-scoped view
-- into an unlimited enumeration surface.

-- Rate-limit ledger. Deliberately not a log: the bucket is an md5 of the identifier or address,
-- never the value itself, so the table cannot become a permanent record of every email or phone
-- anyone typed into the app. md5 (not pgcrypto's digest) is the right tool here because this is a
-- bucket key, not a security primitive — nothing is protected by its collision resistance.
create table if not exists auth_lookup_attempts (
  bucket text not null,
  at     timestamptz not null default now()
);
create index if not exists auth_lookup_attempts_bucket_at_idx on auth_lookup_attempts (bucket, at desc);

-- RLS on with ZERO policies: no client role can read or write a row. Only auth_methods_for
-- touches this table, and it runs SECURITY DEFINER as the owner, which bypasses RLS.
alter table auth_lookup_attempts enable row level security;
-- Belt and braces: 0030's default privileges hand every new table select/insert/update/delete to
-- authenticated and select to anon. RLS already makes those grants return nothing, but a future
-- policy added by someone who did not read this comment would silently open the ledger.
revoke all on table auth_lookup_attempts from anon, authenticated;

-- Masking helpers. MASK IN SQL, never in the client: the raw identifier must not leave the
-- database, so there is no code path in which a caller could read it.
create or replace function mask_email(p_email text) returns text
language sql immutable as $$
  -- 'joao@gmail.com' -> 'j•••@gmail.com'. First letter plus the domain is enough for a user to
  -- recognise their own address and not enough for a stranger to learn a new one.
  select case
    when p_email is null or position('@' in p_email) < 2 then null
    else left(p_email, 1) || '•••' || substr(p_email, position('@' in p_email))
  end;
$$;

create or replace function mask_phone(p_phone text) returns text
language sql immutable as $$
  -- '+351912345678' -> '+351•••••5678'. Format-neutral on purpose: Postgres has no libphonenumber,
  -- so the leading three digits are "dial-code-ish", not a parsed dial code — the client typesets
  -- the number properly. Never more than the last four digits, and a short/odd number is masked
  -- whole rather than guessed at.
  with d as (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as digits)
  select case
    when length(digits) = 0 then null
    when length(digits) <= 7 then repeat('•', length(digits))
    else '+' || left(digits, 3) || repeat('•', length(digits) - 7) || right(digits, 4)
  end
  from d;
$$;

create or replace function auth_methods_for(p_identifier text)
returns table (has_email boolean, has_phone boolean, has_google boolean,
               has_apple boolean, has_password boolean,
               email_masked text, phone_masked text)
language plpgsql volatile security definer set search_path = public as $$
declare
  c_window    constant interval := interval '15 minutes';
  c_id_limit  constant integer  := 5;
  c_ip_limit  constant integer  := 30;
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

  -- x-forwarded-for is SPOOFABLE — it is client-supplied text the gateway appends to. It is
  -- therefore the SECONDARY limit (a coarse brake on a single noisy source), never the primary
  -- one; the per-identifier limit above is what actually bounds enumeration of one account.
  -- current_setting(..., true) returns null when PostgREST did not set the GUC (a direct psql
  -- call, a trigger), and the cast/extract must not throw in that case.
  begin
    v_ip := split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1);
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

  insert into auth_lookup_attempts (bucket) values (v_id_bucket);
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
    select u.id, u.email, u.phone, (u.encrypted_password is not null and u.encrypted_password <> '')
      into v_user_id, v_email, v_phone, v_pwd
      from auth.users u
     where u.phone in (v_norm, '+' || v_norm)
     limit 1;
  else
    select u.id, u.email, u.phone, (u.encrypted_password is not null and u.encrypted_password <> '')
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

-- Grants, per the rule in 0094: `revoke ... from public` alone leaves 0030's explicit anon /
-- authenticated grants in place, so every function created here must be revoked from all three
-- and then granted back only where a client genuinely needs it.
revoke execute on function mask_email(text)        from public, anon, authenticated;
revoke execute on function mask_phone(text)        from public, anon, authenticated;
revoke execute on function auth_methods_for(text)  from public, anon, authenticated;

-- anon is not optional here: the caller has no session yet, so a lookup anon cannot run is a
-- lookup that never runs. authenticated too — a signed-in user re-authenticating (adding a
-- method, an expired session on a warm app) hits the same sheet.
grant execute on function auth_methods_for(text) to anon, authenticated;

-- Self-check, modelled on 0094's, so a partial paste into the hosted SQL editor cannot leave the
-- feature half-applied. Asserted in BOTH directions: the mask helpers must be closed, and
-- auth_methods_for must be OPEN to anon — a pre-auth lookup anon cannot call is useless, and that
-- failure would only show up as an empty sheet in production.
do $$
declare v_open text; v_shut boolean;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_open
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('mask_email', 'mask_phone')
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if v_open is not null then
    raise exception 'mask helpers still executable by anon/authenticated: %', v_open;
  end if;

  select not has_function_privilege('anon', p.oid, 'execute') into v_shut
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'auth_methods_for';
  if v_shut is null then
    raise exception 'auth_methods_for was not created';
  end if;
  if v_shut then
    raise exception 'auth_methods_for is not executable by anon — the pre-auth lookup cannot run';
  end if;
end $$;
