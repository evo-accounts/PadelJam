-- New functions are CLOSED by default. From this file on, a function created by postgres in public
-- gets no EXECUTE for PUBLIC, anon or authenticated until a migration grants it. Product decision
-- taken with the authorization follow-ups (0137–0142): every future RPC grants explicitly.
--
-- WHY. Two defaults opened every new function to anyone with the publishable key the moment it was
-- created, whether or not anyone was meant to call it:
--   * Postgres's built-in default grants EXECUTE on every new function to PUBLIC, and every role,
--     anon and authenticated included, is a member of PUBLIC;
--   * the default ACL for functions postgres creates in public, which Supabase sets on every
--     project and 0030 (`grant execute on functions to anon, authenticated`) and 0050 (service_role)
--     restated, added explicit anon and authenticated grants on top. Locally (pg_default_acl, before
--     this file): `postgres | public | f | {postgres=X, anon=X, authenticated=X, service_role=X}`,
--     and no global entry, so the built-in PUBLIC grant applied as well.
-- So every helper needed `revoke ... from public, anon, authenticated` straight after it was
-- created (0094's rule), and each time that line was forgotten a hole opened. 0094 closed the
-- internal helpers, 0128 the explore_* lists anon could read, and 0136 another 56 functions,
-- among them get_player_profile and list_followers / list_following (any player's profile and
-- follow graph to anon) and account_has_feature (anyone's Jammer+ status to anyone). 0136 left the
-- defaults alone ("NOT CHANGED: the default privileges themselves"). This file changes them.
--
-- WHAT CHANGES. pg_default_acl only. ALTER DEFAULT PRIVILEGES never touches an existing object, so
-- every function created before this file keeps exactly the grants it has today.
--   1. GLOBAL (no schema): `for role postgres revoke execute on functions from public, anon,
--      authenticated`. Only a global entry can switch off Postgres's built-in PUBLIC grant: a
--      per-schema entry can only ADD to the global default, never take anything away. Locally only
--      PUBLIC is there to remove. anon and authenticated are named too in case a project carries a
--      global grant to them, and on a project that does not, naming them changes nothing. Being
--      global, it covers every schema postgres creates functions in, pg_temp included: an ad-hoc
--      psql harness that creates a pg_temp helper and calls it after `set role authenticated` must
--      grant it, as harness_0135 already does.
--   2. PUBLIC SCHEMA: `for role postgres in schema public revoke execute on functions from public,
--      anon, authenticated`. Removes the explicit grants. One revoke clears both the platform's
--      grant and 0030's, because they are the same ACL item. PUBLIC is named for symmetry; it is
--      not in that entry today.
--   KEPT: service_role keeps its default EXECUTE (0050). It is the trusted backend role and it is
--   not reachable with the publishable key. An edge function that builds its client with
--   SUPABASE_SERVICE_ROLE_KEY calls RPCs as service_role. That is NOT how most edge-function RPC
--   calls run, though: one that forwards the user's JWT runs as authenticated (last bullet below).
--   postgres, the owner, keeps EXECUTE as owners always do. SECURITY DEFINER bodies run as
--   postgres, so they still call new helpers with no grant. pg_cron jobs run as postgres too.
--   A new function in public now arrives with exactly {postgres=X/postgres, service_role=X/postgres}.
--   `for role postgres` is spelled out so the result does not depend on who pastes the file (the
--   SQL editor and the CLI both run as postgres; a superuser may also run it).
--
-- FOR EVERY MIGRATION FROM 0143 ON. Read this before writing `create function`:
--   * EVERY NEW RPC NEEDS AN EXPLICIT GRANT. Without one the app gets 42501 "permission denied for
--     function" (PostgREST answers 401 signed out, 403 signed in). The function no longer passes
--     by accident:
--         create function my_rpc(...) ... ;
--         grant execute on function my_rpc(...) to authenticated;
--     Grant to anon as well ONLY when the RPC is called before sign-in, as auth_methods_for is
--     (0096).
--   * A NEW HELPER EVALUATED AS THE CALLER needs a grant to every role that reaches it. EXECUTE is
--     checked against the role running the statement, not against the owner of whatever calls the
--     helper. That covers a helper used in:
--       - an RLS policy;
--       - ANY view, security_invoker or not. An owner-rights view reads its tables as its owner,
--         but its function calls are still checked against the caller;
--       - a column DEFAULT or a CHECK;
--       - a SECURITY INVOKER function or trigger body (next bullet).
--     Grant to authenticated, plus anon if anon reaches it (is_community_member, event_is_visible
--     & co. are granted for exactly this reason). Without the grant the statement fails with 42501
--     permission denied instead of returning or writing rows.
--   * A NEW TRIGGER FUNCTION ITSELF NEEDS NOTHING: firing never checks EXECUTE, so a closed trigger
--     function still fires for every role (0136). A NEW INTERNAL HELPER CALLED ONLY FROM SECURITY
--     DEFINER BODIES (SECURITY DEFINER triggers included) needs nothing either, because those
--     bodies run as postgres. But a helper called from a SECURITY INVOKER function or trigger runs
--     as the role whose statement reached it, and SECURITY INVOKER is the default for a new trigger
--     function. Three invoker triggers exist today: set_updated_at (communities,
--     community_permissions, community_posts, community_reviews, events, groups),
--     _events_reset_manual_court_names (events) and spatial_ref_sys_read_only. None calls a helper
--     yet. A helper added to one of them, or to a new invoker trigger, needs a grant to every role
--     that writes the table, like the RLS helpers, or ordinary app writes fail with 42501. Checked
--     in padel_sandbox with this file applied: a new invoker BEFORE INSERT trigger fired fine as
--     authenticated, but the new helper it called raised "permission denied for function" until
--     it was granted.
--     For helpers only definer code reaches, 0094's habit of revoking from public, anon and
--     authenticated right after creating them is NO LONGER NEEDED. It is harmless if written, but
--     redundant.
--   * DROP + CREATE MAKES A NEW, CLOSED FUNCTION. CREATE OR REPLACE refuses, and so forces a DROP,
--     to change the return type (RETURNS TABLE / OUT columns included), to rename an input
--     parameter (which also renames PostgREST's named argument) or to remove a parameter default.
--     A changed argument list is a new function too (an overload). In every case restate the grant
--     in the same migration, or the screens calling it break on the next deploy.
--   * CREATE OR REPLACE OF AN EXISTING FUNCTION KEEPS ITS ACL, open or closed. Functions created
--     before this file are still open where they were open. Closing one still takes an explicit
--     `revoke ... from public, anon, authenticated` (0094/0136 remain right about them), and the
--     convention of restating grants after a CREATE OR REPLACE (revoke from public, anon
--     [, authenticated] + grant to the roles that need it) stays.
--   * WHO AN EDGE FUNCTION'S RPC RUNS AS depends on the client it builds. A client built from the
--     anon key plus the caller's header, createClient(url, anonKey, { global: { headers:
--     { Authorization } } }), forwards the user's JWT, so the RPC runs as authenticated and needs
--     `grant execute ... to authenticated` like any app RPC. When this file was written that was
--     how all four RPC calls in infra/supabase/functions ran: delete-account (soft_delete_account),
--     ensure-channel (chat_channel_spec), send-roster-csv (event_roster_csv) and send-blast
--     (blast_email_recipients). Only a client built with SUPABASE_SERVICE_ROLE_KEY runs as
--     service_role, and a function that only such a client calls needs nothing (0143 moves
--     delete-account and send-blast onto service-role calls of that kind).
--   * Auth hooks (none configured) need `grant execute ... to supabase_auth_admin`, which PUBLIC
--     used to cover.
--
-- NOT CHANGED, on purpose:
--   * functions owned by supabase_admin. These are the extensions: PostGIS's functions in public
--     (st_estimatedextent among them) and anything a future `alter extension ... update` adds. They
--     follow supabase_admin's own default ACL, which still grants anon and authenticated. postgres
--     is not a member of supabase_admin and cannot change it, the same limit as 0133 and 0136;
--   * postgres's default ACL in other schemas (storage keeps the platform's anon/authenticated
--     grant). No migration here creates functions outside public;
--   * tables and sequences. postgres's default ACL in public (pg_default_acl, locally
--     `{postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}`) still
--     gives a new table EVERY privilege to anon and authenticated, TRUNCATE, REFERENCES, TRIGGER
--     and MAINTAIN included, with only RLS in the way, and a new sequence USAGE, SELECT and UPDATE
--     (rwU). That is the platform's default; 0030 restated only part of it (anon SELECT,
--     authenticated SELECT/INSERT/UPDATE/DELETE). See 0096/0101/0137 for the per-table revokes.
--     Closing those is a separate decision.

