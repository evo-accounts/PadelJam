-- `auth_providers` (0003) has never returned a row to the app, and that is why nothing used it.
--
-- The view reads auth.users and auth.identities and was created `with (security_invoker = true)`,
-- so it runs as the CALLER. `authenticated` holds USAGE on schema auth but no SELECT on either
-- table, so every request died with `42501 permission denied for table users` before the
-- `where u.id = auth.uid()` line was ever reached.
--
-- The fix is NOT `grant select on auth.users to authenticated`: that would hand every signed-in
-- user the whole auth table — every address, every phone number, every password hash — and the
-- view's own filter would do nothing to stop a direct read. Instead the view goes back to the
-- default (definer) security context, so it runs as its owner (`postgres`, which already has the
-- SELECT it needs) while the `where u.id = auth.uid()` clause inside it stays the only row filter.
-- What crosses the boundary is five booleans about the caller's own account and nothing else.
alter view auth_providers set (security_invoker = false);

-- 0030's `alter default privileges ... grant select, insert, update, delete on tables to
-- authenticated` / `grant select on tables to anon` fired when 0003 created this view, so it
-- carries write grants it can never honour and an anon grant it must not have. anon has no
-- auth.uid(), so the view would answer it with zero rows rather than a leak — but a definer-context
-- relation over auth.users should not be reachable without a session at all.
revoke all on auth_providers from public, anon, authenticated;
grant select on auth_providers to authenticated;

-- Self-check, in the spirit of 0094: a partial paste into the hosted SQL editor must not leave
-- this half-applied and silently unreadable (or silently open to anon) again.
do $$
begin
  if not has_table_privilege('authenticated', 'public.auth_providers', 'select') then
    raise exception 'auth_providers is not readable by authenticated';
  end if;
  if has_table_privilege('anon', 'public.auth_providers', 'select') then
    raise exception 'auth_providers is still readable by anon';
  end if;
  if (select reloptions::text from pg_class where oid = 'public.auth_providers'::regclass)
     ilike '%security_invoker=true%' then
    raise exception 'auth_providers is still security_invoker — authenticated cannot read auth.users';
  end if;
end $$;
