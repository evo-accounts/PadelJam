# PadelJam Production Bug-Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the bugs found in the 2026-07-04 full-code review so the app runs smoothly in production, and document every action that must be performed manually outside the code.

**Architecture:** The fixes are independent, small slices across the monorepo: one lint/CI unblock, two client-side auth-lifecycle fixes (query-cache reset, push registration), one DB migration hardening account deletion, two edge-function robustness fixes, one auth-security mitigation, web legal pages, and config/metadata corrections. No new subsystems; every task follows existing patterns in the repo.

**Tech Stack:** pnpm + Turborepo, TypeScript, React 19 / React Native (Expo SDK, expo-router), Next.js, TanStack Query v5, Supabase (Postgres 17, RLS, edge functions on Deno), Stream Chat, Vitest.

**Verification commands used throughout** (run from the repo root):

```bash
pnpm lint        # eslint across all packages (currently FAILS — Task 1 fixes it)
pnpm typecheck   # tsc --noEmit across all packages
pnpm test        # vitest across all packages
```

SQL is verified against the local Supabase stack (alternate ports — API 55321, DB 55322):

```bash
pnpm dlx supabase@latest --workdir infra start          # if not already running
pnpm dlx supabase@latest --workdir infra db reset       # applies all migrations + seed
psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -f infra/supabase/tests/<file>.sql
```

---

## Review findings (summary)

| # | Severity | Finding | Fixed by |
|---|----------|---------|----------|
| 1 | **CI-blocking** | `pnpm lint` fails: unused arg `_communityId` in `packages/api/src/events/mutations.ts:655` | Task 1 |
| 2 | **High** | React Query cache is never cleared on sign-out/user-switch; keys like `my-events`, `notifications`, `my-groups` are not user-scoped → previous user's data shown to the next user on a shared device | Task 2 |
| 3 | **High** | `registerForPush()` runs only on cold start when already authenticated (`apps/mobile/app/_layout.tsx:172`); a user who just signed in gets no push token until an app restart | Task 3 |
| 4 | **High** | Account deletion leaves `push_tokens` rows behind (function `soft_delete_account` predates push), and the delete-account screen never unregisters the device token | Task 4 |
| 5 | **High** | `soft_delete_account` deletes **all** `event_participants` rows, cascading into `match_players` → completed-event history/standings silently corrupted for other players | Task 4 |
| 6 | **High (security)** | `complete-account` edge function attaches any client-supplied secondary email/phone to `auth.users` **without verification** — a user can squat another person's email, which later trips `social_email_conflict` and locks the real owner out of social sign-in | Task 5 |
| 7 | **Medium** | `resolvePostAuthRoute` detects social users only via `app_metadata.provider`, which stays `'email'` after Supabase auto-linking; the provision retry never fires for linked users and they are mis-routed to `create-account` | Task 6 |
| 8 | **Medium** | `ensure-channel` reconciles Stream members with `queryMembers({})` (first 100 only) and un-chunked `addMembers`/`removeMembers` (Stream caps 100/call) → channels with >100 members mis-reconcile or throw | Task 7 |
| 9 | **Medium** | `send-push` ignores Expo per-ticket errors: `DeviceNotRegistered` tokens are never pruned and accumulate forever | Task 8 |
| 10 | **Medium** | Web app has no `/terms`, `/privacy`, `/help` routes but both apps link to `https://padeljam.app/terms|privacy|help` → 404s in production; the privacy URL is checked in App Store review | Task 9 |
| 11 | **Medium** | `apps/mobile/app.json` has `"name": "mobile"` → the installed app displays as "mobile", not "PadelJam" | Task 10 |
| 12 | **Medium** | `infra/supabase/config.toml` has `auth.rate_limit.email_sent = 2` (per hour, project-wide). If this config is pushed to production, all auth emails (OTP, recovery, email-change) break after 2 sends/hour | Task 11 |
| 13 | **Low** | Concurrent "materialize next occurrence" taps can race past the pre-check and hit the `events_series_slot_uniq` unique index → raw `unknown_error` shown to the organizer | Task 12 |
| 14 | **Info** | `ensure-channel` add/remove is non-atomic (documented, self-heals on next open); Expo push receipts + badge counts are a deferred slice (B4b, per handoff doc) | not in scope |

Items requiring human action outside the code (provider credentials, dashboard settings, store setup, a Supabase support ticket, deploys) are in the **Manual actions** section at the end.

---

### Task 1: Unblock CI — fix the eslint unused-var failure

The repo-wide `pnpm lint` fails on `packages/api/src/events/mutations.ts:655` (`'_communityId' is defined but never used`). The variable is intentionally unused in `mutationFn` (it is consumed by `onSuccess`), and the codebase already uses the `_`-prefix convention (`_data`, `_d`, `_err`). Teach eslint that convention globally instead of renaming call sites.

**Files:**
- Modify: `eslint.config.mjs`

- [ ] **Step 1: Reproduce the failure**

Run: `pnpm lint`
Expected: FAIL — `@padel/api:lint` reports `655:24 error '_communityId' is defined but never used`.

- [ ] **Step 2: Add the `_`-prefix exemption to the root flat config**

