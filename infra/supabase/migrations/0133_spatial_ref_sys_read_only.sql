-- public.spatial_ref_sys becomes read-only for the three API roles. The Supabase security advisor
-- flags the table at ERROR level as rls_disabled_in_public (lint 0013): it is in an exposed schema,
-- anon and authenticated can select it, and RLS is off.
--
-- THE LINT UNDERSTATES IT. Reading the table is harmless: it is PostGIS's copy of the public EPSG
-- registry, 8,500 coordinate-system definitions shipped with the extension, and none of it is ours.
-- The problem is WRITING. PostGIS is installed in `public`, so supabase_admin created the table, and
-- Supabase's default privileges for objects that role creates in public hand anon, authenticated and
-- service_role EVERY privilege on it: INSERT, UPDATE, DELETE, TRUNCATE. With RLS off, that means the
-- publishable key — which ships inside the app binary — can run
--   DELETE /rest/v1/spatial_ref_sys?srid=gt.0
-- and wipe the table. Every geography st_distance then fails with "Cannot find SRID 4326": every
-- distance in Explore, every nearby search, for every user, until someone restores the rows by hand.
-- That is not hypothetical. An E2E wipe once truncated this table by accident and broke geography
-- in exactly that way (apps/mobile/e2e/fixtures/seed.ts refills it for that reason). An UPDATE is
-- quieter and worse: rewrite SRID 4326's definition and every distance comes out wrong, with no error.
--
-- WHAT WE CANNOT DO. The table belongs to supabase_admin, and postgres — the role these migrations
-- run as, locally and in the hosted SQL editor — is not its owner. Tested on the local stack:
--   * `alter table spatial_ref_sys enable row level security` -> must be owner of table
--   * `create policy ... on spatial_ref_sys`                  -> must be owner of table
--   * `revoke ... on spatial_ref_sys from anon`               -> "no privileges could be revoked":
--     supabase_admin granted them, and only the grantor can take a grant back.
-- Supabase tracks the false positive as supabase/supabase#47206, still open. Its own advice is to
-- install PostGIS in the `extensions` schema instead. Here that is a project of its own: PostGIS
-- cannot be relocated, so it means dropping it (and with it the three location_point columns),
-- reinstalling it in `extensions`, restoring the data, and rewriting the 69 functions that call it
-- under `set search_path = public`.
--
-- WHAT WE CAN. postgres does hold TRIGGER on the table (the same blanket grant), and a trigger can
-- refuse a statement. So a statement-level BEFORE trigger rejects INSERT, UPDATE, DELETE and
-- TRUNCATE whenever the current role is one PostgREST runs as. Statement-level and BEFORE, so it
-- fires even when the statement would touch zero rows, before any row is touched. Reads are left
-- exactly as they are, and must be: PostGIS looks SRIDs up in this table AS THE CALLING ROLE, so an
-- anon or authenticated caller who cannot read it gets the same "Cannot find SRID 4326" as an empty
-- table.
--
-- WHAT IS LEFT. The advisor ERROR stays: lint 0013 looks only at whether RLS is on and whether anon
-- or authenticated can SELECT, and both stay true. Clearing it needs supabase_admin — a support
-- request to enable RLS with a `for select using (true)` policy and revoke the write grants (the
-- linter deliberately ignores a SELECT policy of `true`) — or the PostGIS move above. Either one
-- makes this trigger redundant rather than wrong.
--
-- WHO IS STILL ALLOWED. Everyone who is not an API role: postgres (these migrations), supabase_admin
-- (PostGIS upgrades rewrite this table; the E2E refill in seed.ts runs as supabase_admin) and
-- every other internal role. A deny-list on purpose: it targets exactly the roles a request can
-- arrive as, and cannot get in the way of a platform upgrade run by a role we did not think of.
-- current_user is the role the statement runs as. Under PostgREST that is anon, authenticated or
-- service_role. Inside a SECURITY DEFINER function it is that function's owner, but no function in
-- this schema writes to spatial_ref_sys.

-- service_role is refused too. Nothing writes this table through the API — not the app, not an edge
-- function, not a seed — so the secret key loses nothing, and a leaked one cannot use it to take
-- geography down. Invoker, and with search_path pinned, so the advisor raises nothing new about the
-- function itself (lints 0011, 0028, 0029 all look for the opposite). `return null` is ignored for a
-- statement-level trigger.
create or replace function spatial_ref_sys_read_only()
returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated', 'service_role') then
    raise exception 'spatial_ref_sys is read-only through the API'
      using errcode = '42501',
            hint = 'It is PostGIS''s SRID registry. Every geography lookup depends on it (migration 0133).';
  end if;
  return null;
