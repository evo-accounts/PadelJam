# New tables and sequences closed by default; anon write grants removed

Task: PAD-161 (finding from the PAD-156 security audit). Goal: launch in January 2027.
Status: **approved (CTO, 2026-11-05)**. Branch: `fix/default-table-privileges`, which already holds this
plan and the `Structure Files/CLAUDE.md` rule.

## Problem

0142 closed new functions. Tables and sequences were left open "as a separate decision". A new table in
`public` arrives with every privilege for `anon` and `authenticated`, and RLS off until someone remembers to
turn it on, so one forgotten line exposes it to anyone with the publishable key.

Measured on a local stack at migration 0149 (read-only):

| Check | Result |
| --- | --- |
| Default ACL, `postgres` in `public`, tables | `{postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}` |
| Default ACL, `postgres` in `public`, sequences | `{postgres=rwU, anon=rwU, authenticated=rwU, service_role=rwU}` |
| Tables in `public` | 55 |
| Tables with RLS off | 1: `spatial_ref_sys`, owned by `supabase_admin` (PostGIS; 0133 blocks writes with a trigger) |
| Tables where `anon` has INSERT, UPDATE or DELETE | **36** (includes `spatial_ref_sys`) |
| Policies that let `anon` write | None in effect: the 23 write policies open to `public` all need `auth.uid()` or an admin helper |
| Non-definer functions `anon` can run that write | 0 |
| Column-level grants to `anon` | SELECT only, on `profiles` |
| Sequences in `public` | 0 |
| `postgres` a member of `supabase_admin` | No |

The audit said existing tables are fine. On RLS they are, but its proposed test ("no anon write grants") fails
today on 36 tables, so this change has to close them as well as the default.

## What changes

### 1. Migration: next free number (`0150` if #320 keeps `0149`) (Engineer A)

Write it in the style of 0142: a header on why, what changes, what every later migration must do, and what is
deliberately not changed.

1. **Default ACL.**
   ```sql
   alter default privileges for role postgres in schema public
     revoke all on tables from anon, authenticated;
   alter default privileges for role postgres in schema public
     revoke all on sequences from anon, authenticated;
   ```
   `service_role` is not named: it keeps its defaults, and edge functions depend on them.
2. **Existing tables: `anon` loses table-level INSERT, UPDATE and DELETE.** A `do` block over every table and
   partitioned table in `public` that `postgres` owns and that isn't an extension member (`pg_depend`,
   `deptype = 'e'`). Run `revoke insert, update, delete on table %I from anon`.
   - Do **not** use `revoke all`, and do not revoke SELECT. A table-level revoke also removes that privilege's
     column-level grants, which would remove `anon`'s column SELECT on `profiles`. Whether `anon` should read
     anything is PAD-133's question, not this one's.
   - `authenticated` keeps what it has on existing tables. Its writes are the app's and RLS guards them.
3. **Service-role-only audit function**, `_audit_public_table_grants()`, `returns jsonb`, `security invoker`,
   `search_path` pinned. It is the only way `test:db` can read the catalog, because the suite speaks PostgREST and
   has no database connection. With 0142 in force it arrives closed to `anon` and `authenticated`; add no grant.
   It returns:
   - every non-extension table in `public` with `rls_on` and `anon_writes` (from `has_table_privilege`);
   - any `anon` or `authenticated` grantee in `postgres`'s `public` default ACL for tables and sequences.
4. **Self-check** in the spirit of 0142, raising if the default ACL still names `anon` or `authenticated`, if
   `service_role` lost its entry, or if any covered table still gives `anon` a write. Then probe the effective
   result: in a nested `begin … exception` block, create a table and a sequence, check `has_table_privilege` and
   `has_sequence_privilege`, then raise a marker exception and catch it, so the probe rolls back.

### 2. Traps: read before writing the file

- **The hosted workflow holds a migration whose text matches its destructive scan** (`drop table`, `truncate`,
  `delete from`, among others; `.github/workflows/supabase-migrations.yml`, line 60). Comments and `create
  function` bodies are skipped; `do` blocks are not. So nothing outside a comment or function body may contain
  those words: no `drop table` for the probe (that is why it rolls back through an exception) and no `revoke
  truncate`. This migration deletes no data, and we want it to apply through the workflow. Don't reshape anything
  to slip a destructive statement past the scan; if you find you need one, stop and tell me.
- **`anon` keeps TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on existing tables, and so does `authenticated`.**
  Accepted for now and stated in the migration header. PostgREST has no route to any of them, and they don't
  apply to new tables. Don't name `maintain` either way: it only exists from Postgres 17, and we haven't confirmed
  the hosted version.
- **`supabase_admin` is out of reach.** The finding proposes the same revoke for that role, but `postgres` isn't
  a member, so the statement would fail. Its default ACL only governs what extensions create. State this in the
  header, as 0142 does.

### 3. Test: `infra/supabase/tests/default-table-privileges.test.mjs` (Engineer A)

- `_audit_public_table_grants` through the service key: every table has `rls_on`, none has `anon_writes`, and
  the default ACL entries list no `anon` or `authenticated`. Print the offending table names on failure, with
  what the next author must do. This is the guard for every future migration.
- The function refuses `anon` and a signed-in user (`permission denied for function`).
- Through PostgREST as `anon`, on tables that were open (at least `user_settings`, `notifications`, `reports`,
  `event_participants`): POST, PATCH and DELETE each return `42501` `permission denied for table`. Filter on an
  impossible id so that a broken grant still changes nothing.
- As a signed-in user, the same kinds of writes still work where the app makes them: update own `user_settings`,
  update own `profiles.full_name`.

**Prove the test works:** run it with the migration's grant changes temporarily removed, see it fail, and put
the result in the hand-off.

## Not in this change

- An event trigger that turns RLS on automatically. The test catches a forgotten `enable row level security` on
  every PR, which is enough.
- Removing `authenticated`'s TRUNCATE and the like from existing tables (see Traps).

## Done when

1. `pnpm lint && pnpm typecheck && pnpm tokens:check && pnpm i18n:check && pnpm size:check && pnpm test &&
   pnpm test:functions && pnpm test:db` all pass after `db reset` on a local stack. The whole `test:db` run is the
   regression proof that signed-in and signed-out flows still work.
2. The steps in the finding, repeated locally, give `f, f` for `anon` SELECT and `authenticated` INSERT on a new
   table, and a new table with an explicit grant opens to that role alone.
3. The migration's `Migration check` on the PR is green, lists only this migration, and shows no destructive
   warning.

## Hosted hand-off

None by hand: the migration goes through the `Supabase migrations` workflow on merge. No edge function changes.
No client changes, so no app build. `schema:check` shouldn't be affected, since this adds no column or RPC on the
auth path. If a PR's check goes red because of it, tell me before anything else (the deadlock noted for #295).

Other open branches: any that adds a table after this lands needs explicit grants. Only #320 has a migration open
today, and it adds no table.