Replace the full contents of `eslint.config.mjs` with:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/.expo/**', '**/database.types.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // `_`-prefixed identifiers are intentionally unused (mutation args consumed
      // only by onSuccess, ignored tuple slots, etc.).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
);
```

- [ ] **Step 3: Verify lint passes repo-wide**

Run: `pnpm lint`
Expected: PASS — all packages, including `@padel/api` and `web` (the web app extends its own config; confirm it still passes).

- [ ] **Step 4: Commit**

```bash
git add eslint.config.mjs
git commit -m "fix(lint): allow _-prefixed unused args/vars; unblocks pnpm lint"
```

---

### Task 2: Clear the React Query cache when the signed-in user changes

Query keys (`qk.myEvents`, `qk.notifications`, `qk.myGroups`, …) are not user-scoped, and neither app clears the cache on sign-out. Sign out → sign in as someone else on the same device and the previous user's events/notifications/profile render from cache. Fix centrally: a small hook in `@padel/api` that watches the session uid and calls `queryClient.clear()` whenever it changes (including to `null`), mounted once in each app's provider tree.

**Files:**
- Create: `packages/api/src/cache-reset.ts`
- Test: `packages/api/src/cache-reset.test.ts`
- Modify: `packages/api/src/index.ts`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/web/src/components/Providers.tsx`

- [ ] **Step 1: Write the failing test for the pure decision function**

Create `packages/api/src/cache-reset.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldResetCache } from './cache-reset';

describe('shouldResetCache', () => {
  it('does not reset on the first observation (app boot)', () => {
    expect(shouldResetCache(undefined, 'user-a')).toBe(false);
    expect(shouldResetCache(undefined, null)).toBe(false);
  });
  it('resets when a signed-in user signs out', () => {
    expect(shouldResetCache('user-a', null)).toBe(true);
  });
  it('resets when the user switches', () => {
    expect(shouldResetCache('user-a', 'user-b')).toBe(true);
  });
  it('resets when a signed-out session signs in (stale anonymous cache)', () => {
    expect(shouldResetCache(null, 'user-a')).toBe(true);
  });
  it('does not reset on token refresh (same uid)', () => {
    expect(shouldResetCache('user-a', 'user-a')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @padel/api test -- run src/cache-reset.test.ts`
Expected: FAIL — `Cannot find module './cache-reset'` (or equivalent resolve error).

- [ ] **Step 3: Implement the decision function + hook**

Create `packages/api/src/cache-reset.ts`:

```ts
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@padel/auth';

/**
 * Whether the query cache must be wiped given the previously observed uid and
 * the current one. `undefined` prev = first observation (boot) — never reset,
 * so a cold start with a persisted session doesn't nuke fresh queries.
 */
export function shouldResetCache(
  prevUid: string | null | undefined,
  nextUid: string | null,
): boolean {
  if (prevUid === undefined) return false;
  return prevUid !== nextUid;
}

/**
 * Clears the React Query cache whenever the authenticated user changes
 * (sign-out, or a different user signing in). Query keys are not user-scoped
 * (see query-keys.ts), so without this a shared device leaks the previous
 * user's cached data. Mount once inside both QueryClientProvider and
 * SessionProvider.
 */
export function useAuthCacheReset(): void {
  const { session, loading } = useSession();
  const qc = useQueryClient();
  const lastUid = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (loading) return; // session not resolved yet — don't record null as "signed out"
    const uid = session?.user.id ?? null;
    if (shouldResetCache(lastUid.current, uid)) qc.clear();
    lastUid.current = uid;
  }, [session, loading, qc]);
}
```

- [ ] **Step 4: Export from the package barrel**

In `packages/api/src/index.ts`, add alongside the existing exports:

```ts
export * from './cache-reset';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @padel/api test -- run src/cache-reset.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Mount the hook in the mobile app**

In `apps/mobile/app/_layout.tsx`:

1. Add to the imports from `@padel/api` (there is no `@padel/api` import today; add one):

```tsx
import { useAuthCacheReset } from '@padel/api';
```

2. Inside the `Boot` component (which already renders under both providers), call the hook right next to the existing `usePushTapRouting()`:

```tsx
function Boot() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  usePushTapRouting();
  useAuthCacheReset();
  // ... rest unchanged
```

- [ ] **Step 7: Mount the hook in the web app**

In `apps/web/src/components/Providers.tsx`, add a tiny child component (the hook needs both providers above it):

```tsx
import { useAuthCacheReset } from '@padel/api';

function AuthCacheReset() {
  useAuthCacheReset();
  return null;
}
```

and render it inside `SessionProvider`:

```tsx
<SessionProvider client={client}>
  <AuthCacheReset />
  {children}
</SessionProvider>
```

Note: `packages/api` is already a dependency of the web app (it uses `qk` and hooks throughout `(app)` pages), so no package.json change is needed.

- [ ] **Step 8: Verify the workspace still builds**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/api/src/cache-reset.ts packages/api/src/cache-reset.test.ts packages/api/src/index.ts apps/mobile/app/_layout.tsx apps/web/src/components/Providers.tsx
git commit -m "fix(auth): clear react-query cache on sign-out/user switch"
```

---

### Task 3: Register the push token as soon as a session exists (not only on cold start)

`registerForPush()` is currently called only from the `Boot` splash effect when the app cold-starts already authenticated. A user who signs in (OTP, password, or social) inside a running app never registers a token until they kill and relaunch the app. `(tabs)/_layout.tsx` mounts exactly when an authenticated user reaches the main app — register there. `registerForPush` is idempotent (RPC upserts on `(user_id, expo_token)`) and self-guarding (no-ops off-device / without permission), so the duplicate call from `Boot` stays harmless.

**Files:**
- Modify: `apps/mobile/app/(tabs)/_layout.tsx`

- [ ] **Step 1: Add the registration effect**

In `apps/mobile/app/(tabs)/_layout.tsx`:

1. Extend the react import and add the push import:

```tsx
import { useEffect } from 'react';
import { registerForPush } from '@/lib/push';
```

2. Inside `TabLayout()`, next to the existing `useNotificationsRealtime()`:

