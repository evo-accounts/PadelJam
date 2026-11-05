-- New tables and sequences are CLOSED by default, and anon loses its write grants on the tables that
-- already exist (PAD-161, from the PAD-156 security audit). 0142 did this for functions and left
-- tables and sequences "as a separate decision". This is that decision: closed, like functions.
--
-- WHY. A table postgres creates in public arrived with every privilege for anon and authenticated
-- (the platform's default ACL), and with row level security OFF until its author remembered to turn
-- it on. One forgotten `enable row level security` exposed the table to anyone holding the
-- publishable key. Locally (pg_default_acl, before this file):
--   tables:    {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}
--   sequences: {postgres=rwU, anon=rwU, authenticated=rwU, service_role=rwU}
-- Every existing table has RLS on (spatial_ref_sys, owned by PostGIS, is the one exception and 0133
-- blocks its writes with a trigger), and no policy lets anon write, so nothing is exposed today.
-- But anon held INSERT, UPDATE and DELETE on 36 tables, and the only thing stopping it was RLS.
--
-- WHAT CHANGES.
--   1. DEFAULT ACL. `for role postgres in schema public revoke all on tables / sequences from anon,
--      authenticated`. A new table or sequence in public now arrives with
--      {postgres, service_role} only.
--   2. EXISTING TABLES. anon loses table-level INSERT, UPDATE and DELETE on every table in public
--      that postgres owns and that is not an extension member. SELECT is deliberately NOT revoked
--      and `revoke all` is not used: a table-level revoke also removes that privilege's
--      column-level grants, and anon holds a column-level SELECT on profiles. Whether anon should
--      read anything is PAD-133's question, not this file's.
--   3. _audit_public_table_grants(), service role only. The test suite speaks PostgREST and has no
--      database connection, so this is its only way to read the catalog. It returns every
--      non-extension table in public with rls_on and anon_writes, and any anon or authenticated
--      grantee left in postgres's public default ACL for tables and sequences.
--   4. A self-check that raises if any of the above did not take, and a probe of the effective
--      result that rolls itself back.
--
-- FOR EVERY MIGRATION FROM 0151 ON. Read this before writing `create table`:
--   * A NEW TABLE NEEDS AN EXPLICIT GRANT. Without one the app gets 42501 "permission denied for
--     table" (PostgREST answers 401 signed out, 403 signed in):
--         create table my_table (...);
--         alter table my_table enable row level security;
--         grant select, insert, update, delete on my_table to authenticated;
--     Grant only what the app uses, and only to the roles that use it. anon only if the table is read
--     before sign-in. RLS is still required: a grant is not a policy.
--   * A NEW SEQUENCE used by a column default of a table the app inserts into needs
--     `grant usage on sequence ... to authenticated`. (There are none in public today; identity
--     columns need no grant.)
--   * service_role keeps its default privileges on new tables and sequences. Edge functions that
--     build their client with the service key depend on them, so they are not named here.
--   * default-table-privileges.test.mjs fails on any later migration that leaves a table in public
--     without RLS, or with an anon write grant, or that puts anon or authenticated back into the
--     default ACL.
--
-- DELIBERATELY NOT CHANGED.
--   * TRUNCATE, REFERENCES and TRIGGER (and MAINTAIN, where the Postgres version has it) stay with
--     anon and authenticated on existing tables. PostgREST has no route to any of them, and none of
--     them is in a new table's default. Accepted for now.
--   * authenticated keeps what it has on existing tables. Its writes are the app's, and RLS guards
--     them.
--   * supabase_admin's default ACL. The finding proposed the same revoke for that role, but postgres
--     is not a member of supabase_admin, so the statement fails. That ACL only governs what
--     extensions create (PostGIS's spatial_ref_sys, for one).
--   * No event trigger that turns RLS on by itself. The test catches a forgotten
--     `enable row level security` on every PR.
--
-- This file deletes no data. Its probe rolls back through a caught exception instead of
-- dropping what it creates.

-- 1. Default ACL.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

-- 2. Existing tables: anon loses INSERT, UPDATE, DELETE.
do $$
declare
  r record;
begin
  for r in
    select c.relname
      from pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relkind in ('r', 'p')
       and c.relowner = 'postgres'::regrole
       and not exists (select 1 from pg_depend d
                        where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
  loop
    execute format('revoke insert, update, delete on table public.%I from anon', r.relname);
  end loop;
end $$;

-- 3. Audit function for the test suite. security invoker: it reads only catalogs, which anyone may.
-- No grant: with 0142 in force it arrives closed to anon and authenticated, and service_role keeps
-- its default EXECUTE.
create function public._audit_public_table_grants()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object(
               'table', c.relname::text,
               'rls_on', c.relrowsecurity,
               'anon_writes', has_table_privilege('anon', c.oid, 'insert')
                           or has_table_privilege('anon', c.oid, 'update')
                           or has_table_privilege('anon', c.oid, 'delete'))
             order by c.relname)
        from pg_class c
       where c.relnamespace = 'public'::regnamespace
         and c.relkind in ('r', 'p')
         and not exists (select 1 from pg_depend d
                          where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
    ), '[]'::jsonb),
    'default_acl', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', case d.defaclobjtype when 'r' then 'tables' else 'sequences' end,
               'grantee', case a.grantee when 0 then 'public' else a.grantee::regrole::text end,
               'privilege', a.privilege_type)
             order by d.defaclobjtype, a.grantee::regrole::text, a.privilege_type)
        from pg_default_acl d, aclexplode(d.defaclacl) a
       where d.defaclrole = 'postgres'::regrole
         and d.defaclnamespace = 'public'::regnamespace
         and d.defaclobjtype in ('r', 'S')
         and a.grantee in (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid)
    ), '[]'::jsonb)
  );
