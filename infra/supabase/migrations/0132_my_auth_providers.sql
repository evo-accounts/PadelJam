-- The auth_providers view (0003, repaired by 0097, redefined by 0101) stops reading auth.users. Its
-- answer moves into a function, my_auth_providers(), and the view becomes a thin shim over that
-- function for app builds that still query it. Supabase's security advisor flags the old view twice,
-- both at ERROR level:
--   * auth_users_exposed    (lint 0002) — a view in an API schema that reads auth.users and that
--                                         anon or authenticated can select;
--   * security_definer_view (lint 0010) — a view that runs as its owner, not as the caller.
--
-- NEITHER FLAG IS A LEAK TODAY, and the function answers exactly what the view answered. The
-- view's only row filter is `where u.id = auth.uid()`, it carries five booleans about the caller's
-- own account, and 0097 revoked anon. What the lints object to is the SHAPE: a selectable relation
-- over auth.users, in front of which one WHERE clause is the only thing standing. Drop or loosen
-- that line in some future redefinition — 0101 already had to restate the whole view to change one
-- expression — and every row of auth.users is readable at /rest/v1/auth_providers. The lints
-- cannot read a WHERE clause, so they flag the shape. They are right to.
--
-- NO VIEW OVER auth.users CAN PASS. 0002 flags a definer view over auth.users outright, and it
-- flags an INVOKER view over auth.users too, because auth.users has no RLS. 0003 was an invoker
-- view, and 0097 found it had never returned a row: `authenticated` cannot select auth.users, so
-- every call died with 42501. The only way to give a signed-in user facts from auth.users without
-- granting them the table is code that runs as the owner — a SECURITY DEFINER function, the same
-- thing auth_methods_for (0096) and every my_* RPC in this schema already are.
--
-- WHAT THIS TRADES FOR WHAT. The function joins the WARN-level list that lint 0029
-- (authenticated_security_definer_function_executable) keeps of every SECURITY DEFINER function
-- `authenticated` may execute — the list my_groups and auth_methods_for are already on. That lint
-- flags the mechanism, not a mistake, and it is a separate review. In exchange, two ERRORs go, and
-- no relation in the API reads auth.users any more. A function's body is the whole of what it can
-- return, and it takes no argument that could name somebody else.
--
-- WHO CALLS WHAT. The current client (packages/api useAuthProviders, for the Privacy row and the
-- Change password screen, which both branch on has_password) calls the function. But every build
-- already on a tester's phone — TestFlight build 17 and older — still selects
-- `has_password, has_email, has_phone, has_google, has_apple` from the auth_providers VIEW. Simply
-- dropping the view would send those builds a 404. Their fallback is "assume a password exists",
-- which puts passwordless testers back in front of a current-password field they cannot fill: the
-- dead end 0101 removed. So the view stays for now, rebuilt as a security_invoker shim that reads
-- the function and nothing else. It does not touch auth.users, so neither lint applies to it, and it
-- can never return more than the function does. DROP IT once no tester runs a build older than the
-- first one that calls my_auth_providers(); a one-line migration, and the self-check below names
-- the view so a search finds this note. Nothing else reads the view: apps/web never did, no select
-- embeds it, and packages/db's types deliberately leave the shim out so no new code starts.

-- The same five booleans as 0101's view, with the same expressions, except that has_email and
-- has_phone treat '' like NULL, as auth_methods_for (0096) does. GoTrue itself writes NULL for a
-- missing address (the unique keys on auth.users rule out repeated ''), so this only matters for a
-- hand-written row. It keeps the two answers about one account identical. No client reads either
-- column today. user_id is dropped: the caller knows who they are, and the function only ever
-- answers for one person.
--
-- `pg_temp` LAST, for the reason given above record_password_set in 0101: without it a temporary
-- table could shadow auth_password_set for the duration of a session.
create or replace function my_auth_providers()
returns table (has_email boolean, has_phone boolean, has_google boolean,
               has_apple boolean, has_password boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    coalesce(u.email, '') <> '',
    coalesce(u.phone, '') <> '',
    exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google'),
    exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'apple'),
    exists (select 1 from auth_password_set s where s.user_id = u.id)
  from auth.users u
  where u.id = auth.uid();
$$;

-- authenticated only. 0030's default privileges grant every new function to anon and authenticated,
-- and `from public` alone does not undo that (0094). anon has no auth.uid(), so the body would
-- answer it with zero rows. Even so, whether a role can reach the owner's privileges at all should
-- be decided by a grant, not by the WHERE clause. 0097 applied the same reasoning to the view.
revoke execute on function my_auth_providers() from public, anon, authenticated;
grant execute on function my_auth_providers() to authenticated;