```tsx
export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { t } = useT('community');
  const router = useRouter();

  useNotificationsRealtime();

  // (tabs) only mounts for an authenticated user. Registering here (not just in
  // the cold-start Boot path) covers fresh sign-ins within a running app.
  // registerForPush is idempotent and never throws.
  useEffect(() => {
    void registerForPush();
  }, []);
  // ... rest unchanged
```

- [ ] **Step 2: Verify typecheck/lint**

Run: `pnpm --filter mobile typecheck && pnpm --filter mobile lint`
Expected: PASS. (On-device behavior is re-verified in Manual actions step M9.)

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/app/(tabs)/_layout.tsx"
git commit -m "fix(push): register push token when tabs mount, covering fresh sign-ins"
```

---

### Task 4: Account deletion — purge push tokens & notifications, preserve completed-event history

Two defects in `soft_delete_account()` (defined in `infra/supabase/migrations/0059_account_deletion.sql`, never amended since):

1. It predates push (`0077`) and notifications cleanup — `push_tokens` and `notifications` rows survive deletion, so a deleted account's device can keep receiving pushes and stale tokens accumulate.
2. `delete from event_participants where user_id = uid` removes **all** participation, including completed events. `match_players`/`round_rests` cascade (`0042`, `on delete cascade`) and `event_teams` set-null (`0041`), so finished matches lose players and historical standings silently change for everyone else. Completed/in-progress participation must be kept — the profile row is anonymized to "Deleted user", which is exactly what should render in old results.

Also: the mobile delete-account screen never unregisters the device push token (settings sign-out does).

**Files:**
- Create: `infra/supabase/migrations/0085_account_deletion_fixes.sql`
- Create: `infra/supabase/tests/account_deletion.sql`
- Modify: `apps/mobile/app/profile/delete-account.tsx`

- [ ] **Step 1: Write the migration**

Create `infra/supabase/migrations/0085_account_deletion_fixes.sql`:

```sql
-- Account-deletion fixes (review 2026-07-04):
--  1. purge push_tokens + notifications (both postdate 0059 and were never added here)
--  2. keep participation in in_progress/completed events so finished matches,
--     standings and group results are not corrupted for other players — the
--     anonymized "Deleted user" profile renders in their place. Participation in
--     scheduled/cancelled events is still removed (frees roster spots).
create or replace function soft_delete_account()
returns void
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return; end if;

  delete from follows  where follower_id = uid or followee_id = uid;
  delete from blocks   where blocker_id = uid or blocked_id = uid;
  delete from reports  where reporter_id = uid;
  delete from user_settings     where user_id = uid;
  delete from community_members where user_id = uid;
  delete from group_members     where user_id = uid;
  delete from push_tokens       where user_id = uid;
  delete from notifications     where user_id = uid;

  -- Only upcoming/cancelled events: completed & in-progress history is preserved.
  delete from event_participants ep
   using events e
   where ep.user_id = uid
     and e.id = ep.event_id
     and e.status in ('scheduled','cancelled');

  update profiles
     set full_name = 'Deleted user',
         email = 'deleted+' || uid::text || '@deleted.invalid',
         phone = 'deleted-' || uid::text,
         avatar_url = null,
         description = null,
         location_text = null,
         location_point = null,
         dominant_hand = null,
         court_side = null,
         preferred_time = null,
         gender = null,
         date_of_birth = null,
         deleted_at = now()
   where id = uid;
end;
$$;

