# Spec 09 — Payments

**Goal:** Subscriptions and club payments via Stripe + Stripe Connect on web, RevenueCat
for mobile app-feature subscriptions, with entitlements driven by billing webhooks.
Markets: Portugal and Brazil.

**Depends on:** 05.

## Tasks

1. Schema (migration), tenant-scoped:
   - `payments` — tenant_id, member_id, amount, currency (`EUR` | `BRL`), purpose, status.
   - `subscriptions` — tenant_id/member_id, plan_id, provider (`stripe` | `revenuecat`),
     status, current_period_end.
   - `invoices` — issued documents (status; full tax handling deferred).
   - `payouts` — club payout records (via Connect).
2. Stripe (web):
   - Platform subscriptions: a tenant subscribes to a plan (`starter`/`pro`/`enterprise`).
   - Club payments: members pay clubs; use **Stripe Connect** so money can flow
     member → club → platform. Support EUR (PT) and BRL (BR), including Brazil realities
     (Pix/boleto where applicable).
   - Stripe customer portal for self-serve management.
3. Webhooks → entitlements: a Stripe webhook (Edge Function) is the ONLY writer of
   `tenant_entitlements`/`subscriptions`. On subscribe/upgrade/downgrade/cancel, update
   the tenant's plan so `packages/features` reflects it immediately. This closes the
   two-check loop: billing changes flip feature access automatically.
4. RevenueCat (mobile):
   - App-feature subscriptions only (digital access), synced to the same
     `subscriptions`/entitlement state so web + mobile share one source of truth.
   - IMPORTANT distinction: payments for real-world services (class fees, memberships)
     may use external/Stripe flows rather than store IAP. Verify current App Store /
     Play rules at implementation time and keep the two payment purposes separate.
5. Reconcile: ensure a member subscribing on mobile and a tenant's plan on web never
   produce conflicting entitlement state — define the precedence and test it.

## Constraints

- `tenant_entitlements` is mutated only by verified billing webhooks — never by client code.
- Web and mobile subscription state converge on one entitlement source of truth.
- Keep real-world-service payments separate from digital-access IAP.
- Tax handling is minimal for now (invoices exist; full tax/residency deferred).

## Definition of done

- [ ] A tenant can subscribe to a plan on web; the Stripe webhook updates entitlements and
      feature access changes without a deploy.
- [ ] A member can pay a club via Stripe Connect in EUR and in BRL.
- [ ] Downgrade/cancel correctly removes plan features via webhook.
- [ ] A mobile app-feature subscription via RevenueCat reflects in the same entitlement state.
- [ ] Web and mobile never leave the tenant in a conflicting entitlement state (tested).
- [ ] Stripe customer portal opens and manages the subscription.
