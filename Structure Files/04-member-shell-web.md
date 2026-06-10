# Spec 04 — Member / community shell (web)

**Goal:** The member-facing web app skeleton: the `(app)` route group with feed,
communities, events, and profile, reading real tenant-scoped data through
`packages/api`, with PostHog wired for product analytics.

**Depends on:** 03.

## Tasks

1. Build `packages/api` properly:
   - The typed Supabase client (consuming `packages/db` types).
   - TanStack Query hooks: `useFeed`, `useCommunity`, `useCommunities`, `useEvents`,
     `useProfile`, etc. (read paths first).
   - All reads pass through the `authorize` helper / RLS — no client-side-only gating.
2. Add the community/feed schema (migration): `communities`, `posts`, `comments`,
   `reactions`, scoped by tenant. Posts are text + images (Supabase Storage for media).
3. Build the `(app)` route group in `apps/web`:
   - App shell: nav, active-tenant context, locale-aware throughout.
   - Feed: list posts, create a text/image post, react, comment.
   - Communities: list, view a community, view membership.
   - Events: list and view an event (detail only here; booking/scoring come later).
   - Profile: view/edit own profile, switch active tenant.
4. Gate optional surfaces by entitlement (e.g. show `community_feed` only if the tenant's
   plan includes it) using `packages/features` — but always with server enforcement too.
5. Wire PostHog: product analytics events (page views, post created, etc.) and the
   rollout-flag mechanism. Document the rule in code comments: PostHog flags are for
   rollout only, never plan gating.

## Constraints

- All data access goes through `packages/api`; no ad-hoc Supabase calls in components.
- Entitlement-gated UI must still be server-enforced.
- Everything localized via `packages/i18n`.

## Definition of done

- [ ] A logged-in member sees their tenant's feed and can post text + an image.
- [ ] Reactions and comments work and are tenant-scoped (no leakage across tenants).
- [ ] Communities and events list/detail render from real data.
- [ ] Profile edit + tenant switch work end to end.
- [ ] A feature disabled by the tenant's plan is hidden AND blocked server-side.
- [ ] PostHog receives analytics events; a rollout flag can show/hide a trivial element.
