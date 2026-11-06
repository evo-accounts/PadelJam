-- 0158_profiles_private_columns_revoke.sql
--
-- PAD-133, PR 2 of 2: the revoke. 0149 (PR 1) added get_my_private_profile() and
-- event_participant_genders() so nobody needs to SELECT date_of_birth, gender or location_point from
-- `profiles` directly. `profiles: read` (0055) admits every signed-in caller to every unblocked
-- row, and 0119's column grant still listed these three, so any user could read everybody's date of
-- birth, gender and coordinates. RLS filters rows, it cannot hide a column.
--
-- What changes:
--   * SELECT on date_of_birth, gender, location_point is revoked from anon and authenticated.
--     "Every column but" now means: every column EXCEPT phone, email, date_of_birth, gender and
--     location_point. A WHERE on one of them needs SELECT too, so filters fail with 42501 as well
--     (no "who is born on …" oracle).
--   * Writes are untouched: UPDATE (date_of_birth, gender) stays granted (0120), and set_my_location
--     (SECURITY DEFINER) writes location_point. useUpdateProfile does not select them back.
--   * service_role, postgres and SECURITY DEFINER functions run as the owner and are unaffected.
--     Checked when this was written: no RLS policy, view or SECURITY INVOKER function reads these
--     columns, and `profiles` is in no realtime publication.
--
-- HOSTED: do NOT merge until a build containing PR 1 (0149 + the client reads) is live on iOS and
-- web: an older build's useMyProfile still selects date_of_birth and gender, so Account Settings and
-- event detail fail the moment this lands. Probe:
--   select not has_column_privilege('authenticated', 'public.profiles', 'date_of_birth', 'SELECT') as has_0158;

revoke select (date_of_birth, gender, location_point) on public.profiles from anon, authenticated;

-- Self-check: fail the whole script rather than leave a half-applied state behind.
do $$
declare
  r   text;
  col text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach col in array array['phone', 'email', 'date_of_birth', 'gender', 'location_point'] loop
      if has_column_privilege(r, 'public.profiles', col, 'SELECT') then
        raise exception '0158: % can still SELECT profiles.%', r, col;
      end if;
    end loop;
    -- Every other column must still be readable, or some client read breaks.
    for col in
      select a.attname from pg_attribute a
      where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
        and a.attname not in ('phone', 'email', 'date_of_birth', 'gender', 'location_point')
    loop
      if not has_column_privilege(r, 'public.profiles', col, 'SELECT') then
        raise exception '0158: % lost SELECT on profiles.% — add it to the grant list', r, col;
      end if;
    end loop;
  end loop;
  if not has_column_privilege('authenticated', 'public.profiles', 'date_of_birth', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.profiles', 'gender', 'UPDATE') then
    raise exception '0158: authenticated lost UPDATE on date_of_birth or gender';
  end if;
end $$;
