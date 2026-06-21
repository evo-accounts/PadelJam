# Web W0 — Foundation — Design

**Slice:** Web W0 (foundation) from the WEB roadmap (mirror the player product on web).

## Problem / goal

`apps/web` (Next.js 16 / React 19 / Tailwind v4) currently has only the auth flow + route-guard middleware; the
`(app)` area is a one-line placeholder, there is **no `QueryClientProvider`** (so `@padel/api` hooks can't run),
and no UI layer or app shell. W0 builds the foundation every later web phase depends on: a working data layer, a
shadcn(studio) UI baseline, and a responsive authenticated shell that renders real data under RLS.

## Decisions (from brainstorming)

- **UI:** use the **shadcnstudio** registry from the start. Credentials live in gitignored
  `apps/web/.env.local` (`EMAIL`, `LICENSE_KEY`) and are exported to the `shadcn` CLI at component-add time.
- **Shell base:** `@ss-blocks/application-shell-08`, adapted to our nav.
- **Theme:** a clean neutral shadcn theme for now; the user supplies a custom theme later (W-later).
- **Layout:** responsive — desktop left sidebar; narrow screens collapse to a bottom tab bar (mirrors mobile).
- **Auth-parity fix included** in W0 (see §7).

## Scope

### 1. Data layer — QueryClient
Add `QueryClientProvider` (a module-level `new QueryClient()`) inside `apps/web/src/components/Providers.tsx`,
wrapping `SessionProvider`/children (mirrors `apps/mobile/app/_layout.tsx`). Enables all `@padel/api` hooks.

### 2. shadcnstudio baseline
- Stash creds in gitignored `apps/web/.env.local` (`EMAIL=…`, `LICENSE_KEY=…`).
- Apply a clean neutral theme: set the shadcn **new-york / neutral** theme CSS variables (light + dark) in
  `apps/web/src/app/globals.css` (Tailwind v4 `@theme inline`), replacing the default scaffold tokens.
- Add `apps/web/src/lib/utils.ts` `cn()` (clsx + tailwind-merge).
- Pull the shell block + needed primitives via the studio registry, e.g.
  `EMAIL=… LICENSE_KEY=… npx shadcn@latest add @ss-blocks/application-shell-08` plus any base primitives it
  needs (button, card, avatar, sheet, skeleton — from the default registry if not provided by the block).

### 3. Responsive `(app)` shell
Create `apps/web/src/app/(app)/app/layout.tsx` wrapping all `/app/*` routes. Adapt `application-shell-08` so the
nav is **Home / Events / Explore / Community / Profile** (mirrors mobile tabs) with active-route highlighting,
and a top bar exposing **chat 💬** and **notifications 🔔** icons. On narrow widths the sidebar collapses to a
**bottom tab bar**. (Active community/tenant switcher is deferred to W2.)

### 4. Nav destination stubs
Create minimal protected pages so nav never 404s (real content lands in W1+):
`/app` (home — see §5), `/app/events`, `/app/explore`, `/app/community`, `/app/profile` — the latter four render
a simple "Coming soon" placeholder within the shell.

### 5. Proof-of-stack widget (home `/app`)
The home page renders **real, RLS-backed data** to prove auth → React Query → `@padel/api` → render works on web:
"Welcome, {full_name}" via `useMyProfile`, plus a short list of the user's communities via `useCommunities`
(fallback/companion: `useMyGroups`). Loading uses a `skeleton`; empty state is handled. This is W0's acceptance
signal.

### 6. i18n shell namespace
Add a web `nav` namespace (Home / Events / Explore / Community / Profile + chat / notifications labels) to
`apps/web/src/lib/i18n-web.ts` in **en / pt-PT / pt-BR**, registered like the existing `registerWebAuthCopy`.

### 7. Web auth-parity fix (mirror mobile Phase 1.1)
In `apps/web/src/components/auth/CreateAccountStep.tsx`, after `complete-account` succeeds, re-establish the
session with the password just set (reuse `@padel/auth`'s `primaryCredential` + `signInWithPassword`) before
routing to `/app`, so web sign-up doesn't hit the same session-loss dead-end fixed on mobile. The mobile useStore
flow used the primary verified identifier from the current session — do the same here.

## Reuse
- `@padel/api` hooks (`useMyProfile`, `useCommunities`, `useMyGroups`) — verified no React Native imports.
- `@padel/auth` `primaryCredential` + `signInWithPassword` (added in mobile Phase 1.1) — already exported.
- Existing `Providers.tsx` (SessionProvider + i18n), `middleware.ts` (route guard), `lib/supabase/client.ts`.

## Verification
- `pnpm --filter web typecheck` and `pnpm --filter web build` pass.
- Run `pnpm --filter web dev` against local Supabase: sign in → land on `/app` → see "Welcome {name}" + the
  user's communities (RLS-backed); navigate every nav item (desktop sidebar + narrow bottom-nav both work);
  complete a **fresh web sign-up** and confirm it reaches `/app` with a live session (no bounce — §7).
- Drive the browser via the `run` skill's chromium path for the smoke check.

## Out of scope (W1+)
Real content on events/explore/community/profile; tenant/community switcher; shadcnstudio custom theme (user
supplies later); dark-mode toggle UI; the club-SaaS `(dashboard)`/`(super-admin)` surfaces.

## Dependencies / risks
- **shadcnstudio creds** must be present in `apps/web/.env.local` for `shadcn add` (provided).
- `shadcn add` needs network access to the studio registry; if blocked in the sandbox, components are
  hand-authored from the fetched output.
- `application-shell-08`'s exact nav structure is unknown until pulled; adapt it to our 5 nav items + header
  icons once its code is in.