grant execute on function soft_delete_account() to authenticated;
```

- [ ] **Step 2: Write the SQL test**

Create `infra/supabase/tests/account_deletion.sql` (same psql style as the existing tests — raise `PT001` when an expectation fails):

```sql
-- soft_delete_account: push tokens + notifications are purged; participation in a
-- completed event survives (anonymized), participation in a scheduled event is removed.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('fd000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','delown@x.com'),
  ('fd000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','delme@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('fd000001-0000-0000-0000-000000000001','delown@x.com','+351904000001','DelOwner'),
  ('fd000002-0000-0000-0000-000000000002','delme@x.com','+351904000002','DelMe') on conflict do nothing;

-- Deletee has a push token and a notification.
set local role authenticated;
set local request.jwt.claims = '{"sub":"fd000002-0000-0000-0000-000000000002","role":"authenticated"}';
select register_push_token('ExponentPushToken[deltest]', 'ios');
reset role;
insert into notifications (user_id, type) values ('fd000002-0000-0000-0000-000000000002','follow');

-- One completed and one scheduled private event owned by the other user; deletee confirmed in both.
insert into events (id, organizer_id, event_type, specification, scoring_mode, num_courts,
                    starts_at, duration_minutes, is_private, name, status)
values
  ('ed000001-0000-0000-0000-000000000001','fd000001-0000-0000-0000-000000000001','americano','open','classic',1,
   now() - interval '7 days', 90, true, 'DelDone', 'completed'),
  ('ed000002-0000-0000-0000-000000000002','fd000001-0000-0000-0000-000000000001','americano','open','classic',1,
   now() + interval '7 days', 90, true, 'DelNext', 'scheduled');
insert into event_participants (event_id, user_id, status) values
  ('ed000001-0000-0000-0000-000000000001','fd000002-0000-0000-0000-000000000002','confirmed'),
  ('ed000002-0000-0000-0000-000000000002','fd000002-0000-0000-0000-000000000002','confirmed');

-- Run the deletion as the deletee.
set local role authenticated;
set local request.jwt.claims = '{"sub":"fd000002-0000-0000-0000-000000000002","role":"authenticated"}';
select soft_delete_account();
reset role;

do $$
begin
  if exists (select 1 from push_tokens where user_id = 'fd000002-0000-0000-0000-000000000002') then
    raise exception 'PT001: push tokens not purged';
  end if;
  if exists (select 1 from notifications where user_id = 'fd000002-0000-0000-0000-000000000002') then
    raise exception 'PT001: notifications not purged';
  end if;
  if not exists (select 1 from event_participants
                  where event_id = 'ed000001-0000-0000-0000-000000000001'
                    and user_id = 'fd000002-0000-0000-0000-000000000002') then
    raise exception 'PT001: completed-event participation must survive';
  end if;
  if exists (select 1 from event_participants
              where event_id = 'ed000002-0000-0000-0000-000000000002'
                and user_id = 'fd000002-0000-0000-0000-000000000002') then
    raise exception 'PT001: scheduled-event participation must be removed';
  end if;
  if (select full_name from profiles where id = 'fd000002-0000-0000-0000-000000000002') <> 'Deleted user' then
    raise exception 'PT001: profile not anonymized';
  end if;
end $$;
rollback;
```

Note: if `insert into events` fails locally because of NOT NULL columns added by later migrations, check `\d events` and extend the column list — keep the two-event structure (one `completed`, one `scheduled`) intact.

- [ ] **Step 3: Apply + run the test locally**

```bash
pnpm dlx supabase@latest --workdir infra db reset
psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -v ON_ERROR_STOP=1 -f infra/supabase/tests/account_deletion.sql
```

Expected: `ROLLBACK` with no `PT001` error raised.

- [ ] **Step 4: Unregister the device token in the delete-account screen**

In `apps/mobile/app/profile/delete-account.tsx`:

1. Add the import:

```tsx
import { unregisterForPush } from '@/lib/push';
```

2. In `doDelete`, right before the `fetch` call (after the session check):

```tsx
      try {
        await unregisterForPush();
      } catch {
        /* best-effort; the migration also purges tokens server-side */
      }
```

- [ ] **Step 5: Verify workspace checks**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add infra/supabase/migrations/0085_account_deletion_fixes.sql infra/supabase/tests/account_deletion.sql apps/mobile/app/profile/delete-account.tsx
git commit -m "fix(account-deletion): purge push tokens/notifications, preserve completed-event history"
```

---

### Task 5: complete-account — refuse a secondary email/phone already owned by another account

`infra/supabase/functions/complete-account/index.ts` attaches the client-supplied secondary identifier via `admin.auth.admin.updateUserById` with **no ownership verification**. An attacker can claim a victim's email as their "secondary" identifier; the value lands on `auth.users` and `profiles.email`, and later `social_email_conflict()` (migration 0083) sees the victim's own sign-in as a conflict — locking the real owner out. Full verification of the secondary identifier (OTP round-trip) is a product decision (AU-07 says lazy/unconfirmed); the minimal safe fix shipped here: reject an email/phone that already exists on any **other** auth user or profile.

**Files:**
- Modify: `infra/supabase/functions/complete-account/index.ts`

- [ ] **Step 1: Add the ownership pre-check**

In `infra/supabase/functions/complete-account/index.ts`, insert between the validation block (`if (!full_name || ...)`) and `// 1) Attach secondary identifier...`:

```ts
  // Refuse identifiers already owned by ANOTHER account (prevents squatting a
  // victim's email/phone as an unverified secondary identifier — AU-07 keeps the
  // identifier unconfirmed, so without this check the attach would poison
  // social_email_conflict() for the rightful owner).
  if (email) {
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .ilike('email', email)
      .neq('id', user.id);
    if ((count ?? 0) > 0) return json({ error: 'email_taken' }, 409);
  }
  if (phone) {
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('phone', phone)
      .neq('id', user.id);
    if ((count ?? 0) > 0) return json({ error: 'phone_taken' }, 409);
  }
```

Note: `const admin = createClient(url, serviceKey);` currently sits *below* the validation block — move that line up so it is declared before the new pre-check (it takes no request-dependent input, so hoisting is safe). `auth.users` uniqueness still backstops the race window (the `updateUserById` call fails if the identifier is registered there), so a plain `profiles` check is sufficient here.

- [ ] **Step 2: Surface the new error codes in the client copy**

Find where the mobile create-account screen maps `complete-account` errors (`apps/mobile/app/(auth)/create-account.tsx` and, on web, `apps/web/src/lib/useAuthFlow.ts` / the create-account form). Add handling that maps `email_taken` / `phone_taken` to the existing "already in use" copy — reuse the i18n key used for the OTP-flow duplicate-identifier case if one exists; otherwise add keys `auth:emailTaken` = "This email is already linked to another account." and `auth:phoneTaken` = "This phone number is already linked to another account." in `packages/i18n`'s auth copy registrations (`registerWebAuthCopy` / mobile equivalent in `apps/mobile/lib/i18n-mobile.ts`).

- [ ] **Step 3: Verify locally**

With the local stack running, serve functions and exercise the path:

```bash
pnpm dlx supabase@latest --workdir infra functions serve complete-account
```

Manually: create user A (email OTP) and complete with phone P; create user B and attempt to complete with the same phone P → expect HTTP 409 `{"error":"phone_taken"}`.

- [ ] **Step 4: Commit**

```bash
git add infra/supabase/functions/complete-account/index.ts apps/mobile packages/i18n apps/web
git commit -m "fix(auth): reject secondary email/phone owned by another account in complete-account"
```

---

### Task 6: postAuthRoute — recognize auto-linked social users via the `providers` array

`provision-social-profile` (the edge function) checks **both** `app_metadata.provider` and `app_metadata.providers`, with a comment explaining Supabase auto-linking keeps `provider='email'` after Apple/Google is linked. The client-side safety net `apps/mobile/lib/postAuthRoute.ts` checks only `provider` — so an auto-linked social user with a missing profile skips the provision retry and is dumped into the OTP `create-account` flow.

**Files:**
- Modify: `apps/mobile/lib/postAuthRoute.ts`
- Test: `apps/mobile/lib/postAuthRoute.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

`apps/mobile/lib/postAuthRoute.test.ts` already mocks `supabase` and `provisionSocialProfile` (read it first and follow its existing mock pattern exactly). Add a case: session whose `app_metadata` is `{ provider: 'email', providers: ['email', 'google'] }`, no profile row on first fetch, profile row present on the fetch after provisioning → expect the resolved route to be an onboarding route (provision retried), **not** `/(auth)/create-account`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter mobile test -- run lib/postAuthRoute.test.ts`
Expected: the new case FAILS (route resolves to `/(auth)/create-account`).

- [ ] **Step 3: Fix the detection**

In `apps/mobile/lib/postAuthRoute.ts`, replace `isSocialSession` with:

```ts
const SOCIAL_PROVIDERS = ['apple', 'google'];

function isSocialSession(session: {
  user: { app_metadata?: { provider?: string; providers?: string[] } };
}): boolean {
  // Mirror provision-social-profile: check both `provider` (original signup
  // method) and `providers` (all linked identities) — Supabase auto-linking
  // keeps provider='email' after Apple/Google is linked.
  const meta = session.user.app_metadata ?? {};
  const provider = meta.provider ?? '';
  const providers = meta.providers ?? [];
  return (
    SOCIAL_PROVIDERS.includes(provider) ||
    providers.some((p) => SOCIAL_PROVIDERS.includes(p))
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter mobile test -- run lib/postAuthRoute.test.ts`
Expected: PASS (all cases, old and new).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/postAuthRoute.ts apps/mobile/lib/postAuthRoute.test.ts
git commit -m "fix(auth): detect auto-linked social users in post-auth routing"
```

---

### Task 7: ensure-channel — paginate the Stream member reconcile and chunk add/remove

`infra/supabase/functions/ensure-channel/index.ts` calls `channel.queryMembers({})` (Stream returns at most 100) and passes unchunked arrays to `addMembers`/`removeMembers` (Stream caps 100 per call). Groups/events with >100 members mis-compute the diff (members beyond #100 are "re-added" every open; stale members beyond #100 are never removed) and a >100 `toAdd` throws.

**Files:**
- Modify: `infra/supabase/functions/ensure-channel/index.ts`

- [ ] **Step 1: Replace the reconcile block**

In the `try` block, replace everything from `const res = await channel.queryMembers({});` through the two `if (toAdd.length)` / `if (toRemove.length)` lines with:

```ts
    // Page through ALL current members (Stream returns max 100 per query).
    const current: string[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = await channel.queryMembers({}, { created_at: 1 }, { limit: 100, offset });
      const ids = page.members.map((m) => m.user_id).filter((x): x is string => !!x);
      current.push(...ids);
      if (page.members.length < 100) break;
    }
    const currentSet = new Set(current);
    const memberSet = new Set(memberIds);
    const toAdd = memberIds.filter((x) => !currentSet.has(x));
    const toRemove = current.filter((x) => !memberSet.has(x));
    // Stream caps member mutations at 100 per call; chunk both directions.
    for (let i = 0; i < toAdd.length; i += 100) await channel.addMembers(toAdd.slice(i, i + 100));
    for (let i = 0; i < toRemove.length; i += 100) await channel.removeMembers(toRemove.slice(i, i + 100));
```

Also note: `channel.create()` passes `members: memberIds` at creation time — Stream likewise caps creation at 100 members. Change the channel construction to create with **no** members and let the reconcile below populate them:

```ts
    const channel = server.channel(kind, id, {
      name,
      created_by_id: user.id,
    });
    await channel.create(); // get-or-create
    await channel.update({ name });
```

- [ ] **Step 2: Verify locally**

```bash
pnpm dlx supabase@latest --workdir infra functions serve ensure-channel
```

Exercise a group chat open from the app (or curl with a valid JWT + `{"kind":"group","id":"<gid>"}`) → expect `{"cid":"group:<gid>"}` and members present in Stream. (A >100-member fixture is impractical locally; the pagination loop degrades to the previous single-query behavior for small channels, which this verifies.)

- [ ] **Step 3: Commit**

```bash
git add infra/supabase/functions/ensure-channel/index.ts
git commit -m "fix(chat): paginate member reconcile + chunk add/remove in ensure-channel"
```

---

### Task 8: send-push — prune dead device tokens from Expo ticket errors

`infra/supabase/functions/send-push/index.ts` only checks the HTTP status of the Expo batch call. Expo reports per-message failures inside the response body (`data[i].status === 'error'`, `details.error === 'DeviceNotRegistered'`). Dead tokens (uninstalled apps) are never pruned, so every future notification keeps paying for them and the delivery log overcounts `sent`.

**Files:**
- Modify: `infra/supabase/functions/send-push/index.ts`

- [ ] **Step 1: Parse tickets and prune dead tokens**

Replace the send loop (`for (let i = 0; i < messages.length; i += 100) { ... }`) with:

```ts
  let sent = 0;
  const deadTokens: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      try { await admin.from('delivery_log').insert({ channel: 'push', notification_id: body.notification_id,
        attempt: 1, status: 'failed', failed_count: messages.length, error: `expo_failed:${res.status}` }); } catch { /* best-effort */ }
      return json({ ok: false, error: `expo_failed:${res.status}` }, 200); // soft-fail
    }
    // Per-ticket outcomes: count real sends, collect DeviceNotRegistered tokens for pruning.
    try {
      const tickets = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      (tickets.data ?? []).forEach((t, idx) => {
        if (t.status === 'ok') sent += 1;
        else if (t.details?.error === 'DeviceNotRegistered') deadTokens.push(chunk[idx].to);
      });
    } catch {
      sent += chunk.length; // unparseable body — assume delivered (previous behavior)
    }
  }
  if (deadTokens.length) {
    try { await admin.from('push_tokens').delete().in('expo_token', deadTokens); } catch { /* best-effort */ }
  }