$$;

-- 4. Self-check, in the spirit of 0142.
do $$
declare
  v_anon    oid := 'anon'::regrole::oid;
  v_auth    oid := 'authenticated'::regrole::oid;
  v_service oid := 'service_role'::regrole::oid;
  v_tables  aclitem[];
  v_seqs    aclitem[];
  v_bad     text;
  v_tbl     oid;
  v_seq     oid;
begin
  select defaclacl into v_tables from pg_default_acl
   where defaclrole = 'postgres'::regrole and defaclnamespace = 'public'::regnamespace and defaclobjtype = 'r';
  select defaclacl into v_seqs from pg_default_acl
   where defaclrole = 'postgres'::regrole and defaclnamespace = 'public'::regnamespace and defaclobjtype = 'S';

  if exists (select 1 from aclexplode(coalesce(v_tables, '{}')) a where a.grantee in (v_anon, v_auth)) then
    raise exception '0150: the public default ACL for tables still names anon or authenticated: %', v_tables;
  end if;
  if exists (select 1 from aclexplode(coalesce(v_seqs, '{}')) a where a.grantee in (v_anon, v_auth)) then
    raise exception '0150: the public default ACL for sequences still names anon or authenticated: %', v_seqs;
  end if;
  if not exists (select 1 from aclexplode(coalesce(v_tables, '{}')) a where a.grantee = v_service) then
    raise exception '0150: service_role lost its default privileges on new tables in public; edge functions using the service key would break';
  end if;
  if not exists (select 1 from aclexplode(coalesce(v_seqs, '{}')) a where a.grantee = v_service) then
    raise exception '0150: service_role lost its default privileges on new sequences in public';
  end if;

  select string_agg(t->>'table', ', ') into v_bad
    from jsonb_array_elements(public._audit_public_table_grants()->'tables') t
   where (t->>'anon_writes')::boolean;
  if v_bad is not null then
    raise exception '0150: anon can still write to: %', v_bad;
  end if;

  -- The effective result, for objects created the way every migration creates them: as postgres.
  -- The probe rolls back through a caught exception, so nothing is dropped and nothing is left.
  if current_user <> 'postgres' then
    raise notice '0150: running as %, not postgres; skipping the probe (the catalog checks above passed)', current_user;
    return;
  end if;
  begin
    create table public._0150_default_acl_probe (id integer);
    create sequence public._0150_default_acl_probe_seq;
    v_tbl := 'public._0150_default_acl_probe'::regclass;
    v_seq := 'public._0150_default_acl_probe_seq'::regclass;
    if has_table_privilege('anon', v_tbl, 'select') or has_table_privilege('anon', v_tbl, 'insert') then
      raise exception '0150: a new table in public is still open to anon';
    end if;
    if has_table_privilege('authenticated', v_tbl, 'select') or has_table_privilege('authenticated', v_tbl, 'insert') then
      raise exception '0150: a new table in public is still open to authenticated';
    end if;
    if not has_table_privilege('service_role', v_tbl, 'select') then
      raise exception '0150: service_role cannot read a new table in public';
    end if;
    if has_sequence_privilege('anon', v_seq, 'usage') or has_sequence_privilege('authenticated', v_seq, 'usage') then
      raise exception '0150: a new sequence in public is still open to anon or authenticated';
    end if;
    if not has_sequence_privilege('service_role', v_seq, 'usage') then
      raise exception '0150: service_role cannot use a new sequence in public';
    end if;
    -- The way forward still works: an explicit grant opens the table to exactly the role named.
    grant select on public._0150_default_acl_probe to authenticated;
    if not has_table_privilege('authenticated', v_tbl, 'select') or has_table_privilege('anon', v_tbl, 'select') then
      raise exception '0150: an explicit grant to authenticated did not open the table to authenticated alone';
    end if;
    raise exception '0150_probe_ok';
  exception when others then
    if sqlerrm <> '0150_probe_ok' then
      raise;
    end if;
  end;
end $$;
