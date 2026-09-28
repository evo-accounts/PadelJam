-- 0120_profiles_write_grants.sql
--
-- Clients may write only the profile columns the app actually lets a user edit.
--
-- Before this, `anon` and `authenticated` held INSERT and UPDATE on EVERY profiles column (Supabase's
-- default table grants, never narrowed). `profiles: update` (id = auth.uid()) kept the write to your
-- own row, but inside that row anything went: a signed-in user could PATCH their own
--   * email / phone      — the copies of auth.users that auth_methods_for, blasts and the roster
--                          trust, pointing them at an address or number nobody verified;
--   * terms_accepted_at  — the consent record complete-account writes from the SERVER clock;
--   * deleted_at         — flip themselves in or out of "deleted" without soft_delete_account;
--   * created_at / id    — history and identity;
--   * onboarded_at / notifications_prompted_at — with any timestamp they liked;
--   * location_point / location_text — around set_my_location, the only sanctioned writer.
--
-- INVENTORY of client writes to profiles (apps/mobile, apps/web, packages/api) when this was written:
--   useUpdateProfile (packages/api/src/profile/mutations.ts) — the ONLY client UPDATE. Its input type
--     is exactly: full_name, description, dominant_hand, court_side, gender, preferred_time,
--     date_of_birth, avatar_url, locale. Callers: onboarding hand/side, Account Settings, Game
--     preferences, App preferences (mobile + web).
--   set_my_location RPC (0054, SECURITY DEFINER) — location_point + location_text, onboarding and
--     Account Settings. Runs as the owner, needs no column grant.
--   (onboarding)/notifications.tsx — wrote notifications_prompted_at = client clock. Now
--     mark_notifications_prompted() below.
--   (onboarding)/jammer-plus.tsx — wrote onboarded_at = client clock. Now mark_onboarded() below.
--   INSERT: none. The row is created by complete-account / provision-social-profile with the service
--     role, and profiles has no INSERT policy, so a client INSERT was already refused by RLS.
--   DELETE: none (soft_delete_account, SECURITY DEFINER). No DELETE policy either.
--
-- What changes:
--   * INSERT, UPDATE, DELETE and TRUNCATE on profiles are revoked from anon and authenticated.
--   * authenticated gets UPDATE on the nine user-editable columns only. anon gets no write at all.
--   * Two SECURITY DEFINER RPCs replace the onboarding writes, stamping now() server-side (no
--     client-supplied timestamp) and only the first time (coalesce), for the caller's own row.
--   * The `profiles: update` policy stays: it is still what limits the nine columns to your own row.
--   * service_role, postgres and SECURITY DEFINER functions (set_my_location, soft_delete_account,
--     sync_profile_contact, the edge functions' admin client) are unaffected.
--
-- CONSEQUENCE FOR FUTURE MIGRATIONS: a new profiles column is NOT client-writable until granted —
--   grant update (<column>) on public.profiles to authenticated;
-- (and, per 0115/0119, `grant select (<column>) … to anon, authenticated` if clients read it).
-- Decide per column; server-controlled state belongs behind a SECURITY DEFINER function instead.
--
-- HOSTED: do NOT paste until a TestFlight build containing this change is live. An older build's
-- onboarding writes notifications_prompted_at and onboarded_at directly; both now fail with 42501,
-- and neither call site checks the error, so a user finishing onboarding on an old build lands on the
-- tabs but is routed back into onboarding on every launch. Probe:
--   select not has_column_privilege('authenticated', 'public.profiles', 'onboarded_at', 'UPDATE')
--     and to_regprocedure('public.mark_onboarded()') is not null as has_0120;

revoke insert, update, delete, truncate on public.profiles from anon, authenticated;

grant update (
  full_name, avatar_url, description, dominant_hand, court_side, gender, date_of_birth,
  preferred_time, locale
) on public.profiles to authenticated;

-- End of onboarding (the Jammer+ step). First completion wins; returns the stored value.
create or replace function mark_onboarded()
returns timestamptz
language plpgsql volatile security definer set search_path = public as $$
declare
  v_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  update profiles set onboarded_at = coalesce(onboarded_at, now())
   where id = auth.uid()
  returning onboarded_at into v_at;
  return v_at;
end $$;
revoke execute on function mark_onboarded() from public, anon, authenticated;
grant execute on function mark_onboarded() to authenticated;

-- The notifications step was put to the user (Enable or Skip). First time wins.
create or replace function mark_notifications_prompted()
returns timestamptz
language plpgsql volatile security definer set search_path = public as $$
declare
  v_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  update profiles set notifications_prompted_at = coalesce(notifications_prompted_at, now())
   where id = auth.uid()
  returning notifications_prompted_at into v_at;
  return v_at;
end $$;
revoke execute on function mark_notifications_prompted() from public, anon, authenticated;
grant execute on function mark_notifications_prompted() to authenticated;

-- Self-check: the final grant set, or nothing.
do $$
declare
  editable constant text[] := array[
    'full_name', 'avatar_url', 'description', 'dominant_hand', 'court_side', 'gender',
    'date_of_birth', 'preferred_time', 'locale'
  ];
  r   text;
  col text;
  p   text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['DELETE', 'TRUNCATE'] loop
      if has_table_privilege(r, 'public.profiles', p) then
        raise exception '0120: % still holds % on profiles', r, p;
      end if;
    end loop;
    for col in
      select a.attname from pg_attribute a
      where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
    loop
      if has_column_privilege(r, 'public.profiles', col, 'INSERT') then
        raise exception '0120: % can still INSERT profiles.%', r, col;
      end if;
      if has_column_privilege(r, 'public.profiles', col, 'UPDATE')
         <> (r = 'authenticated' and col = any (editable)) then
        raise exception '0120: % UPDATE on profiles.% is %, expected %', r, col,
          has_column_privilege(r, 'public.profiles', col, 'UPDATE'), not has_column_privilege(r, 'public.profiles', col, 'UPDATE');
      end if;
    end loop;
  end loop;

  foreach p in array array['mark_onboarded()', 'mark_notifications_prompted()'] loop
    if has_function_privilege('anon', p, 'EXECUTE') then
      raise exception '0120: anon can execute %', p;
    end if;
    if not has_function_privilege('authenticated', p, 'EXECUTE') then
      raise exception '0120: authenticated cannot execute %', p;
    end if;
  end loop;
end $$;
