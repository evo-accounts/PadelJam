# Spec 03 — Roles, permissions & entitlements

**Goal:** The platform's authorization core: a CASL-based role+scope permission system,
a DB-backed entitlement system, and the two-check rule enforced on the server. This is
the most important spec — everything later depends on it.

**Depends on:** 02.

## Part A — Roles & permissions (CASL)

1. Define the role enum used by `tenant_memberships`: `member`, `coach`, `staff`,
   `community_owner`, `club_owner`, `super_admin`.
2. Build `packages/permissions` on CASL:
   - Define abilities per role, expressed over actions (`create`, `read`, `update`,
     `delete`, `manage`) and subjects (`Class`, `Booking`, `Member`, `Payment`,
     `Analytics`, `Location`, …).
   - Abilities are **scope-aware**: a rule can be conditioned on `tenant_id`,
     `location_id`, and ownership (e.g. a coach reads only their own class rosters; a
     staff member acts only at assigned locations).
   - Export an `abilityFor(user, context)` builder and a `can(...)` check usable on both
     client and server.
3. Reflect scope on the data model: extend `tenant_memberships` (or add a
   `staff_locations` join) so staff/coach scope to specific locations.

## Part B — Entitlements (DB-backed)

4. Create the entitlement schema in a migration:
   - `plans` — id, name (`starter`, `pro`, `enterprise`), description.
   - `features` — id, key (e.g. `community_feed`, `private_chat`, `waitlists`,
     `analytics`, `csv_export`, `multi_location`, `advanced_reports`,
     `custom_permissions`), description.
   - `plan_features` — plan_id, feature_id, enabled (the plan→feature matrix).
   - `tenant_entitlements` — tenant_id, plan_id, plus any per-tenant overrides.
5. Build `packages/features`:
   - A typed feature-key registry (the single source of truth for feature keys).
   - `hasFeature(tenantId, key)` resolving a tenant's effective entitlements.
   - Seed the three plans from the agreed matrix (starter/pro/enterprise).

## Part C — The two-check rule

6. Enforce BOTH checks on the server for every protected action:
   - **Entitlement:** `hasFeature(tenant, key)` — does the plan include it?
   - **Permission:** CASL `can(action, subject, scope)` — may this user do it here?
   Implement this as shared middleware/util used by API hooks and Edge Functions, and
   reflect entitlement + permission in RLS policies where the action is pure data access.
7. Provide a single helper (e.g. `authorize({ user, tenant, feature, action, subject })`)
   that runs both checks and is the canonical entry point for protected operations.
8. Keep PostHog out of this entirely. (Rollout flags arrive in spec 10 and never gate
   plan features.)

## Constraints

- Entitlement state is always DB-backed and (later) mutated only by billing webhooks.
- No protected action relies on UI hiding alone — server enforcement is mandatory.
- Feature keys exist in exactly one place: the `packages/features` registry.
- CASL rules must express location/ownership scope, not just role.

## Definition of done

- [ ] `packages/permissions` produces correct allow/deny for each of the six roles,
      including a location-scoped case (coach sees only own rosters; staff only assigned
      locations).
- [ ] `packages/features` resolves a tenant's features from its plan, and the three
      plans are seeded per the agreed matrix.
- [ ] The `authorize(...)` helper enforces both checks and is unit-tested with a table of
      (role, plan, action) → expected outcome.
- [ ] A tenant on `starter` is denied a `pro`-only feature at the server, even if the UI
      were to show it.
- [ ] RLS reflects entitlement + permission for at least one representative table.
