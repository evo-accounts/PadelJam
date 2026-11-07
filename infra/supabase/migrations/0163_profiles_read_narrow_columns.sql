-- 0163_profiles_read_narrow_columns.sql
--
-- PAD-167, PR C of 3: the revokes. `profiles: read` (0055) admits every signed-in caller to every
-- unblocked profile row, and the column grant (0119, then 0148) still listed locale, onboarded_at,
-- terms_accepted_at, notifications_prompted_at, created_at, deleted_at, description, dominant_hand,
-- court_side, level, preferred_time and location_text, so any user could read them for everybody.
-- RLS filters rows; it cannot hide a column.
--
-- What changes:
--   * SELECT on profiles is limited to id, full_name and avatar_url (the player directory: inviting by
--     name, member lists, embeds) for anon and authenticated. This also drops date_of_birth, gender and
--     location_point, which PAD-133's migration (PR 2) revokes on its own; revoking them here too makes
--     this file safe whichever of the two applies first.
--   * Your own row now comes from get_my_profile_state() and get_my_private_profile() (0161, 0149).
--     Clients moved in #350.
--   * community_plan(uuid) is no longer executable by authenticated: clients call
--     get_my_community_plan. SECURITY DEFINER functions call community_plan as the owner, so
--     join limits still work.
--   * Writes are untouched: UPDATE grants stay (0120, 0148) and `profiles: update` uses only id;
--     useUpdateProfile does not select the row back.
--   * A WHERE or ORDER BY on a revoked column needs SELECT too, so filters fail with 42501.
--   * service_role, postgres and SECURITY DEFINER functions run as the owner and are unaffected.
--
-- CONSEQUENCE FOR FUTURE MIGRATIONS: a new profiles column that clients read directly needs
--   grant select (<column>) on public.profiles to anon, authenticated;
-- Prefer exposing own-row fields through get_my_profile_state.
--
-- HOSTED: do NOT merge until a build containing #350 is live on iOS, Android and web. A released
-- build's useMyProfile and sign-in routing select these columns and fail with 42501 the moment this
-- lands. Probe:
--   select not has_column_privilege('authenticated', 'public.profiles', 'locale', 'SELECT') as has_0163;

revoke select on public.profiles from anon, authenticated;
grant select (id, full_name, avatar_url) on public.profiles to anon, authenticated;

revoke execute on function community_plan(uuid) from authenticated;

-- Self-check: fail the whole script rather than leave a half-applied state behind.
do $$
declare
  r   text;
  col text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    for col in
      select a.attname from pg_attribute a
      where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
    loop
      if col in ('id', 'full_name', 'avatar_url') then
        if not has_column_privilege(r, 'public.profiles', col, 'SELECT') then
          raise exception '0163: % lost SELECT on profiles.%', r, col;
        end if;
      elsif has_column_privilege(r, 'public.profiles', col, 'SELECT') then
        raise exception '0163: % can still SELECT profiles.%', r, col;
      end if;
    end loop;
  end loop;
  if has_function_privilege('authenticated', 'public.community_plan(uuid)', 'execute') then
    raise exception '0163: authenticated can still execute community_plan';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE') then
    raise exception '0163: authenticated lost UPDATE on profiles.full_name';
  end if;
end $$;