end;
$$;

-- CREATE OR REPLACE, not DROP + CREATE: postgres cannot drop or disable a trigger on a table it does
-- not own ("must be owner of relation spatial_ref_sys"), but it can create one and replace it, so
-- this is the only re-runnable form. To LIFT the guard, `drop function spatial_ref_sys_read_only()
-- cascade` — postgres owns the function, and the cascade takes the trigger with it. The flip side:
-- any cleanup that drops this function with CASCADE silently removes the protection, so leave it be.
--
-- A LOGICAL DUMP DOES NOT CARRY IT. pg_dump never writes CREATE TRIGGER for a table that belongs to
-- an extension, so a restore from `supabase db dump` / pg_dump into a fresh project keeps the
-- function and the anon grants but not the trigger. Physical restores, PITR and pg_upgrade keep it.
-- After any logical rebuild, paste this file again: every statement in it is re-runnable.
create or replace trigger spatial_ref_sys_read_only
  before insert or update or delete or truncate on spatial_ref_sys
  for each statement execute function spatial_ref_sys_read_only();

-- Self-check, in the spirit of 0094/0097/0101/0132. The hosted database is updated by pasting this
-- file into the dashboard SQL editor, and a trigger that exists but does not fire is silent.
-- The editor runs the whole paste as one transaction, so if this raises, nothing above it lands.
do $$
declare
  v_me      text := current_user;
  v_role    text;
  v_stmt    text;
  v_blocked boolean;
  v_km      double precision;
begin
  -- BEFORE (2) + INSERT (4) + DELETE (8) + UPDATE (16) + TRUNCATE (32), and NOT for-each-row (1).
  -- TRUNCATE is asserted from the catalog rather than by running one, so the check can never be
  -- the thing that empties the table.
  if not exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'public.spatial_ref_sys'::regclass
       and t.tgname = 'spatial_ref_sys_read_only'
       and t.tgenabled = 'O'
       and t.tgtype::int & 63 = 62
  ) then
    raise exception 'spatial_ref_sys_read_only is missing, disabled, or does not cover insert/update/delete/truncate';
  end if;

  -- Every API role, every DML verb, for real. `where false` / an empty select: if the trigger did
  -- NOT fire, each statement touches zero rows, so even a failed check changes nothing.
  -- Roles are switched with SET LOCAL and switched back to v_me the same way, never RESET ROLE:
  -- RESET would also discard a session-level role the runner set (a CLI deploy that logs in as one
  -- role and SETs ROLE postgres), and run the rest of its session as the login role.
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    foreach v_stmt in array array[
      'delete from public.spatial_ref_sys where false',
      'update public.spatial_ref_sys set srtext = srtext where false',
      'insert into public.spatial_ref_sys select * from public.spatial_ref_sys where false'
    ] loop
      begin
        execute format('set local role %I', v_role);
        execute v_stmt;
        v_blocked := false;
      exception when insufficient_privilege then
        -- The subtransaction's rollback also undoes the SET LOCAL ROLE above.
        v_blocked := true;
      end;
      execute format('set local role %I', v_me);
      if not v_blocked then
        raise exception '% can still run: %', v_role, v_stmt;
      end if;
    end loop;
  end loop;

  -- Not a blanket lock: the role running this file (postgres, or supabase_admin for an upgrade)
  -- still gets through.
  begin
    delete from public.spatial_ref_sys where false;
  exception when insufficient_privilege then
    raise exception '% is refused too — PostGIS upgrades and the E2E refill would break', current_user;
  end;

  -- And the read path PostGIS needs is untouched: a geography distance computed AS authenticated
  -- still finds SRID 4326. One degree of latitude at the equator is about 110.6 km.
  execute 'set local role authenticated';
  begin
    v_km := public.st_distance('SRID=4326;POINT(0 0)'::public.geography,
                               'SRID=4326;POINT(0 1)'::public.geography) / 1000;
  exception when others then
    execute format('set local role %I', v_me);
    raise exception 'authenticated can no longer compute a geography distance: % (is spatial_ref_sys empty?)', sqlerrm;
  end;
  execute format('set local role %I', v_me);
  if v_km not between 110 and 111.5 then
    raise exception 'a geography distance as authenticated came out as % km, expected about 110.6', v_km;
  end if;
end $$;
