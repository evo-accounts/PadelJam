-- 0115_profiles_phone_privacy.sql
--
-- UX events plan, decision 2 / bug B11: every signed-in user could read every other user's phone
-- number. `profiles: read` (0055) admits any authenticated caller to every unblocked row, and 0030
-- granted SELECT on the WHOLE table, so `select phone from profiles` returned the lot. The product
-- decision is that no user ever sees another user's phone (there is no "Call" action anywhere), so
-- the fix is a column privilege, not a policy: RLS filters rows, it cannot hide a column.
--
-- What changes:
--   * The table-level SELECT grant is replaced by a column-level one that lists every column EXCEPT
--     `phone`, for both `authenticated` and `anon`. (anon sees no rows anyway — the read policy
--     requires the authenticated role — but keeps the same column list so an anon query that names
--     safe columns, such as scripts/check-remote-schema.mjs's probe, still answers [] rather than
--     42501.)
--   * Your OWN phone is read from the auth user (session.user.phone). profiles.phone is only ever a
--     copy of auth.users.phone, written server-side (complete-account, provision-social-profile, the
--     0058 sync trigger), so the auth user is the source anyway.
--   * service_role, postgres and every SECURITY DEFINER function (auth_methods_for, soft_delete_account,
--     sync_profile_contact, …) are unaffected: they run as the owner.
--   * INSERT/UPDATE grants are untouched. Clients never write `phone` (it changes through GoTrue),
--     and this migration closes reading only.
--
-- CONSEQUENCE FOR CLIENTS: with one column revoked, `select=*` on profiles — and an unqualified
-- `profiles(*)` embed — now fails with 42501 "permission denied for table profiles". Every read must
-- name its columns. Everything in apps/ and packages/ already does, as of this migration.
--
-- CONSEQUENCE FOR FUTURE MIGRATIONS: `alter table profiles add column …` no longer inherits a SELECT
-- grant — the 0030 default privileges apply to new TABLES, not new columns, and there is no longer a
-- table-level grant to cover it. A new column that clients read needs its own
--   grant select (<column>) on public.profiles to anon, authenticated;
-- or every read that names it fails with 42501.
--
-- HOSTED: do NOT paste until a TestFlight build containing this change is live — an older build that
-- still selects profiles.phone (useMyProfile) fails the moment this lands. Probe:
--   select not has_column_privilege('authenticated', 'public.profiles', 'phone', 'SELECT') as has_0115;

revoke select on public.profiles from anon, authenticated;

grant select (
  id, email, full_name, avatar_url, locale, location_text, location_point, dominant_hand, court_side,
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
    if has_column_privilege(r, 'public.profiles', 'phone', 'SELECT') then
      raise exception '0115: % can still SELECT profiles.phone', r;
    end if;
    -- Every other column must still be readable, or some client read breaks.
    for col in
      select a.attname from pg_attribute a
      where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
        and a.attname <> 'phone'
    loop
      if not has_column_privilege(r, 'public.profiles', col, 'SELECT') then
        raise exception '0115: % lost SELECT on profiles.% — add it to the grant list', r, col;
      end if;
    end loop;
  end loop;
end $$;
