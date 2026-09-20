-- has_password has never meant "this user can type a password". Both definitions INFERRED it from
-- auth.users.encrypted_password being non-empty, and that column is non-empty for everybody.
--
-- WHY IT IS WRONG. `POST /auth/v1/otp` with create_user does not merely send a code: it CREATES
-- the user, and GoTrue gives that brand-new row a random 60-character bcrypt hash rather than
-- leaving the column null. Not null, not '', and — the plaintext behind it having never existed
-- anywhere a human could see it — unguessable and untypable. Every OTP-created account therefore
-- satisfied `(encrypted_password is not null and encrypted_password <> '')`, which is exactly the
-- expression both definitions of has_password used:
--   * the auth_providers view       (0003_profiles.sql)
--   * the auth_methods_for function (0096_auth_methods_lookup.sql)
-- So the flag answered "does a hash exist", when every screen reading it asks "can this person
-- sign in with a password they know". For a passwordless account those two questions have
-- opposite answers.
--
-- WHAT IT COST THE USER — two dead ends, both of which look like the user's own fault:
--   * "Try another way" (UX-AUTH-04) offered a Password row to people who have never had one.
--     They are asked for a password that cannot exist, and all the screen can tell them is that
--     it is wrong.
--   * profile/change-password.tsx reads the same flag, so it opened in CHANGE mode: it demanded
--     the CURRENT password and verified it with signInWithPassword, a call that can only ever
--     fail for these accounts. The one way out (Create password, which calls setPassword with no
--     current one) was gated behind this flag being false, so nobody could reach it.
--
-- THE MEASUREMENT this file is built on (local stack, 2026-09-20), md5 of the stored hash:
--   1. create a user by OTP                    -> fe037e1c…
--   2. request a SECOND OTP for the same user  -> fe037e1c…   UNCHANGED
--   3. set a real password via the admin API   -> 2afebf00…   CHANGED
-- "encrypted_password changed" therefore fires exactly when a password is chosen, and never on a
-- repeat sign-in: GoTrue writes the placeholder once, at INSERT, and then leaves it alone.
-- That is the entire basis for the AFTER UPDATE trigger below — and the reason it must not fire
-- on INSERT, because the INSERT *is* the placeholder, i.e. the bug.
--
-- WHY A TRIGGER AND NOT APP-SIDE WRITES. A password reaches auth.users through
-- auth.updateUser({ password }) — packages/auth/src/password.ts (setPassword, changePassword),
-- called from (auth)/new-password, (auth)/create-account and profile/change-password on mobile
-- and from useAuthFlow on web, plus whatever GoTrue itself does on a recovery flow. An app-side
-- "now record it" write would have to be added at every one of those sites, would be a second
-- round-trip that can fail on its own AFTER the password is already set (leaving the two facts
-- disagreeing, which is how we got here), and would be forgotten by the next site someone adds.
-- The database sees all of them, including the ones no client code goes through.
--
-- WHY auth.users AND NOT profiles. auth_methods_for deliberately answers for a user who exists in
-- auth.users with NO profiles row at all — the mid-signup state, identifier verified and account
-- not completed, which is precisely when "Try another way" matters most. A table keyed on
-- profiles would report "no password" for exactly those people, and 0087's soft delete would
-- silently drop the record for the rest. Triggers on auth.users are an established pattern here:
-- 0058 (sync_profile_contact), 0087 and 0088 all write or read across that boundary.
--
-- The column keeps its name and its boolean shape on purpose. apps/mobile, apps/web and
-- packages/api already branch on has_password correctly; they were being fed a wrong value, not
-- reading it wrongly, so nothing outside this file changes.

-- One row per user who has actually chosen a password. Presence IS the fact; set_at costs nothing
-- to record now and cannot be recovered later.
-- `if not exists`, like 0096's auth_lookup_attempts and for the same reason: with this and the
-- trigger drop below, every statement in this file is re-runnable, so a second paste into the
-- hosted SQL editor is a no-op rather than a 42P07 that aborts the script.
create table if not exists auth_password_set (
  user_id uuid primary key references auth.users(id) on delete cascade,
  set_at  timestamptz not null default now()
);

-- RLS on with ZERO policies, exactly like 0096's auth_lookup_attempts: no client role reads this
-- table directly. The two consumers below reach it as the owner — auth_providers because 0097
-- made it a definer-context view, auth_methods_for because it is SECURITY DEFINER — and the owner
-- is the table's owner, so RLS does not apply to either.
alter table auth_password_set enable row level security;
-- Belt and braces, per 0096: 0030's default privileges hand every new table
-- select/insert/update/delete to authenticated and select to anon. RLS already makes those return
-- nothing, but a policy added later by someone who has not read this comment would silently
-- publish who has a password and when they set it.
revoke all on table auth_password_set from anon, authenticated;