```

and update the two trailing lines to report the real count:

```ts
  try { await admin.from('delivery_log').insert({ channel: 'push', notification_id: body.notification_id,
    attempt: 1, status: 'sent', sent_count: sent, failed_count: messages.length - sent }); } catch { /* best-effort */ }
  return json({ ok: true, sent });
```

- [ ] **Step 2: Verify locally**

```bash
pnpm dlx supabase@latest --workdir infra functions serve send-push
```

POST with the shared secret header and a notification id whose user has a fake token (`ExponentPushToken[xxxx]`): Expo returns a ticket error → expect the token row to be deleted from `push_tokens` and `delivery_log` to record `sent_count: 0, failed_count: 1`.

- [ ] **Step 3: Commit**

```bash
git add infra/supabase/functions/send-push/index.ts
git commit -m "fix(push): count per-ticket outcomes and prune DeviceNotRegistered tokens"
```

---

### Task 9: Web — add /terms, /privacy, and /help pages

Both apps hard-link to `https://padeljam.app/terms`, `/privacy`, `/help` (mobile settings, sign-in, create-account, welcome; web settings), but `apps/web/src/app/(public)` only contains `page.tsx` and `auth/`. All three URLs 404. Apple's App Store review requires a working privacy-policy URL. Ship simple static pages now; legal copy review is a manual step (M10).

