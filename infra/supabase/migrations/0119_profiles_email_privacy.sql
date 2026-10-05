-- 0119_profiles_email_privacy.sql
--
-- The email half of 0115. `profiles: read` (0055) admits every signed-in caller to every unblocked
-- profile row, and after 0115 the column-level SELECT grant still listed `email`, so
-- `select id, email from profiles` handed any user the address of everybody in the app. No screen
-- shows another user's email (invitations, blasts and the roster CSV resolve addresses server-side,
-- through SECURITY DEFINER functions and the service role), so — exactly as for phone — the fix is a
-- column privilege: RLS filters rows, it cannot hide a column.
--
-- What changes:
--   * The column-level SELECT grant from 0115 is replaced by one that lists every column EXCEPT
--     `phone` AND `email`, for both `anon` and `authenticated` (anon keeps the same list so the
--     named-column probe in scripts/check-remote-schema.mjs still answers [] rather than 42501).
--   * Your OWN email is read from the auth user (session.user.email), exactly like your own phone
--     since 0115 (packages/api useMyProfile, `ownEmail`). profiles.email is only ever a copy of
--     auth.users.email written server-side — complete-account, provision-social-profile and the
--     0058 sync_profile_contact trigger — so the auth user is the source anyway.
--   * A WHERE on a column needs SELECT on it too, so `email=eq.…` filters from a client now fail
--     with 42501 instead of acting as an "is this address registered?" oracle. Nothing in apps/ or
--     packages/ filters profiles by email; auth lookups go through auth_methods_for (SECURITY
--     DEFINER, reads auth.users as the owner) and are unaffected.
--   * service_role, postgres and every SECURITY DEFINER function (auth_methods_for,
--     blast_email_recipients, soft_delete_account, sync_profile_contact, …) are unaffected: they run
--     as the owner. No SECURITY INVOKER function, view or RLS policy reads profiles.email (checked
--     against pg_proc / pg_policies / pg_depend when this was written).
--
-- CONSEQUENCE FOR CLIENTS (unchanged from 0115): `select=*` on profiles and an unqualified
-- `profiles(*)` embed fail with 42501. Every read names its columns.
--
-- CONSEQUENCE FOR FUTURE MIGRATIONS (unchanged from 0115): a new profiles column clients read needs
--   grant select (<column>) on public.profiles to anon, authenticated;
-- or every read that names it fails with 42501.
--
-- HOSTED: do NOT paste until a TestFlight build containing this change is live — an older build's
-- useMyProfile still selects profiles.email, so Account Settings fails to load on it the moment this
-- lands (and the web app must be deployed from the same commit first). Probe:
--   select not has_column_privilege('authenticated', 'public.profiles', 'email', 'SELECT') as has_0119;

revoke select on public.profiles from anon, authenticated;

grant select (
  id, full_name, avatar_url, locale, location_text, location_point, dominant_hand, court_side,
  onboarded_at, created_at, description, date_of_birth, gender, preferred_time, deleted_at,
  terms_accepted_at, notifications_prompted_at
) on public.profiles to anon, authenticated;

-- Self-check: fail the whole script rather than leave a half-applied state behind.
do $$
declare
  r   text;
  col text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach col in array array['phone', 'email'] loop
      if has_column_privilege(r, 'public.profiles', col, 'SELECT') then
        raise exception '0119: % can still SELECT profiles.%', r, col;
      end if;
    end loop;
    -- Every other column must still be readable, or some client read breaks.
    for col in
      select a.attname from pg_attribute a
      where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
        and a.attname not in ('phone', 'email')
    loop
      if not has_column_privilege(r, 'public.profiles', col, 'SELECT') then
        raise exception '0119: % lost SELECT on profiles.% — add it to the grant list', r, col;
      end if;
    end loop;
  end loop;
end $$;
