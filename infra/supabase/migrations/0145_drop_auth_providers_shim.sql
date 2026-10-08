-- Drops the auth_providers view. 0132 moved its answer into my_auth_providers() and kept the view
-- only as a shim for app builds that still selected from it: TestFlight build 17 and older. Build 18
-- (2026-10-07, at 8a7d62f4) is the first TestFlight build that calls the function, and nothing else
-- reads the view: apps/web never did, no select embeds it, and packages/db's types leave it out.
--
-- HOSTED GATE: paste this only once no tester runs build 17 or older. Those builds would get a 404
-- from /rest/v1/auth_providers, fall back to "assume a password exists", and show a passwordless
-- tester the current-password field they cannot fill — the dead end 0101 removed. Nothing else on
-- those builds reads the view, so the cost of pasting early is that one screen, for those testers.
-- Locally and in CI the order does not matter: the app built from this repo never reads the view.
--
-- No CASCADE, as in 0132: nothing should depend on the view, and if something has started to, this
-- fails and names it instead of taking it down silently. IF EXISTS keeps a re-paste harmless.
drop view if exists auth_providers;

-- Self-check, in the spirit of 0132. The editor runs the paste as one transaction, so if this
-- raises, the view stays.
do $$
begin
  if to_regclass('public.auth_providers') is not null then
    raise exception 'auth_providers still exists';
  end if;
  -- What replaced it must still be there for the current app: the Privacy row and the Change
  -- password screen call it.
  if to_regprocedure('public.my_auth_providers()') is null then
    raise exception 'my_auth_providers() is missing — apply 0132 first; the app has nothing to read';
  end if;
  if not has_function_privilege('authenticated', 'public.my_auth_providers()', 'execute') then
    raise exception 'my_auth_providers is not executable by authenticated';
  end if;
  if has_function_privilege('anon', 'public.my_auth_providers()', 'execute') then
    raise exception 'my_auth_providers is executable by anon';
  end if;
end $$;
