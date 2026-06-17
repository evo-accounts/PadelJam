# Push Notifications (Expo Push) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the in-app notifications feed as real device push via Expo Push — store device tokens, register them in-app, and fan out a push on each `notifications` INSERT (gated on `notifications_push`).

**Architecture:** A `push_tokens` table + `register_push_token` RPC; a guarded AFTER-INSERT trigger on `notifications` that `pg_net`-posts to a `send-push` edge function (no-ops locally); the edge function reads the recipient's tokens + setting and calls Expo Push; the app registers a token after login via `expo-notifications`.

**Tech Stack:** Postgres/Supabase (RPC, trigger, pg_net), Supabase Edge Functions (Deno), Expo Push API, expo-notifications/expo-device, React Native.

Spec: `docs/superpowers/specs/2026-06-18-push-notifications-design.md`.

**Scaffold-only:** runtime needs a dev build + physical device + EAS push credentials + the prod fan-out URL/secret. Automated gates here: the SQL test + `pnpm -w typecheck` + api tests. `send-push` (Deno) and the native registration are review-verified; runtime is per `docs/superpowers/push-setup.md`.

---

### Task 1: Migration `0077_push_tokens.sql` + SQL test

**Files:**
- Create: `infra/supabase/migrations/0077_push_tokens.sql`
- Create: `infra/supabase/tests/push_tokens.sql`

