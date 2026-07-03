# Web W0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the web foundation — React Query data layer, shadcn(studio) UI baseline, and a responsive authenticated `(app)` shell that renders real RLS-backed data — plus the web auth-parity fix.

**Architecture:** Add `QueryClientProvider` to the existing web `Providers`, establish the shadcn neutral theme + `cn()` + components (incl. the `@ss-blocks/application-shell-08` shell), build a responsive `(app)` shell adapting that block to our 5 nav items, stub the nav pages, prove the stack with a data-backed home page, and re-establish the session after `complete-account`.

**Tech Stack:** Next.js 16 (App Router) / React 19 / Tailwind v4 / shadcn(studio) / @tanstack/react-query / `@padel/api` + `@padel/auth`.

**Spec:** [docs/superpowers/specs/2026-06-21-web-w0-foundation-design.md](specs/2026-06-21-web-w0-foundation-design.md)

---

## Task 1: QueryClient provider

**Files:** Modify `apps/web/src/components/Providers.tsx`; Modify `apps/web/package.json` (ensure `@tanstack/react-query` dep).

- [ ] **Step 1:** Ensure `@tanstack/react-query` is a direct dependency of `apps/web` (it's a dep of `@padel/api`, but the provider imports it directly). If missing from `apps/web/package.json` dependencies, add it at the same version `@padel/api` uses, then `pnpm install`.

- [ ] **Step 2:** In `apps/web/src/components/Providers.tsx`, add the import and a module-level client, and wrap the tree. Add near the other imports:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
```
Add at module scope (after imports, before the component):
```tsx
const queryClient = new QueryClient();
```
Change the returned tree from:
```tsx
    <I18nextProvider i18n={i18n}>
      <SessionProvider client={client}>{children}</SessionProvider>
    </I18nextProvider>
```
to:
```tsx
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider client={client}>{children}</SessionProvider>
      </QueryClientProvider>
    </I18nextProvider>
```

- [ ] **Step 3:** `pnpm --filter web typecheck` → PASS.

- [ ] **Step 4:** Commit:
```bash
git add apps/web/src/components/Providers.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): QueryClientProvider so @padel/api hooks run on web (W0)"
```

---

## Task 2: shadcn(studio) baseline — creds, theme, cn, components

**Files:** Create `apps/web/.env.local` (gitignored); Modify `apps/web/src/app/globals.css`; Create `apps/web/src/lib/utils.ts`; add components under `apps/web/src/components/ui/`.

- [ ] **Step 1: Stash shadcnstudio creds (gitignored).** Write `apps/web/.env.local` with:
```
EMAIL=tools@jpmalaggi.com
LICENSE_KEY=273E27F5-4AE4-4B00-9DB2-03722A6DC7CB
```
Confirm it's ignored: `git check-ignore apps/web/.env.local` (already ignored). Never commit or echo these.

- [ ] **Step 2: `cn()` util** — create `apps/web/src/lib/utils.ts`:
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```
Ensure `clsx` + `tailwind-merge` are deps of `apps/web` (shadcn adds them; if not, `pnpm --filter web add clsx tailwind-merge`).

