# Spec 01 — Supabase & tenant model

**Goal:** Supabase project wired in, the core multi-tenant schema migrated, generated
types flowing into `packages/db`, and the uniform RLS tenant-scoping pattern established.

**Depends on:** 00.

## Tasks

1. Initialise Supabase locally (`supabase init`) and link a cloud project. Put all
   migrations under `infra/supabase/migrations/`.
2. Create the foundational schema. Tenant is the top-level concept.
   - `tenants` — id, type (`club` | `community` | `studio` | `gym` | `organization`),
     name, country (`PT` | `BR`), created_at.
   - `profiles` — extends `auth.users` (id FK to auth.users), display_name, avatar_url,
     locale (`pt-PT` | `pt-BR` | `en`).
   - `tenant_memberships` — user_id, tenant_id, role (enum, see spec 03), created_at.
     A user may belong to many tenants.
   - `clubs` — tenant_id, name. (A tenant of type club has one+; kept separate so a
     tenant can own multiple clubs.)
   - `locations` — club_id, name, address, timezone.
3. Establish the **uniform RLS pattern**: a SQL helper (e.g. `auth_tenant_ids()`)
   returning the set of tenant_ids the current user belongs to. Every tenant-scoped
   table gets a policy of the form "row visible/editable when `tenant_id` is in the
   caller's tenant set" (refined further by role in spec 03).
4. Enable RLS on every table from the start. No table ships with RLS disabled.
5. Set up type generation: `supabase gen types typescript` output committed/regenerated
   into `packages/db`, re-exported as the canonical DB types.
6. Provide `infra/supabase/seed.sql` seeding two demo tenants (one PT, one BR), a few
   profiles, memberships, a club, and locations.
7. Document the migration workflow in `infra/supabase/README.md` (how to create, apply,
   and regenerate types).

## Constraints

- Every tenant-scoped table carries `tenant_id` and uses the shared RLS helper.
- No business logic in this spec beyond schema + policies — features come later.
- Types are generated, never hand-written, in `packages/db`.

## Definition of done

- [ ] `supabase db reset` applies all migrations cleanly and runs the seed.
- [ ] RLS is enabled on every table; a user in tenant A cannot read tenant B's rows.
- [ ] `packages/db` exports generated types that `packages/api` can import.
- [ ] The `auth_tenant_ids()` helper exists and is used by every tenant-scoped policy.
- [ ] Seed produces a working PT tenant and BR tenant with members and locations.