- [ ] **Step 1: Write the migration** — use the exact SQL from the spec's "Migration `0077_push_tokens.sql`"
  section (the `push_tokens` table + RLS read/delete-own; `register_push_token(p_expo_token, p_platform)`
  SECURITY DEFINER upsert + grant; the `notify_push()` trigger function + `trg_notify_push` AFTER INSERT on
  `notifications`, guarded to no-op when `current_setting('app.send_push_url', true)` is null/empty). Do NOT
  `create extension pg_net` (it's enabled on Supabase; the plpgsql body defers name resolution, so creation
  is safe even where it's absent, and the local no-op guard means `net.http_post` is never reached).

- [ ] **Step 2: Apply** — `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset` (clean, through `0077`).

- [ ] **Step 3: SQL test**

Create `infra/supabase/tests/push_tokens.sql` (template: `infra/supabase/tests/event_blasts.sql`). Seed two
`auth.users` + `profiles` (U1, U2). Assertions (run as U1 unless noted):
1. `perform register_push_token('ExponentPushToken[aaa]', 'ios');` → exactly 1 row in `push_tokens` for U1.
2. `perform register_push_token('ExponentPushToken[aaa]', 'android');` (same token) → still 1 row, `platform='android'`, `updated_at` refreshed.
3. `perform register_push_token('ExponentPushToken[bbb]', 'ios');` → 2 rows for U1.
4. `register_push_token('x', 'windows')` → raises `invalid_platform` (nested begin/exception + sqlerrm check).
5. RLS: as U2 (jwt), `select count(*) from push_tokens` = 0 (can't read U1's tokens).
6. Trigger no-op when unconfigured: under role `postgres`, `insert into notifications (user_id, type) values (U1, 'follow')` succeeds with NO error (the `app.send_push_url` setting is unset, so `notify_push` returns early without calling `net`).
7. End `raise notice 'OK push_tokens';` then `rollback;`.

- [ ] **Step 4: Run** — `docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/push_tokens.sql` → `OK push_tokens`, no `PT001`/error.

- [ ] **Step 5: Commit**

```bash
git add infra/supabase/migrations/0077_push_tokens.sql infra/supabase/tests/push_tokens.sql
git commit -m "feat(push): push_tokens table + register_push_token + notify_push trigger (push)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `database.types.ts`

**Files:**
- Modify: `packages/db/src/database.types.ts`

- [ ] **Step 1: Hand-add types**

- `push_tokens` Row/Insert/Update in the `Tables` block: `Row { user_id: string; expo_token: string;
  platform: string; updated_at: string }` (Insert: updated_at optional; Update: all optional), Relationship
  `user_id → profiles`.
- Functions: `register_push_token: { Args: { p_expo_token: string; p_platform: string }; Returns: undefined }`.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm -w typecheck` (13/13). Then:
```bash
git add packages/db/src/database.types.ts
git commit -m "feat(db): push_tokens + register_push_token types (push)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `send-push` edge function + config + setup doc

**Files:**
- Create: `infra/supabase/functions/send-push/index.ts`
- Modify: `infra/supabase/config.toml`, `.env.example`
- Create: `docs/superpowers/push-setup.md`

- [ ] **Step 1: Create the edge function**

Create `infra/supabase/functions/send-push/index.ts` (service-role read; shared-secret auth):

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

// Server-side copy for each notification type (mirrors the in-app notification lines).
function render(n: { type: string; actor_name: string | null; entity_name: string | null }): { title: string; body: string } {
  const actor = n.actor_name ?? 'Someone';
  const entity = n.entity_name ?? '';
  switch (n.type) {
    case 'follow': return { title: 'Padel Jam', body: `${actor} followed you` };
    case 'event_invite': return { title: 'Event invite', body: `${actor} invited you to ${entity}` };
    case 'group_invite': return { title: 'Group invite', body: `${actor} invited you to ${entity}` };
    case 'community_invite': return { title: 'Community invite', body: `${actor} invited you to ${entity}` };
    case 'community_request_accepted': return { title: 'Request accepted', body: `Your request to join ${entity} was accepted` };
    case 'follow_joined_event': return { title: 'Padel Jam', body: `${actor} joined ${entity}` };
    default: return { title: 'Padel Jam', body: 'You have a new notification' };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'push_not_configured' }, 500);
  if (req.headers.get('x-push-secret') !== secret) return new Response('Unauthorized', { status: 401 });

  let body: { notification_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON body' }, 400); }
  if (!body.notification_id) return json({ error: 'notification_id required' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  const { data: n, error: nErr } = await admin
    .from('notifications')
    .select('user_id, type, actor_name, entity_name, event_id, group_id, community_id, ref_id')
    .eq('id', body.notification_id)
    .maybeSingle();
  if (nErr || !n) return json({ error: 'notification_not_found' }, 404);

  const { data: settings } = await admin
    .from('user_settings').select('notifications_push').eq('user_id', n.user_id).maybeSingle();
  if (!settings?.notifications_push) return json({ ok: true, skipped: 'push_off' });

  const { data: tokens } = await admin
    .from('push_tokens').select('expo_token').eq('user_id', n.user_id);
  const list = (tokens ?? []) as { expo_token: string }[];
  if (list.length === 0) return json({ ok: true, skipped: 'no_tokens' });

  const { title, body: msg } = render(n);
  const data = { type: n.type, event_id: n.event_id, group_id: n.group_id, community_id: n.community_id, ref_id: n.ref_id };
  const messages = list.map((t) => ({ to: t.expo_token, title, body: msg, data, sound: 'default' }));

  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
    if (!res.ok) return json({ ok: false, error: `expo_failed:${res.status}` }, 200); // soft-fail
  }
  return json({ ok: true, sent: messages.length });
});
```

- [ ] **Step 2: Config secret + env**

In `infra/supabase/config.toml` `[edge_runtime.secrets]` add `PUSH_WEBHOOK_SECRET = "env(PUSH_WEBHOOK_SECRET)"`.
In `.env.example` add `PUSH_WEBHOOK_SECRET=`.

- [ ] **Step 3: Setup doc** — create `docs/superpowers/push-setup.md`: `eas init` to set `extra.eas.projectId`
  in `app.json`; build a dev client (device, not simulator — remote push needs a real device); `eas credentials`
  to upload the FCM server key (Android) + APNs key (iOS); set the function secret `PUSH_WEBHOOK_SECRET` and
  the DB settings `ALTER DATABASE postgres SET app.send_push_url = '<send-push function URL>';` +
  `… SET app.send_push_secret = '<same value as PUSH_WEBHOOK_SECRET>';`; test: grant permission on the device
  → cause a notification (e.g. have someone follow you) → a push arrives.

- [ ] **Step 4: Verify config parses + commit**

`db reset` (config.toml must still parse). Edge fn is Deno (not in `pnpm -w typecheck`); verify by review
(+ `deno check infra/supabase/functions/send-push/index.ts` if deno is installed). Commit:
```bash
git add infra/supabase/functions/send-push infra/supabase/config.toml .env.example docs/superpowers/push-setup.md
git commit -m "feat(push): send-push edge function + config + setup doc (push)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: App registration (deps + lib/push + wiring + sign-out cleanup)

**Files:**
- Modify: `apps/mobile/package.json` (+ `pnpm-lock.yaml`), `apps/mobile/app.json`
- Create: `apps/mobile/lib/push.ts`
- Modify: `apps/mobile/app/_layout.tsx`, `apps/mobile/app/profile/settings.tsx`

- [ ] **Step 1: Add deps + the config plugin**

Run from `apps/mobile`: `npx expo install expo-notifications expo-device` (picks SDK-56-compatible versions).
Add `"expo-notifications"` to the `plugins` array in `apps/mobile/app.json`. (Note: `extra.eas.projectId` is
absent — it's set by `eas init` later; the registration code below guards on its absence so the app still
builds/runs without it.)

- [ ] **Step 2: Create `apps/mobile/lib/push.ts`**

```ts
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Foreground display behaviour.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Register this device's Expo push token with the backend. No-ops off-device / without permission / projectId. */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return; // simulators can't receive remote push
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return; // not EAS-initialised yet

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    await supabase.rpc('register_push_token', { p_expo_token: token, p_platform: platform });
  } catch {
    /* push is best-effort; never block app start */
  }
}