-- The shim. It is dropped and recreated rather than CREATE OR REPLACEd, because it loses 0003's
-- user_id column and REPLACE cannot drop one. No CASCADE: nothing depends on the view today, and if
-- something has started to, this fails and says so instead of taking it down silently.
-- security_invoker on purpose. The view then runs as its caller, who needs EXECUTE on the function
-- (authenticated has it, anon does not). The privileged read stays inside the function, which is
-- the one place that is allowed to do it.
drop view if exists auth_providers;
create view auth_providers with (security_invoker = true) as
  select p.has_password, p.has_email, p.has_phone, p.has_google, p.has_apple
  from my_auth_providers() p;
-- 0030's default privileges again: a new view arrives with write grants and an anon SELECT.
revoke all on auth_providers from public, anon, authenticated;
grant select on auth_providers to authenticated;

-- Self-check, in the spirit of 0094/0097/0101. The hosted database is updated by pasting this file
-- into the dashboard SQL editor, and every failure below would otherwise be silent in production.
-- The editor runs the whole paste as one transaction, so if this raises, nothing above it lands.
do $$
declare
  v_probe uuid := gen_random_uuid();
  v_rows  integer;
  v_row   record;
begin
  if not (select p.prosecdef from pg_proc p where p.oid = 'public.my_auth_providers()'::regprocedure) then
    raise exception 'my_auth_providers is not SECURITY DEFINER — authenticated cannot read auth.users through it';
  end if;
  if has_function_privilege('anon', 'public.my_auth_providers()', 'execute') then
    raise exception 'my_auth_providers is executable by anon';
  end if;
  if not has_function_privilege('authenticated', 'public.my_auth_providers()', 'execute') then
    raise exception 'my_auth_providers is not executable by authenticated — Privacy and Change password cannot tell whether a password exists';
  end if;

  -- The shim is only acceptable while it has the two properties the advisor checks for: it runs as
  -- the caller, and nothing in its definition touches auth.users. If either is lost, both ERRORs
  -- are back. (Drop the view once no tester runs build 17 or older — see the header.)
  if coalesce((select c.reloptions::text from pg_class c where c.oid = 'public.auth_providers'::regclass), '')
     not ilike '%security_invoker=true%' then
    raise exception 'auth_providers is not security_invoker — the advisor flags it (lint 0010)';
  end if;
  if exists (
    select 1
      from pg_depend d
      join pg_rewrite r on r.oid = d.objid
     where r.ev_class = 'public.auth_providers'::regclass
       and d.refobjid in ('auth.users'::regclass, 'auth.identities'::regclass)
  ) then
    raise exception 'auth_providers reads the auth tables directly again — the advisor flags it (lint 0002)';
  end if;
  if has_table_privilege('anon', 'public.auth_providers', 'select') then
    raise exception 'auth_providers is readable by anon';
  end if;
  if not has_table_privilege('authenticated', 'public.auth_providers', 'select') then
    raise exception 'auth_providers is not readable by authenticated — builds that still query it lose has_password';
  end if;

  -- Existing is not the same as answering. 0003's view existed for months and never returned a row,
  -- so both the function and the shim are exercised for real against a throwaway auth.users row,
  -- the way 0101 tests its trigger. The function runs as its owner whoever calls it, and the grants
  -- are asserted above, so calling it from here proves what the app's call would see. The row has
  -- no email or phone at first, so it collides with no unique key. It is deleted before this block ends.
  insert into auth.users (id, encrypted_password) values (v_probe, 'placeholder-hash');
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_probe)::text, true);

  select count(*) into v_rows from my_auth_providers();
  if v_rows <> 1 then
    raise exception 'my_auth_providers returned % rows for a signed-in caller, expected 1', v_rows;
  end if;
  select * into v_row from my_auth_providers();
  if v_row.has_email or v_row.has_phone or v_row.has_google or v_row.has_apple or v_row.has_password then
    raise exception 'a bare account reported a sign-in method: %', row_to_json(v_row);
  end if;

  -- Live, not cached: an address and a chosen password (recorded by 0101's trigger) show up on the
  -- very next call. The Change password screen relies on this after it sets a first password.
  update auth.users
     set email = 'my-auth-providers-' || v_probe || '@probe.invalid',
         encrypted_password = 'a-chosen-password-hash'
   where id = v_probe;
  select * into v_row from my_auth_providers();
  if not (v_row.has_email and v_row.has_password) or v_row.has_phone then
    raise exception 'my_auth_providers did not follow the account: %', row_to_json(v_row);
  end if;
  -- The shim must give the old client the same answer.
  if (select count(*) from auth_providers) <> 1
     or not (select a.has_email and a.has_password and not a.has_phone from auth_providers a) then
    raise exception 'auth_providers no longer answers like my_auth_providers';
  end if;

  -- Nobody else's row, ever: another session's id, and no session at all, both get nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
  select count(*) into v_rows from my_auth_providers();
  if v_rows <> 0 or (select count(*) from auth_providers) <> 0 then
    raise exception 'my_auth_providers answered for a caller who is not the account';
  end if;
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_rows from my_auth_providers();
  if v_rows <> 0 then
    raise exception 'my_auth_providers answered without a session';
  end if;

  delete from auth.users where id = v_probe;
end $$;
