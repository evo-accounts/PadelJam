# Padel Platform — build spec package

This folder is a drop-in starting point for building the Padel Platform with Claude Code.

## What's here

- `CLAUDE.md` — root context. Claude Code reads this first. It holds the stack decisions,
  the non-negotiable architectural rules, the repo layout, and the build order.
- `specs/00…11` — eleven dependency-ordered milestones. Each is self-contained with
  Tasks, Constraints, and a Definition of done.

## How to use it

1. Drop `CLAUDE.md` at the root of your new repo and the `specs/` folder alongside it.
2. Open Claude Code in that repo.
3. Tell it: "Read CLAUDE.md, then implement specs/00-monorepo-foundation.md."
4. When a spec's Definition of done is satisfied, move to the next number.
5. Don't skip ahead — each spec assumes the previous ones are complete.

## Build order at a glance

```
00 Monorepo foundation
01 Supabase + tenant model
02 Auth & sessions            ← i18n + Sentry enter here
03 Roles, permissions & entitlements   ← the authorization core; most important
04 Member/community shell (web)         ← PostHog enters here
05 Dashboard shell (web)
06 Scheduling & classes
07 Notifications
08 Chat
09 Payments                  ← billing webhooks drive entitlements
10 Analytics & reporting
11 Mobile app                ← built last, reuses every package
```

## The rules that matter most

- Tenant is the top-level concept, not club.
- The two-check rule: entitlement (DB) + permission (CASL), enforced server-side.
- Entitlements are DB-backed; PostHog flags are rollout-only and never gate plans.
- Chat is only ever touched through `packages/chat`.
- Shared logic lives in `packages/`, never duplicated in apps.

Anything in a spec that conflicts with `CLAUDE.md` loses — `CLAUDE.md` is the source of truth.
