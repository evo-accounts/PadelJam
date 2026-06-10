# Spec 02 — Auth & sessions

**Goal:** Working authentication across web and mobile with Supabase Auth, session
handling in `packages/auth`, and the i18n foundation in place from the first screen.

**Depends on:** 01.

## Tasks

1. Configure Supabase Auth: email/password plus Apple and Google SSO. Enable the
   providers needed for both web and the native mobile flows.
2. Build `packages/auth`:
   - Session helpers (get current session, current user, sign in/out, refresh).
   - A typed `useSession()` hook usable by both Next.js and React Native.
   - A helper to resolve the user's `tenant_memberships` and an "active tenant"
     concept (a user in multiple tenants has one selected at a time).
3. Web auth (`apps/web` `(public)` group): login, register, and a tenant-switcher entry
   point. On login, hydrate active tenant. Protect `(app)`, `(dashboard)`,
   `(super-admin)` route groups via middleware.
4. Mobile auth (`apps/mobile` `(auth)`): login, register, Apple/Google SSO using the
   native flows. Persist the session with secure storage (`expo-secure-store`).
5. Stand up `packages/i18n` now: i18next configured with `pt-PT`, `pt-BR`, `en`,
   resource files, a `useT()` hook, and locale resolution from the user's profile.
   Every auth screen uses translated strings — no hard-coded copy.
6. Wire Sentry into both apps at this stage (init only) so errors are captured from the
   earliest real flows.

## Constraints

- No screen ships hard-coded user-facing strings; everything goes through `packages/i18n`.
- Session logic lives in `packages/auth`, not in app code.
- Active-tenant selection is resolved centrally and available to all later specs.

## Definition of done

- [ ] A user can register, log in, and log out on web and mobile.
- [ ] Apple and Google SSO work on mobile; at least one SSO provider works on web.
- [ ] Sessions persist across reloads (web) and app restarts (mobile, secure storage).
- [ ] A multi-tenant user can switch active tenant; the choice persists.
- [ ] All three protected web route groups reject unauthenticated access.
- [ ] Auth screens render correctly in pt-PT, pt-BR, and en.
- [ ] Sentry receives a test error from both apps.
