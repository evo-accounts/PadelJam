# Push Tap-Routing (B4a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping a push notification deep-links to event/group/community/profile, via a pure tested route helper shared with the in-app inbox.

**Architecture:** A pure `notificationRoute` helper in `@padel/utils` (vitest); the inbox's `targetHref` is refactored to use it; `send-push` adds `actor_id` to its payload; a `usePushTapRouting` hook routes tapped/cold-start notifications when authenticated.

**Tech Stack:** `@padel/utils` (vitest), `expo-notifications`, `expo-router`, Deno edge function.

**Spec:** [docs/superpowers/specs/2026-06-19-push-tap-routing-design.md](specs/2026-06-19-push-tap-routing-design.md)

**Note:** the route helper + wiring are locally verifiable (vitest + typecheck). The actual tap→navigate verifies on the dev build during B5-verify (live push gated). `send-push` is Deno (not in `pnpm typecheck`) — review-verified.

---

## Task 1: Pure `notificationRoute` helper + test (`@padel/utils`)

**Files:** Create `packages/utils/src/notification-route.ts` + `packages/utils/src/notification-route.test.ts`; Modify `packages/utils/src/index.ts`.

- [ ] **Step 1: Write `notification-route.ts`**
```ts
export type NotificationRouteInput = {
  type?: string | null;
  event_id?: string | null;
  group_id?: string | null;
  community_id?: string | null;
  actor_id?: string | null;
};

/** Map a notification (DB row or push data payload) to an in-app route, or null if none applies. */
export function notificationRoute(n: NotificationRouteInput): string | null {
  if (n.event_id) return `/event/${n.event_id}`;
  if (n.group_id) return `/group/${n.group_id}`;
  if (n.community_id) return `/community/${n.community_id}`;
  if (n.type === 'follow' && n.actor_id) return `/profile/${n.actor_id}`;
  return null;
}
```

- [ ] **Step 2: Write `notification-route.test.ts`**
```ts
import { describe, it, expect } from 'vitest';
import { notificationRoute } from './notification-route';

describe('notificationRoute', () => {
  it('routes event/group/community by id', () => {
    expect(notificationRoute({ event_id: 'e1' })).toBe('/event/e1');
    expect(notificationRoute({ group_id: 'g1' })).toBe('/group/g1');
    expect(notificationRoute({ community_id: 'c1' })).toBe('/community/c1');
  });
  it('routes a follow to the actor profile', () => {
    expect(notificationRoute({ type: 'follow', actor_id: 'u1' })).toBe('/profile/u1');
  });
  it('returns null for a follow without an actor', () => {
    expect(notificationRoute({ type: 'follow' })).toBeNull();
  });
  it('prefers event over group over community', () => {
    expect(notificationRoute({ event_id: 'e1', group_id: 'g1', community_id: 'c1' })).toBe('/event/e1');
  });
  it('returns null for an empty / unknown payload', () => {
    expect(notificationRoute({})).toBeNull();
    expect(notificationRoute({ type: 'mystery' })).toBeNull();
  });
});
```

- [ ] **Step 3: Export** — append to `packages/utils/src/index.ts`: `export * from './notification-route';`

- [ ] **Step 4: Verify + commit**
`pnpm --filter @padel/utils test && pnpm -w typecheck` → new specs pass; 13/13.
```bash
git add packages/utils/src/notification-route.ts packages/utils/src/notification-route.test.ts packages/utils/src/index.ts
git commit -m "feat(utils): notificationRoute helper for push/inbox routing (B4a)"
```

---

## Task 2: `send-push` — add `actor_id` to the payload

**Files:** Modify `infra/supabase/functions/send-push/index.ts`.

- [ ] **Step 1:** Add `actor_id` to the notification `select` (line ~38) — change
  `.select('user_id, type, actor_name, entity_name, event_id, group_id, community_id, ref_id')` to include
  `actor_id`:
  `.select('user_id, type, actor_name, entity_name, event_id, group_id, community_id, ref_id, actor_id')`