-- `pg_temp` LAST, and named explicitly. `set search_path = public` alone leaves pg_temp ahead of
-- it, so a caller who can create a temporary table can shadow `auth_password_set` and make this
-- function write somewhere else. Nothing reachable through PostgREST can do that, but this is the
-- auth surface and the fix costs a word.
create or replace function record_password_set()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- A password being TAKEN AWAY is a real event, not a change to skip. '' or null means the
  -- account can no longer sign in with a password, so the record must go — otherwise has_password
  -- stays true and the user is sent back to the Change-password screen demanding a password they
  -- no longer have, which is the original dead end with a new cause. Handled here rather than by
  -- narrowing the trigger's `when` clause on purpose: a narrower `when` would simply leave the
  -- stale row in place.
  if coalesce(new.encrypted_password, '') = '' then
    delete from auth_password_set where user_id = new.id;
    return new;
  end if;

  -- On conflict rather than a bare insert: a password can be changed more than once, and the
  -- second change must not raise a unique violation. `greatest` keeps set_at monotonic, so an
  -- out-of-order write can never move the recorded moment backwards.
  insert into auth_password_set (user_id, set_at)
  values (new.id, now())
  on conflict (user_id) do update set set_at = greatest(auth_password_set.set_at, excluded.set_at);
  return new;
end;
$$;
-- This body runs inside the UPDATE's own transaction, so an exception raised here ABORTS the
-- password change. That is the right way round and is left as it is: a password that is set but
-- not recorded is precisely the disagreement this migration exists to remove, so failing closed
-- beats drifting apart quietly.
-- No revoke here, and that is not an oversight: 0094's rule covers non-trigger helpers only
-- ("Trigger functions cannot be called through PostgREST and are out of scope") — a function
-- returning `trigger` has no signature PostgREST can call. SECURITY DEFINER is required, though:
-- the UPDATE is executed by GoTrue's own role, which holds nothing in the public schema, so an
-- invoker-context trigger would turn every password change into a permission error.

-- AFTER UPDATE only — never INSERT. See the measurement above.
-- `update of encrypted_password` is the cheap pre-filter; the `when` clause is the real one,
-- because a statement that merely MENTIONS the column fires the column-list trigger even when the
-- value it writes is identical, and GoTrue rewrites user rows on every sign-in.
-- The `when` clause covers removals as well as sets — '' and null are both distinct from a hash —
-- and the function above turns that into a delete. Nothing in GoTrue blanks the column, but
-- apps/mobile/e2e/suites/12-profile-settings.e2e.ts does, to stage a passwordless account, and
-- that fixture goes on working as written.
-- Dropped first so the whole file can be re-run. Every other object here is a CREATE OR REPLACE;
-- a bare CREATE TRIGGER would raise 42710 on a second pass and strand the paste half-applied. That
-- is not hypothetical: the hosted database is updated by pasting these migrations into the
-- dashboard SQL editor by hand (this account cannot `link` or `push`), so a re-paste is ordinary.
drop trigger if exists trg_record_password_set on auth.users;
create trigger trg_record_password_set
  after update of encrypted_password on auth.users
  for each row
  when (old.encrypted_password is distinct from new.encrypted_password)
  execute function record_password_set();

-- NO BACKFILL, on purpose. Pre-launch, every row that exists today is test data, and no SQL can
-- separate a placeholder from a chosen password — that is the whole premise of this file. A
-- backfill could only guess, and "assume everyone has one" is precisely the guess being removed.
-- Two consequences worth knowing before they surprise someone:
--   * existing accounts start out as "no password", which is the safe answer — the app offers
--     Create password, the user sets one, and the trigger records it for real;
--   * a user created WITH a password through `POST /auth/v1/admin/users` is an INSERT too, so it
--     is not recorded either. Nothing in production does that — there is no `signUp` anywhere in
--     apps/ or packages/, every password goes through auth.updateUser — but four fixtures do:
--     infra/seed/seed-e2e.mjs, infra/seed/seed-demo.mjs, infra/seed/audit/client.ts and
--     infra/supabase/tests/lib.mjs (adminCreateUser), plus
--     infra/supabase/tests/complete-account-consent.test.mjs, which posts to the admin endpoint
--     directly. Their personas read as passwordless until a password is set through the app.

-- auth_providers: 0003's definition with ONE expression changed. The column list, its order, and
-- the `where u.id = auth.uid()` that is this view's only row filter are 0003's, unchanged.
--
-- The deliberate exception is 0003's `with (security_invoker = true)`, which must NOT come back.
-- 0097 turned it off after finding the view had never returned a row to anyone: it reads
-- auth.users and auth.identities, `authenticated` holds SELECT on neither, so as an invoker view
-- every call died with 42501 before the auth.uid() filter was even reached. Replacing a view
-- rewrites its reloptions, so the setting is re-applied explicitly below rather than left to the
-- semantics of CREATE OR REPLACE, and the self-check at the foot of this file asserts it.
-- (Grants survive CREATE OR REPLACE untouched, so 0097's `grant select ... to authenticated` and
-- its revoke from anon stand; the self-check asserts those too.)
create or replace view auth_providers as
select
  u.id as user_id,
  (u.email is not null) as has_email,
  (u.phone is not null) as has_phone,
  exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google') as has_google,
  exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'apple')  as has_apple,
  exists (select 1 from auth_password_set s where s.user_id = u.id) as has_password