/** Remove this device's token (sign-out / rotation). */
export async function unregisterForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await supabase.from('push_tokens').delete().eq('expo_token', token);
  } catch {
    /* best-effort */
  }
}
```

- [ ] **Step 3: Register after the session is ready**

In `apps/mobile/app/_layout.tsx`, add a small effect that registers once a session exists. Inside the
component that has access to the session (the `SessionProvider` is mounted in this file — add a child that
uses `useSession`), or simplest: in `Boot()` after it resolves a signed-in target, call
`void registerForPush();`. Concretely, import `registerForPush` and, in the `run()` of `Boot()` right before
`router.replace(...)` for an authed target (`(tabs)` or onboarding), add `void registerForPush();`. (It is
idempotent and self-guards, so calling it on each authed boot is fine.)

- [ ] **Step 4: Clean up on sign-out**

In `apps/mobile/app/profile/settings.tsx`, in the sign-out handler, call `await unregisterForPush();` before
`signOut(...)` (import from `@/lib/push`). Wrap so a failure never blocks sign-out.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm -w typecheck` (13/13) — confirms `expo-notifications`/`expo-device`/`expo-constants` resolve and
the `supabase.rpc('register_push_token')` / `.from('push_tokens')` calls typecheck against Task 2's types.
(`expo-constants` is already a dependency; confirm — if absent, `npx expo install expo-constants`.) Then:
```bash
git add apps/mobile/package.json pnpm-lock.yaml apps/mobile/app.json apps/mobile/lib/push.ts "apps/mobile/app/_layout.tsx" apps/mobile/app/profile/settings.tsx
git commit -m "feat(push): expo-notifications registration + sign-out cleanup (push)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verification (whole slice)

1. **DB:** `db reset` clean; `push_tokens.sql` → `OK push_tokens` (incl. invalid-platform, RLS, and the
   trigger-no-op-when-unconfigured cases).
2. **Types/API:** `pnpm -w typecheck` 13/13; `pnpm --filter @padel/api test`.
3. **Review-only here:** `send-push` (Deno) + the native registration — verified by review; runtime is per
   `docs/superpowers/push-setup.md` on a device with EAS credentials + the DB fan-out settings.

## Notes for the implementer

- **`expo-notifications`/`expo-device` are native modules** — adding them changes the native project; the
  app needs a dev rebuild before push works at runtime. Typecheck is the gate here; do not attempt a
  simulator push test (it can't receive remote push).
- The fan-out trigger **must remain a no-op locally** (the `app.send_push_url` guard) so `db reset` and every
  notification-producing action stay green without push infra.
- `send-push` is invoked by the DB trigger with the shared `x-push-secret`, not a user JWT — keep the secret
  check and the service-role reads.
- Migration `0077`; secrets via `config.toml` env-interpolation; never commit `PUSH_WEBHOOK_SECRET`.
- **WhatsApp delivery** remains the deferred third track.