- [ ] **Step 2:** Add `actor_id` to the `data` payload (line ~55):
  `const data = { type: n.type, event_id: n.event_id, group_id: n.group_id, community_id: n.community_id, ref_id: n.ref_id, actor_id: n.actor_id };`
- [ ] **Step 3:** Self-check the diff (Deno; no local typecheck) — only those two lines change. Commit:
```bash
git add infra/supabase/functions/send-push/index.ts
git commit -m "feat(functions): include actor_id in push data payload for tap-routing (B4a)"
```

---

## Task 3: DRY the inbox to use `notificationRoute`

**Files:** Modify `apps/mobile/app/notifications/index.tsx`.

- [ ] **Step 1:** Add `import { notificationRoute } from '@padel/utils';`. Replace the body of the local
  `targetHref(n)` (lines ~18-23) with `return notificationRoute(n);` (the `NotificationRow` already has
  `type/event_id/group_id/community_id/actor_id`). Keep the `targetHref` call sites unchanged. If `NotificationRow`'s
  field types don't structurally satisfy `NotificationRouteInput`, pass the fields explicitly:
  `return notificationRoute({ type: n.type, event_id: n.event_id, group_id: n.group_id, community_id: n.community_id, actor_id: n.actor_id });`
- [ ] **Step 2: Verify + commit**
`pnpm -w typecheck` → 13/13.
```bash
git add apps/mobile/app/notifications/index.tsx
git commit -m "refactor(mobile): inbox targetHref uses shared notificationRoute (B4a)"
```

---

## Task 4: `usePushTapRouting` hook + mount

**Files:** Create `apps/mobile/lib/usePushTapRouting.ts`; Modify `apps/mobile/app/_layout.tsx`.

- [ ] **Step 1: Write the hook**
```ts
import { useSession } from '@padel/auth';
import { notificationRoute } from '@padel/utils';
import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

/** Deep-link a tapped/cold-start push to its target screen, only when authenticated. */
export function usePushTapRouting(): void {
  const router = useRouter();
  const { session } = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const coldHandled = useRef(false);

  const go = (response: Notifications.NotificationResponse | null) => {
    if (!response || !sessionRef.current) return;
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    if (!data) return;
    const str = (v: unknown) => (typeof v === 'string' ? v : null);
    const route = notificationRoute({
      type: str(data.type),
      event_id: str(data.event_id),
      group_id: str(data.group_id),
      community_id: str(data.community_id),
      actor_id: str(data.actor_id),
    });
    if (route) router.push(route as Href);
  };

  // Live taps (foreground/background).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(go);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cold-start tap — handle once, after the session resolves.
  useEffect(() => {
    if (coldHandled.current || !session) return;
    coldHandled.current = true;
    Notifications.getLastNotificationResponseAsync().then(go).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);
}
```

- [ ] **Step 2: Mount it in `Boot`** — in `apps/mobile/app/_layout.tsx`, add `import { usePushTapRouting } from '@/lib/usePushTapRouting';` and call `usePushTapRouting();` inside the `Boot` component (near `const router = useRouter();` at line ~126). `Boot` is under `SessionProvider`, so `useSession`/`useRouter` are valid.

- [ ] **Step 3: Verify + commit**
`pnpm -w typecheck` → 13/13. (If `router.push(route as Href)` complains about the dynamic string, keep the `as Href` cast — it matches the existing `as Href`/`as never` casts used elsewhere in the app for dynamic routes.)
```bash
git add apps/mobile/lib/usePushTapRouting.ts apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): route tapped/cold-start push notifications (B4a)"
```

---

## Verification (end-to-end)

1. **Unit:** `pnpm --filter @padel/utils test` — `notification-route` specs pass.
2. **Types:** `pnpm -w typecheck` (13/13). i18n parity unaffected.
3. **Gated (dev build + live push, B5-verify):** receive an event-invite / follow push → tap (foreground, background, cold-start) → lands on the right screen; tap while signed out → no nav. `send-push` `actor_id` review-verified.

## Out of scope

Badge counts; Expo receipts polling + retry; rich notification actions; PT/PT-BR (no new copy).
