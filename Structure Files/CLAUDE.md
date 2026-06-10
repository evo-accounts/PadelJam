# Padel Platform — Build Specification

This file is the root context for Claude Code. Read it first, then work through
`specs/` in numeric order. Each spec is a self-contained, dependency-ordered
milestone. Do not skip ahead — later specs assume earlier ones are complete.

## What we are building

A multi-tenant community and club-management SaaS for the padel world, with three
surfaces:

1. **Mobile member app** — Expo + React Native, for members and community users.
2. **Web member app** — the same product on the web, behind login.
3. **Club-owner / admin dashboard** — web only, for club owners, staff, coaches, and
   a super-admin.

It is a modular platform: features turn on and off per tenant according to their
plan. Markets at launch are **Portugal and Brazil**. Built by a solo founder. Target
launch **January 2027**.

## The stack (non-negotiable decisions)

| Layer | Choice |
|---|---|
| Language | TypeScript everywhere |
| Monorepo | pnpm workspaces + Turborepo |
| Mobile | Expo + React Native, Expo Router |
| Web | Next.js (App Router), **one app**, surfaces split by route groups |
| Backend | Supabase: Postgres + Auth + Storage + Realtime + Edge Functions |
| Chat | Stream Chat, accessed only through `packages/chat` |
| Payments (web) | Stripe + Stripe Connect |
| Payments (mobile) | RevenueCat (app-feature subscriptions only) |
| Permissions | CASL — role + scope (tenant, location, ownership) |
| Entitlements | Custom, DB-backed (`plans`/`features`/`tenant_entitlements`) |
| i18n | i18next — pt-PT, pt-BR, en |
| Analytics | PostHog (product analytics + rollout flags only) |
| Monitoring | Sentry (Next.js + React Native) |
| Email | Resend |
| Push | Expo Notifications |
| Hosting | Vercel + Expo EAS + Supabase Cloud |

## Architectural rules that must never be violated

1. **Tenant is the top-level concept**, not club. A tenant may be a club, community,
   studio, gym, or organization. Almost every table carries `tenant_id`, and RLS is
   built on one uniform tenant-scoping pattern.

2. **The two-check rule.** Every meaningful backend action passes BOTH:
   - **Entitlement check** — does this tenant's plan include this feature? (DB-backed)
   - **Permission check** — does this user's role, in this scope, allow this action? (CASL)
   Hiding UI is never sufficient. Enforce on the server (RLS + Edge Functions).

3. **Entitlements live in the database, never in PostHog.** PostHog flags are only for
   rollout control (canaries, A/B tests, kill-switches). Plan gating is always DB-backed
   and coupled to billing webhooks.

4. **Chat is never imported directly.** All chat goes through `packages/chat`. A nightly
   job exports channels/messages to our own Postgres. This is migration insurance.

5. **Shared logic lives in `packages/`, never duplicated in apps.** If two surfaces need
   it, it belongs in a package.

6. **Mobile native dependencies must support Expo's New Architecture.** Verify before adding.

## Repo layout

```
apps/
  mobile/            Expo React Native
  web/               Next.js — (public) (app) (dashboard) (super-admin) route groups
packages/
  ui/                design tokens + cross-platform primitives
  api/               typed client + TanStack Query hooks
  auth/              session + role helpers
  db/                schema, generated types, migration helpers
  features/          entitlement registry + plan/module config
  permissions/       CASL abilities, role + scope checks
  chat/              Stream Chat abstraction
  i18n/              i18next config + locale resources
  config/            env config + constants
  utils/             dates, formatting, Zod validation, score/padel logic
infra/
  supabase/          migrations, RLS policies, edge functions, seed
```

## Build order (the specs)

| # | Spec | Depends on |
|---|---|---|
| 00 | Monorepo foundation | — |
| 01 | Supabase + tenant model | 00 |
| 02 | Auth & sessions | 01 |
| 03 | Roles, permissions & entitlements | 02 |
| 04 | Member/community shell (web) | 03 |
| 05 | Dashboard shell (web) | 03 |
| 06 | Scheduling & classes | 05 |
| 07 | Notifications | 04, 05 |
| 08 | Chat | 04 |
| 09 | Payments | 05 |
| 10 | Analytics & reporting | 05 |
| 11 | Mobile app | 04, 08 |

## Working conventions

- Conventional Commits (`feat:`, `fix:`, `chore:`…).
- Every package is independently type-checkable (`tsc --noEmit` clean).
- Zod schema is the single source of truth for a shape; TS types are inferred from it.
- No secrets in code — everything via `packages/config` reading env.
- When a spec is done, confirm its "Definition of done" checklist before moving on.

## How to use these specs

Open the lowest-numbered incomplete spec. Implement it fully, satisfy its Definition of
done, then move to the next. If something in a spec conflicts with this file, this file
wins — flag the conflict rather than guessing.
