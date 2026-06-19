# Push Tap-Routing (B4a) — Design

*Padel Jam • 2026-06-19 • Brainstormed design / spec*

## Goal

Tapping a push notification deep-links to the right screen (event / group / community / profile). The
route-mapping is a pure, unit-tested helper shared with the in-app notifications inbox. The actual tap→navigate
verifies on the dev build (push delivery is gated); the mapping + wiring are verifiable now.

## Scope decision (from the brainstorm)

Tap-routing **only**. Badge counts, Expo receipts polling, and retry-on-failed are deferred to the gated
push-polish pass (need live Expo delivery on a device).

## Verified context

- **Existing mapping to reuse/unify** — `apps/mobile/app/notifications/index.tsx:18-22` `targetHref(n)`:
  `event_id → /event/{id}`, `group_id → /group/{id}`, `community_id → /community/{id}`,
  `type==='follow' && actor_id → /profile/{actor_id}`, else `null`. Routes exist:
  `event/[id]`, `group/[id]`, `community/[id]`, `profile/[id]`.
- **Push payload** — `send-push` (`infra/supabase/functions/send-push/index.ts`) sends
  `data = { type, event_id, group_id, community_id, ref_id }` — note it currently omits `actor_id`, so a tapped
  `follow` push couldn't reach the follower's profile.
- **Mobile push setup** — `apps/mobile/lib/push.ts` registers the token + sets the foreground notification
  handler. **No** `addNotificationResponseReceivedListener` / tap handler exists today. Root providers
  (`SessionProvider`, nav) are wired in `apps/mobile/app/_layout.tsx`.
- **Session** — `useSession()` (`@padel/auth`) exposes the current session; `expo-router` `useRouter()` for nav.

## Architecture

### 1. Pure helper — `@padel/utils`

`notification-route.ts`:
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
Exported from the package index. **vitest** covers: each id type, follow→profile, follow without actor_id →
null, empty → null, and id-precedence (event before group before community).

### 2. DRY the inbox

`notifications/index.tsx`: replace the local `targetHref` body with `return notificationRoute(n);` (the
`NotificationRow` already has `type/event_id/group_id/community_id/actor_id`). Same behavior, now shared.

### 3. `send-push` payload

Add `actor_id: n.actor_id` to the `data` object (the function already selects `actor_id`-adjacent fields;
confirm `actor_id` is in the notification select, add it if missing). So a tapped `follow` push routes to
`/profile/{actor_id}`, matching the inbox.

### 4. Mobile tap-router

`apps/mobile/lib/usePushTapRouting.ts` — a hook:
```ts
// - const router = useRouter(); const { session } = useSession();
// - on mount: const last = await Notifications.getLastNotificationResponseAsync(); handle(last);  // cold start
// - subscribe: Notifications.addNotificationResponseReceivedListener(handle);  // foreground/background tap
// - handle(response): const data = response?.notification.request.content.data;
//     const route = notificationRoute({ type: data?.type, event_id: data?.event_id, ... , actor_id: data?.actor_id });
//     if (route && session) router.push(route as never);   // only deep-link when authenticated
// - cleanup: subscription.remove()
```
Mount it once near the root — call `usePushTapRouting()` inside the authenticated layout (e.g. the component
in `app/_layout.tsx` that already sits under `SessionProvider`), so `useSession`/`useRouter` are valid and a
tap into a signed-out app is a no-op (route only when `session`). Guard against routing before the navigator is
mounted (the cold-start handler can defer to the first effect tick).

## Error handling

- Unknown/empty payload → `notificationRoute` returns `null` → no navigation (stay where you are).
- Tap while signed out → ignored (no `session`); the normal auth gate applies.
- Cold-start before nav ready → handle in a `useEffect` (runs after mount), so `router.push` is safe.

## Testing / verification

- **Unit:** `pnpm --filter @padel/utils test` — `notification-route` specs pass.
- **Types:** `pnpm -w typecheck` (13/13). i18n parity unaffected (no new copy).
- **Gated (dev build + live push):** during B5-verify — receive a push (e.g. an event invite / follow), tap it
  (foreground, background, cold-start) → lands on the event/group/community/profile screen; tapping while
  signed out does nothing. The `send-push` `actor_id` addition is review-verified (Deno).

## Conventions followed

Pure logic in `@padel/utils` + vitest (mirroring `recurrence`/`chat-media`); DRY the existing inbox mapping;
thin hook wiring around `expo-notifications` + `expo-router`; session-gated navigation; no new migration, no new
i18n. Badge/receipts/retry stay deferred.

## Out of scope

Badge counts; Expo receipts polling + retry-on-failed; rich notification content/actions; PT/PT-BR (no new
copy here).
