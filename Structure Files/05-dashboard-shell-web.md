# Spec 05 — Dashboard shell (web)

**Goal:** The club-owner/admin dashboard skeleton in the `(dashboard)` route group, plus
the `(super-admin)` area — data tables, CRM basics, member import/export, and the plan
module toggles, all behind role + entitlement checks.

**Depends on:** 03.

## Tasks

1. Build the `(dashboard)` shell: sidebar nav, active-tenant + active-club context,
   role-aware menu (a coach sees less than a club owner). Desktop-first layout.
2. Members (CRM basics):
   - A data table (TanStack Table) of members with filters and search.
   - View/edit a member, see their memberships and roles.
   - CSV import and export of members (export gated by the `csv_export` feature).
3. Staff & locations management:
   - Assign roles (`coach`, `staff`) and scope staff to specific locations.
   - Manage a tenant's clubs and locations.
   - Reflect the scope in CASL (from spec 03) — UI must match server rules.
4. Plan & modules settings:
   - A settings screen where a `club_owner`/`super_admin` views the tenant's plan and
     sees which feature modules are on/off. Toggling is constrained by plan
     (true module changes are billing-driven; this screen reflects entitlements).
5. Super-admin area (`(super-admin)`): list tenants, view their plans, basic
   platform-wide management. `super_admin` role only.
6. Audit log: create the `audit_logs` table and record sensitive dashboard actions
   (role change, member import, plan change).

## Constraints

- Every dashboard action runs the two-check rule server-side.
- Tables, filters, bulk actions are desktop-grade — this is why web is Next.js, not RN Web.
- Staff/coach scoping in the UI must exactly mirror the CASL rules.

## Definition of done

- [ ] A club owner sees the members table, can filter, and can import/export CSV
      (export blocked if plan lacks `csv_export`).
- [ ] Staff can be scoped to a location and that scope is enforced server-side.
- [ ] The plan/modules screen reflects the tenant's real entitlements.
- [ ] Super-admin can list tenants and view plans; non-super-admins are blocked.
- [ ] Sensitive actions write to `audit_logs`.
- [ ] A coach logging into the dashboard sees only what their role permits.
