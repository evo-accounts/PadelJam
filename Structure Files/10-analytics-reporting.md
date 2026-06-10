# Spec 10 — Analytics & reporting

**Goal:** The dashboard's reporting surface (charts, segmentation, exports, audit log
views) plus PostHog product analytics and rollout flags wired correctly — flags never
gate plan features.

**Depends on:** 05.

## Tasks

1. Dashboard reporting (`(dashboard)/overview`):
   - Charts (Recharts or Tremor) for the metrics a club owner cares about: active
     members, bookings over time, class fill rate, attendance, revenue (from spec 09).
   - Segmentation/filters over members and bookings.
   - CSV export of report data (entitlement-gated by plan).
2. Audit log views: surface `audit_logs` (from spec 05) with filtering for owners/super-admin.
3. PostHog — finalize the two distinct uses, kept strictly separate:
   - **Product analytics:** funnels, retention, feature-usage dashboards across web +
     mobile. Define a clean event taxonomy.
   - **Rollout flags:** canary releases, A/B tests, kill-switches. Document and enforce in
     code review that these NEVER gate plan features (that is always DB entitlements).
4. Advanced reports as a `pro`/`enterprise` feature (`advanced_reports`) — gate via
   `packages/features`.
5. Reporting queries must be tenant-scoped and respect role (a coach's reporting view is
   narrower than an owner's).

## Constraints

- PostHog flags are rollout-only; plan gating stays in `packages/features`. Enforce in review.
- All reporting respects tenant scope and role.
- Exports gated by entitlement, enforced server-side.

## Definition of done

- [ ] The overview dashboard shows accurate, tenant-scoped charts.
- [ ] Segmentation/filtering works; CSV export respects the `csv_export` entitlement.
- [ ] Audit log views are available to owners/super-admin only.
- [ ] PostHog shows product-analytics events from web and mobile.
- [ ] A rollout flag can gate a non-plan feature; no flag gates a plan feature.
- [ ] `advanced_reports` is visible only to entitled tenants and enforced server-side.