-- 1. Global: switch off the built-in PUBLIC grant for every function postgres creates.
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated;

-- 2. Public schema: drop the platform's and 0030's explicit anon/authenticated grants.
--    service_role (0050) is deliberately not named.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Self-check, in the spirit of 0094/0132–0136. It reads pg_default_acl, then confirms the EFFECTIVE
-- result: global and per-schema entries merge at creation time, and that merge is what matters. It
-- creates a throwaway function as postgres, checks who may run it, and drops it again. The editor
-- runs the whole paste as one transaction, so if this raises nothing above it lands, and if it
-- passes the probe is already gone.
do $$
declare
  v_anon    oid := 'anon'::regrole::oid;
  v_auth    oid := 'authenticated'::regrole::oid;
  v_service oid := 'service_role'::regrole::oid;
  v_global  aclitem[];
  v_public  aclitem[];
  v_probe   oid;
begin
  select defaclacl into v_global from pg_default_acl
   where defaclrole = 'postgres'::regrole and defaclnamespace = 0 and defaclobjtype = 'f';
  select defaclacl into v_public from pg_default_acl
   where defaclrole = 'postgres'::regrole and defaclnamespace = 'public'::regnamespace and defaclobjtype = 'f';

  -- No global entry means Postgres's built-in default, which grants PUBLIC.
  if v_global is null then
    raise exception '0142: no global default ACL for functions postgres creates, so PUBLIC still gets EXECUTE on every new one';
  end if;
  if exists (select 1 from aclexplode(v_global) a
              where a.privilege_type = 'EXECUTE' and a.grantee in (0, v_anon, v_auth)) then
    raise exception '0142: the global default ACL for postgres still grants EXECUTE on new functions to PUBLIC, anon or authenticated: %', v_global;
  end if;
  if exists (select 1 from aclexplode(coalesce(v_public, '{}')) a
              where a.privilege_type = 'EXECUTE' and a.grantee in (0, v_anon, v_auth)) then
    raise exception '0142: the public-schema default ACL for postgres still grants EXECUTE on new functions to PUBLIC, anon or authenticated: %', v_public;
  end if;
  if not exists (select 1 from aclexplode(coalesce(v_public, '{}') || v_global) a
                  where a.privilege_type = 'EXECUTE' and a.grantee = v_service) then
    raise exception '0142: service_role lost its default EXECUTE on new functions in public; edge functions using the service key would break on the next new RPC';
  end if;

  -- The effective result, for a function created the way every migration creates one: as postgres.
  -- Skipped (with a notice) if someone pastes this as another role, because that role's own
  -- defaults would apply to the probe and prove nothing about postgres.
  if current_user <> 'postgres' then
    raise notice '0142: running as %, not postgres; skipping the probe-function check (the catalog checks above passed)', current_user;
    return;
  end if;
  if to_regprocedure('public._0142_default_acl_probe()') is not null then
    drop function public._0142_default_acl_probe();
  end if;
  create function public._0142_default_acl_probe() returns integer language sql as 'select 1';
  v_probe := 'public._0142_default_acl_probe()'::regprocedure;
  if has_function_privilege('public', v_probe, 'execute') then
    raise exception '0142: a new function in public is still executable by PUBLIC';
  end if;
  if has_function_privilege('anon', v_probe, 'execute') then
    raise exception '0142: a new function in public is still executable by anon';
  end if;
  if has_function_privilege('authenticated', v_probe, 'execute') then
    raise exception '0142: a new function in public is still executable by authenticated';
  end if;
  if not has_function_privilege('service_role', v_probe, 'execute') then
    raise exception '0142: service_role cannot execute a new function in public';
  end if;
  -- The way forward still works: an explicit grant opens it to exactly the role named.
  grant execute on function public._0142_default_acl_probe() to authenticated;
  if not has_function_privilege('authenticated', v_probe, 'execute')
     or has_function_privilege('anon', v_probe, 'execute') then
    raise exception '0142: an explicit grant to authenticated did not open the function to authenticated alone';
  end if;
  drop function public._0142_default_acl_probe();
end $$;