**Files:**
- Create: `apps/web/src/app/(public)/terms/page.tsx`
- Create: `apps/web/src/app/(public)/privacy/page.tsx`
- Create: `apps/web/src/app/(public)/help/page.tsx`

- [ ] **Step 1: Create the three pages**

`apps/web/src/app/(public)/privacy/page.tsx`:

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy Policy — PadelJam' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 prose prose-slate">
      <h1>Privacy Policy</h1>
      <p>Last updated: 4 July 2026</p>
      <h2>What we collect</h2>
      <p>
        Account identifiers (name, email, phone), profile details you provide (playing
        preferences, avatar, location text), content you create (events, groups, posts,
        chat messages), and device push tokens when you enable notifications.
      </p>
      <h2>How we use it</h2>
      <p>
        To run PadelJam: organizing events, matchmaking, community features, chat, and
        notifications. We do not sell personal data.
      </p>
      <h2>Where it lives</h2>
      <p>
        Data is stored with Supabase (database, auth, storage) and Stream (chat).
        Transactional email is delivered via Resend.
      </p>
      <h2>Your rights</h2>
      <p>
        You can edit your profile in the app and delete your account from Settings →
        Delete account, which anonymizes your personal data. For any request, contact{' '}
        <a href="mailto:support@padeljam.app">support@padeljam.app</a>.
      </p>
    </main>
  );
}
```

`apps/web/src/app/(public)/terms/page.tsx`:

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms of Service — PadelJam' };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 prose prose-slate">
      <h1>Terms of Service</h1>
      <p>Last updated: 4 July 2026</p>
      <h2>The service</h2>
      <p>
        PadelJam helps players organize padel communities, groups, and events. You must
        be at least 16 years old and provide accurate account information.
      </p>
      <h2>Your content & conduct</h2>
      <p>
        You are responsible for content you post. Harassment, impersonation, and abuse
        are not tolerated; accounts may be suspended for violations.
      </p>
      <h2>Payments between players</h2>
      <p>
        Entrance fees shown in events are arranged between organizers and players.
        PadelJam does not process these payments and is not a party to them.
      </p>
      <h2>Liability</h2>
      <p>
        The service is provided “as is”. To the maximum extent permitted by law,
        PadelJam is not liable for indirect or consequential damages, including
        injuries at events organized through the app.
      </p>
      <h2>Contact</h2>
      <p>
        Questions? <a href="mailto:support@padeljam.app">support@padeljam.app</a>.
      </p>
    </main>
  );
}
```

`apps/web/src/app/(public)/help/page.tsx`:

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Help — PadelJam' };

export default function HelpPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 prose prose-slate">
      <h1>Help & Support</h1>
      <h2>Getting started</h2>
      <p>
        Sign in with your phone or email, join a community, and jump into events from
        the Explore tab. Organizers can create groups and schedule recurring events.
      </p>
      <h2>Common questions</h2>
      <p>
        <strong>Can’t join an event?</strong> Joining closes 6 hours before start;
        leaving closes 12 hours before.
      </p>
      <p>
        <strong>Not receiving notifications?</strong> Check Settings → Notifications in
        the app and your device notification permissions.
      </p>
      <h2>Contact us</h2>
      <p>
        In-app: Profile → Settings → Contact support. Or email{' '}
        <a href="mailto:support@padeljam.app">support@padeljam.app</a>.
      </p>
    </main>
  );
}
```

Note: if the `prose` classes render unstyled (Tailwind typography plugin not installed), keep the layout classes and drop `prose prose-slate` — plain readable HTML is acceptable here; do **not** add the typography dependency just for this.

- [ ] **Step 2: Verify the routes render**

Run: `pnpm --filter web dev` and open `http://localhost:3000/terms`, `/privacy`, `/help`.
Expected: all three render with content, no 404, no auth redirect (they are in `(public)` and outside the middleware matcher).