- [ ] **Step 3: Neutral theme tokens** — replace the scaffold tokens in `apps/web/src/app/globals.css` with the shadcn new-york/neutral Tailwind-v4 theme (light + dark). Keep `@import "tailwindcss";` at the top. Use the standard shadcn v4 `:root`/`.dark` oklch token set + `@theme inline` mapping + the `@layer base` border/bg defaults. (Canonical shadcn "neutral" output — the implementer can regenerate via `npx shadcn@latest init` choosing neutral if preferred, but must NOT overwrite `components.json`'s studio registries.)

- [ ] **Step 4: Pull components from the studio registry.** From `apps/web`, with creds exported, pull the shell block + base primitives:
```bash
cd apps/web
set -a; source .env.local; set +a
npx shadcn@latest add @ss-blocks/application-shell-08 --yes
npx shadcn@latest add button card avatar sheet skeleton --yes
```
If the studio block already bundles primitives, skip duplicates. If network/registry is blocked, capture the error and report (fallback: hand-author the primitives from the standard shadcn source). Verify files landed under `apps/web/src/components/ui/`.

- [ ] **Step 5:** `pnpm --filter web typecheck` + `pnpm --filter web build` → PASS (the pulled components compile).

- [ ] **Step 6:** Commit:
```bash
git add apps/web/src/app/globals.css apps/web/src/lib/utils.ts apps/web/src/components/ui apps/web/package.json pnpm-lock.yaml apps/web/components.json
git commit -m "feat(web): shadcn neutral theme + cn + application-shell-08 components (W0)"
```
(Do NOT `git add apps/web/.env.local` — it's gitignored.)

---

## Task 3: Responsive (app) shell layout

**Files:** Create `apps/web/src/app/(app)/app/layout.tsx`; Create `apps/web/src/components/app-shell/AppSidebar.tsx` (+ any small nav components).

- [ ] **Step 1: Define the nav model.** Create the nav config the shell renders — 5 items mirroring mobile, each `{ key, href, labelKey, icon }` (lucide icons):
```tsx
// apps/web/src/components/app-shell/nav.ts
import { Home, CalendarDays, Compass, Users, User, type LucideIcon } from 'lucide-react';
export type NavItem = { key: string; href: string; labelKey: string; icon: LucideIcon };
export const APP_NAV: NavItem[] = [
  { key: 'home', href: '/app', labelKey: 'nav.home', icon: Home },
  { key: 'events', href: '/app/events', labelKey: 'nav.events', icon: CalendarDays },
  { key: 'explore', href: '/app/explore', labelKey: 'nav.explore', icon: Compass },
  { key: 'community', href: '/app/community', labelKey: 'nav.community', icon: Users },
  { key: 'profile', href: '/app/profile', labelKey: 'nav.profile', icon: User },
];
```

- [ ] **Step 2: Build the shell from `application-shell-08`.** Create `apps/web/src/app/(app)/app/layout.tsx` (a client component — it uses `usePathname` for active highlight + `useT`). Adapt the pulled `application-shell-08` markup so that:
  - the **sidebar** renders `APP_NAV` with `next/link` `href`s and active-state styling driven by `usePathname()` (active when `pathname === item.href`, or `startsWith` for `/app` children);
  - the **top bar** shows the brand + a **chat** icon (`MessageCircle`) linking `/app` (placeholder target until W5) and a **notifications** icon (`Bell`) (placeholder until W6);
  - on **narrow** screens (Tailwind `md:` breakpoint) the sidebar hides and a fixed **bottom tab bar** renders the same `APP_NAV` (icon + short label);
  - labels come from `useT()` with the `nav.*` keys (Task 6);
  - `{children}` renders in the main content region.
  Keep the shell visual identity from `application-shell-08`; only swap nav data, links, active logic, and the responsive bottom bar. If `application-shell-08` already provides a responsive collapse, use it; otherwise add the bottom-bar with `cn()` + `md:hidden` / `hidden md:flex`.

- [ ] **Step 3:** `pnpm --filter web typecheck` + `build` → PASS.

- [ ] **Step 4:** Commit:
```bash
git add "apps/web/src/app/(app)/app/layout.tsx" apps/web/src/components/app-shell
git commit -m "feat(web): responsive (app) shell (sidebar + mobile bottom-nav) (W0)"
```

---

## Task 4: Nav destination stub pages

**Files:** Create `apps/web/src/app/(app)/app/{events,explore,community,profile}/page.tsx`.

- [ ] **Step 1:** Create each of the four pages with a simple in-shell placeholder. Example for `events` (repeat with the matching label key for explore/community/profile):
```tsx
// apps/web/src/app/(app)/app/events/page.tsx
'use client';
import { useT } from '@padel/i18n';
export default function EventsPage() {
  const { t } = useT('app');
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">{t('nav.events')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('comingSoon')}</p>
    </div>
  );
}
```
explore → `t('nav.explore')`; community → `t('nav.community')`; profile → `t('nav.profile')`. All use `t('comingSoon')` for the body.

- [ ] **Step 2:** `pnpm --filter web typecheck` → PASS; manually confirm each route resolves under the shell.

- [ ] **Step 3:** Commit:
```bash
git add "apps/web/src/app/(app)/app"
git commit -m "feat(web): (app) nav stub pages (W0)"
```

---

## Task 5: Proof-of-stack home page

**Files:** Modify `apps/web/src/app/(app)/app/page.tsx`.

- [ ] **Step 1:** Replace the placeholder home with a data-backed page that proves auth → React Query → `@padel/api` → RLS render. Use `useMyProfile` + `useCommunities` (both confirmed exported from `@padel/api`), `Skeleton` for loading, and an empty state:
```tsx
'use client';
import { useMyProfile, useCommunities } from '@padel/api';
import { useT } from '@padel/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export default function AppHome() {
  const { t } = useT('app');
  const profile = useMyProfile();
  const communities = useCommunities();

  return (
    <div className="p-6 flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">
        {profile.isLoading ? <Skeleton className="h-8 w-48" /> : t('welcome', { name: profile.data?.full_name ?? '' })}
      </h1>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t('nav.community')}</h2>
        {communities.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (communities.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noCommunities')}</p>
        ) : (
          <div className="grid gap-2">
            {(communities.data ?? []).map((c) => (
              <Card key={c.id} className="p-4">{c.name}</Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```
Adjust property access (`c.id`, `c.name`, `profile.data?.full_name`) to the actual hook return shapes — open `packages/api/src` for `useMyProfile`/`useCommunities` return types and match exactly (don't guess field names).

- [ ] **Step 2:** `pnpm --filter web typecheck` → PASS.

- [ ] **Step 3:** Commit:
```bash
git add "apps/web/src/app/(app)/app/page.tsx"
git commit -m "feat(web): data-backed home proving the @padel/api stack on web (W0)"
```

---

## Task 6: i18n shell namespace

**Files:** Modify `apps/web/src/lib/i18n-web.ts`.

- [ ] **Step 1:** Mirror the existing `registerWebAuthCopy` pattern to add an `app` namespace for the shell, in all three locales (en, pt-PT, pt-BR). Keys: `nav.home`, `nav.events`, `nav.explore`, `nav.community`, `nav.profile`, `comingSoon`, `welcome` (with `{{name}}`), `noCommunities`. Read the current file to match its registration style (it registers into the i18n instance); add an `registerWebAppCopy(instance)` export and call it from `Providers.tsx` alongside `registerWebAuthCopy`. English values:
```
nav.home = "Home"; nav.events = "Events"; nav.explore = "Explore"; nav.community = "Community"; nav.profile = "Profile";
comingSoon = "Coming soon"; welcome = "Welcome, {{name}}"; noCommunities = "You're not in any communities yet.";
```
pt-PT / pt-BR: translate equivalently (e.g. pt-PT `nav.events = "Eventos"`, `comingSoon = "Em breve"`, `welcome = "Bem-vindo, {{name}}"`; pt-BR similar). Match the locale style already used in `i18n-web.ts`.

- [ ] **Step 2:** In `apps/web/src/components/Providers.tsx`, import and call `registerWebAppCopy(instance)` right after `registerWebAuthCopy(instance)`.

- [ ] **Step 3:** `pnpm --filter web typecheck` → PASS.

- [ ] **Step 4:** Commit:
```bash
git add apps/web/src/lib/i18n-web.ts apps/web/src/components/Providers.tsx
git commit -m "feat(web): app/nav i18n namespace (en/pt-PT/pt-BR) (W0)"
```

---

## Task 7: Web auth-parity fix (re-establish session after complete-account)

**Files:** Modify `apps/web/src/lib/useAuthFlow.ts` (the `completeAccount` callback).

- [ ] **Step 1:** In `completeAccount`, after the `if (!resp.ok) { setError(...); return; }` guard and **before** `router.push('/app')`, re-establish a durable session with the password just set, using the primary verified identifier (`identifier` + `kind` are in scope). Add the import from `@padel/auth`:
```ts
import { signInWithPassword } from '@padel/auth';
```
Insert before the `router.push('/app')` in `completeAccount`:
```ts
        // complete-account sets a password via the admin API, which rotates the OTP-issued refresh
        // token; re-establish a fresh session with the password we just set before entering the app.
        const { error: signInErr } = await signInWithPassword(client, identifier.trim(), kind, password);
        if (signInErr) {
          setError('session-refresh-failed');
          setStep('identifier');
          return;
        }
```
(`client` and `password` are in scope in `completeAccount`; `identifier`/`kind` are flow state. Confirm `signInWithPassword` is exported from `@padel/auth` — it is, from `packages/auth/src/password.ts`.)

- [ ] **Step 2:** `pnpm --filter web typecheck` → PASS.

- [ ] **Step 3:** Commit:
```bash
git add apps/web/src/lib/useAuthFlow.ts
git commit -m "fix(web-auth): re-establish session after complete-account (parity with mobile Phase 1.1) (W0)"
```

---

## Task 8: Verify end-to-end (browser)

No code. Local Supabase running.

- [ ] **Step 1:** `pnpm --filter web typecheck` && `pnpm --filter web build` → both PASS.
- [ ] **Step 2:** `pnpm --filter web dev`; open the app, sign in (email OTP via Mailpit `http://127.0.0.1:55324`).
- [ ] **Step 3:** Land on `/app` → see "Welcome, {name}" + the user's communities (RLS-backed; proves the data stack). Use the `run` skill's chromium path to drive + screenshot.
- [ ] **Step 4:** Click each nav item (Home/Events/Explore/Community/Profile) → routes resolve within the shell, active state highlights. Resize narrow → bottom tab bar appears and works.
- [ ] **Step 5:** Sign out; do a **fresh sign-up** (new email → OTP → create account) → lands on `/app` with a live session (no bounce — validates Task 7).

---

## Verification (summary)
- Per-task `pnpm --filter web typecheck`; `build` after the UI tasks; browser smoke (Task 8).
- Finish via superpowers:finishing-a-development-branch (merge to `main` after review).

## Out of scope (W1+)
Real content on events/explore/community/profile; tenant/community switcher; shadcnstudio custom theme (user supplies later); dark-mode toggle UI; `(dashboard)`/`(super-admin)`.