from auth.users u
where u.id = auth.uid();

alter view auth_providers set (security_invoker = false);

-- auth_methods_for: 0096's function, reproduced in full and changed in exactly one place — the
-- last selected expression of each of the two `select ... into v_user_id, v_email, v_phone, v_pwd`
-- statements, plus `pg_temp` appended to the search_path for the reason given above
-- record_password_set. The rate limiter, the ledger prune, the phone-format trap, the masking and
-- every comment below are 0096's text verbatim; CREATE OR REPLACE means the whole body has to be
-- restated, not that any of it was reconsidered.
create or replace function auth_methods_for(p_identifier text)
returns table (has_email boolean, has_phone boolean, has_google boolean,
               has_apple boolean, has_password boolean,
               email_masked text, phone_masked text)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
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

-- Grants, carried over from 0096 unchanged. CREATE OR REPLACE keeps a function's existing ACL, so
-- these are belt and braces on an applied stack — and the only thing standing between this file
-- and 0030's default privileges if it is ever pasted into a database where 0096 has not run.
-- `from public` alone is not enough while those default privileges are in force (0094).
revoke execute on function auth_methods_for(text)  from public, anon, authenticated;
-- anon is not optional: the caller has no session yet, so a lookup anon cannot run never runs.
grant execute on function auth_methods_for(text) to anon, authenticated;

-- 0097's grants on the view, re-issued rather than merely asserted. Symmetry with the function
-- grants above, and the same reasoning: CREATE OR REPLACE preserves an existing ACL, so on an
-- applied stack these are no-ops — but pasted into a database that never ran 0097 they repair it
-- instead of aborting on the self-check below.
revoke all on auth_providers from public, anon, authenticated;
grant select on auth_providers to authenticated;

-- Self-check, in the spirit of 0094/0096/0097, so a partial paste into the hosted SQL editor
-- cannot leave this half-applied — every failure mode below is silent in production otherwise.
do $$
declare v_probe uuid := gen_random_uuid();
begin
  -- The trigger IS the feature. Without it the table stays empty forever and every account in the
  -- system reads as passwordless — the old bug with its sign flipped.
  if not exists (
    select 1 from pg_trigger t
     where t.tgname = 'trg_record_password_set'
       and t.tgrelid = 'auth.users'::regclass
       and not t.tgisinternal
  ) then
    raise exception 'trg_record_password_set is missing — no password will ever be recorded';
  end if;

  -- 0097's two assertions, restated because this file replaced the view 0097 repaired.
  if (select reloptions::text from pg_class where oid = 'public.auth_providers'::regclass)
     ilike '%security_invoker=true%' then
    raise exception 'auth_providers is security_invoker again — authenticated cannot read auth.users';
  end if;
  if not has_table_privilege('authenticated', 'public.auth_providers', 'select') then
    raise exception 'auth_providers is not readable by authenticated';
  end if;
  -- The other direction matters more: a definer-context relation over auth.users must not be
  -- reachable without a session at all. anon has no auth.uid(), so today the view would answer it
  -- with zero rows rather than a leak — but that is a property of the filter, not a grant.
  if has_table_privilege('anon', 'public.auth_providers', 'select') then
    raise exception 'auth_providers is still readable by anon';
  end if;

  -- The record itself must stay unreachable from the API roles.
  if has_table_privilege('anon', 'public.auth_password_set', 'select')
     or has_table_privilege('authenticated', 'public.auth_password_set', 'select') then
    raise exception 'auth_password_set is readable by an API role';
  end if;

  -- And the pre-auth lookup must still be callable without a session.
  if not has_function_privilege('anon', 'public.auth_methods_for(text)', 'execute') then
    raise exception 'auth_methods_for is not executable by anon — the pre-auth lookup cannot run';
  end if;

  -- Existing is not the same as working, so all three directions are exercised for real on a
  -- throwaway auth.users row. It carries no email and no phone, so it matches no lookup and no
  -- unique index, and it is gone again before this statement ends.
  insert into auth.users (id, encrypted_password) values (v_probe, 'placeholder-hash');
  if exists (select 1 from auth_password_set where user_id = v_probe) then
    raise exception 'the INSERT was recorded as a password — that is the bug this migration fixes';
  end if;

  update auth.users set encrypted_password = 'a-chosen-password-hash' where id = v_probe;
  if not exists (select 1 from auth_password_set where user_id = v_probe) then
    raise exception 'setting a password was not recorded';
  end if;

  update auth.users set encrypted_password = '' where id = v_probe;
  if exists (select 1 from auth_password_set where user_id = v_probe) then
    raise exception 'blanking the password left the record behind — has_password would stay true';
  end if;

  delete from auth.users where id = v_probe;
end $$;