- [ ] **Step 3: Verify workspace checks**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(public)/terms" "apps/web/src/app/(public)/privacy" "apps/web/src/app/(public)/help"
git commit -m "feat(web): add /terms, /privacy, /help pages (apps already link to them)"
```

---

### Task 10: Mobile — correct the app display name

`apps/mobile/app.json` has `"name": "mobile"`; the home-screen label of the installed app will be "mobile". The EAS project link is by `slug` (`padel-jam`) and `extra.eas.projectId`, both unchanged, so renaming is safe.

**Files:**
- Modify: `apps/mobile/app.json`

- [ ] **Step 1: Change the name**

In `apps/mobile/app.json`, change:

```json
"name": "mobile",
```

to:

```json
"name": "PadelJam",
```

Leave `slug`, `scheme`, and `extra.eas.projectId` untouched.

- [ ] **Step 2: Verify nothing references the old name**

Run: `grep -rn '"mobile"' apps/mobile/app.json` → only remaining hits should be `"scheme": "mobile"`.
Run: `pnpm --filter mobile typecheck`
Expected: PASS. (The new name takes effect on the next EAS build — Manual actions M6.)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app.json
git commit -m "fix(mobile): app display name PadelJam (was 'mobile')"
```

---

### Task 11: config.toml — raise the auth email rate limit

`infra/supabase/config.toml` sets `[auth.rate_limit] email_sent = 2` (per hour, **project-wide**). Custom SMTP (Resend) is configured, so this limit applies. If this config is pushed to production, the third auth email in any hour (OTP fallback, password reset, email change) fails for the whole user base.

**Files:**
- Modify: `infra/supabase/config.toml`

- [ ] **Step 1: Raise the limit**

In `[auth.rate_limit]`, change:

```toml
# Number of emails that can be sent per hour. Requires auth.email.smtp to be enabled.
email_sent = 2
```

to:

```toml
# Number of auth emails that can be sent per hour, PROJECT-WIDE (not per user).
# 2 was the local-dev sample value and would break production auth email traffic.
email_sent = 200
```

- [ ] **Step 2: Verify the local stack still boots**

Run: `pnpm dlx supabase@latest --workdir infra stop && pnpm dlx supabase@latest --workdir infra start`
Expected: starts cleanly.

- [ ] **Step 3: Commit**

```bash
git add infra/supabase/config.toml
git commit -m "fix(config): raise project-wide auth email rate limit from sample value 2/h"
```

The production dashboard value must also be checked by hand — Manual actions M5.

---

### Task 12: materialize_occurrence — absorb the duplicate-slot race

`materialize_occurrence` (migration 0079) pre-checks for an existing slot then inserts; two concurrent taps can both pass the pre-check, and the loser hits the `events_series_slot_uniq` unique index → the client shows `unknown_error`. Catch the violation and return the winner's row — same idempotent result as the pre-check path.

**Files:**
- Create: `infra/supabase/migrations/0086_materialize_occurrence_race.sql`

- [ ] **Step 1: Write the migration**

Create `infra/supabase/migrations/0086_materialize_occurrence_race.sql` — recreate the function with the insert wrapped in an exception handler. Copy the **entire** body from `0079_materialize_occurrence.sql` (it is the current definition; do not retype it from memory) and change only the insert block:

```sql
  begin
    insert into events (
      group_id, series_id, organizer_id, event_type, specification, scoring_mode, scoring_value,
      venue_id, manual_location_name, manual_location_address, has_location, num_courts,
      starts_at, duration_minutes, allow_standby, standby_spots, is_private,
      entrance_fee_enabled, entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number,
      players_submit_results, organizer_role, name, description, thumbnail_path,
      status, counts_for_ranking, location_point, location_text
    )
    select
      group_id, series_id, organizer_id, event_type, specification, scoring_mode, scoring_value,
      venue_id, manual_location_name, manual_location_address, has_location, num_courts,
      v_target, duration_minutes, allow_standby, standby_spots, is_private,
      entrance_fee_enabled, entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number,
      players_submit_results, organizer_role, name, description, thumbnail_path,
      'scheduled', counts_for_ranking, location_point, location_text
    from events where id = p_after_event_id
    returning id into v_new;
  exception when unique_violation then
    -- Concurrent tap won the race; return its row (idempotent open).
    select id into v_new from events
     where series_id = v_src.series_id and starts_at = v_target and deleted_at is null;
    return v_new;
  end;
```

(Everything before and after the insert — the auth/series checks, `v_target` computation, pre-check, invitation copy, `grant execute` — stays identical to 0079. The invitation copy is intentionally skipped on the race-loser path, matching the pre-check path's behavior.)

- [ ] **Step 2: Run the existing SQL test suite for the function**

```bash
pnpm dlx supabase@latest --workdir infra db reset
psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -v ON_ERROR_STOP=1 -f infra/supabase/tests/materialize_occurrence.sql
```

Expected: passes as before (the race path itself is not exercisable in a single psql session; the goal is no regression).

- [ ] **Step 3: Commit**

```bash
git add infra/supabase/migrations/0086_materialize_occurrence_race.sql
git commit -m "fix(events): absorb duplicate-slot race in materialize_occurrence"
```

---

### Task 13: Final verification pass

- [ ] **Step 1: Full workspace verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all PASS.

- [ ] **Step 2: Full local DB verification**

```bash
pnpm dlx supabase@latest --workdir infra db reset
for f in infra/supabase/tests/*.sql; do
  echo "== $f" && psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -v ON_ERROR_STOP=1 -f "$f" || break
done
```

Expected: every test file completes with `ROLLBACK` and no `PT001` errors.

- [ ] **Step 3: Commit any stragglers and hand off**

Use superpowers:finishing-a-development-branch to merge/PR this branch.

---

## Manual actions — step by step (outside the code)

These cannot be done from the repo: they need your accounts, dashboards, devices, and credentials. Work top to bottom. Steps M1–M4 make the code fixes live; M5–M11 are production-hardening actions found in this review; the items from the earlier handoff doc (`docs/handoff/padeljam-remaining-setup.html`) that are still open are folded in where they belong.

**M1 — Restore Supabase access for tooling (blocker for M2–M4).**
The Supabase MCP/account available to this workspace only shows unrelated projects (SubSnap, TwoDo) — the PadelJam production project (`wispuppglipffcsqowlq`, per `apps/mobile/eas.json`) is not accessible from here.
1. Log in to the Supabase dashboard with the account that owns `wispuppglipffcsqowlq`.
2. If you want Claude to verify prod directly next time, connect that account/org in the Supabase MCP settings.

**M2 — Apply the new migrations to production.**
From the repo root, with the production project linked:
```bash
pnpm dlx supabase@latest --workdir infra link --project-ref wispuppglipffcsqowlq
pnpm dlx supabase@latest --workdir infra migration list     # confirm 0001–0084 are applied, 0085–0086 pending
pnpm dlx supabase@latest --workdir infra db push            # applies 0085 + 0086
```
Verify: `migration list` shows both new migrations applied remotely.

**M3 — Deploy the changed edge functions to production.**
```bash
pnpm dlx supabase@latest --workdir infra functions deploy complete-account
pnpm dlx supabase@latest --workdir infra functions deploy ensure-channel
pnpm dlx supabase@latest --workdir infra functions deploy send-push --no-verify-jwt
```
Verify in the dashboard (Edge Functions → each function → deployments) that the new versions are live.

**M4 — Run the security advisors on production.**
Dashboard → Advisors → Security and Performance (or via MCP `get_advisors` once M1 is done). Fix anything flagged. Known standing item: **`spatial_ref_sys` is writable by `anon`** (PostGIS system table, RLS can't be enabled by us) — open a Supabase support ticket asking them to revoke write on `public.spatial_ref_sys` from `anon`/`authenticated`; only Supabase can change it.

**M5 — Check production auth rate limits.**
Dashboard → Authentication → Rate limits: confirm "Emails sent per hour" is ≥ 200 (Task 11 fixes the repo config, but the dashboard value is authoritative if it was ever set by hand). While there, confirm SMS limits fit your Twilio plan.

**M6 — Rebuild and resubmit the mobile app.**
The display-name fix (Task 10) and the push/registration fixes (Tasks 3–4) ship with the next binary:
```bash
cd apps/mobile
eas build --profile production --platform ios
eas build --profile production --platform android
```
Prereqs still open from the handoff doc: EAS push credentials (`eas credentials` — FCM + APNs), Apple sign-in provider enabled (Apple Developer console + Supabase Auth provider), Google OAuth credentials set. See `docs/superpowers/push-setup.md` and `docs/superpowers/5i-social-signin-setup.md`.

**M7 — Wire push delivery in production (if not yet done).**
Per the handoff doc: set `PUSH_WEBHOOK_SECRET` as a function secret, then in the prod SQL editor:
```sql
ALTER DATABASE postgres SET app.send_push_url = '<send-push function URL>';
ALTER DATABASE postgres SET app.send_push_secret = '<same value as PUSH_WEBHOOK_SECRET>';
```
Verify: trigger a follow → push arrives; `delivery_log` gets a `sent` row; a bogus token row is pruned (Task 8 behavior).

**M8 — Enable crash reporting (Sentry).**
Both apps are DSN-guarded no-ops today, so production crashes are invisible.
1. Create two Sentry projects (react-native, nextjs).
2. Mobile: add `EXPO_PUBLIC_SENTRY_DSN` to the `production` (and `preview`) env blocks in `apps/mobile/eas.json`, commit, rebuild.
3. Web: set `NEXT_PUBLIC_SENTRY_DSN` in the hosting provider's env (Vercel → Project → Settings → Environment Variables) and redeploy.

**M9 — On-device verification pass (release blocker).**
On a physical dev build, verify the fixes from this plan in addition to the handoff checklist:
- Sign out, sign in as a **different** account → no data from the previous account flashes anywhere (Task 2).
- Fresh sign-in (no app restart) → Settings shows notification permission granted and a row appears in `push_tokens` (Task 3).
- Delete a test account → its `push_tokens` and `notifications` rows are gone; a completed event it played still shows "Deleted user" in standings (Task 4).
- Apple/Google sign-in for an auto-linked account routes into onboarding, not "Create your account" (Task 6).
- Open a group chat → members present (Task 7).

**M10 — Review the legal pages and deploy the web app.**
Task 9 ships working `/terms`, `/privacy`, `/help` pages with placeholder-quality copy. Have the text reviewed (especially the privacy policy — it is submitted to App Store review), adjust, and deploy the web app so `https://padeljam.app/terms|privacy|help` resolve. Verify all three URLs from a phone browser.

**M11 — Production auth hardening (from the handoff doc, still open).**
Supabase dashboard → Authentication:
- Set `double_confirm_changes = true` (email changes confirmed on both addresses).
- Confirm production SMTP (Resend) is configured with a verified sender domain and that a password-reset email arrives from your domain.
- Decide on the environment-separation question: dev/preview/production EAS profiles currently share the single Supabase project and Stream app (`apps/mobile/eas.json`). Either accept the risk consciously or create a separate staging project and point the `development`/`preview` profiles at it. Recommended before inviting real users.

**M12 — Decide on full secondary-identifier verification (product decision).**
Task 5 blocks squatting an identifier that already belongs to an existing account, but a brand-new email/phone attached at account completion is still unverified (AU-07 "lazy" design). Decide whether to add an OTP verification round-trip for the secondary identifier in a future slice; until then a user can enter a typo'd or third-party address that has never been used on PadelJam.
