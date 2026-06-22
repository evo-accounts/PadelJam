# Web W6 — Notifications (+ root→sign-up) — Design

**Slice:** W6 — the final web slice (the W7 marketing landing is dropped). In-app notifications on web: a header
bell + unread badge, the notifications feed, and the incoming partner-requests inbox — reusing `@padel/api`. Plus
a small change: the root `/` now starts at the sign-up page (in place of a landing page).

## Goal

A signed-in player sees an unread badge on a header bell, can open a notifications feed (per-type messages, mark
read / mark-all-read / clear-all, tap-to-route, and Join for invites), and can accept/decline incoming partner
requests — matching the mobile notifications experience. Unauthenticated visitors hitting `/` go straight to the
sign-up/sign-in page.

## A. Root → sign-up (replaces W7)
`apps/web/src/app/(public)/page.tsx` (currently `return <main>Padel Jam — public</main>`) becomes a server
component that calls `redirect('/auth')` from `next/navigation`. Visiting `/` lands on the identifier-first
auth flow (`(public)/auth/page.tsx`). The `/auth` flow already advances an already-signed-in user; the middleware
still guards `/app/**`. No marketing landing is built.

## B. Header bell — `NotificationBell`
Replace the hardcoded shadcn-studio `NotificationDropdown` (`@/components/shadcn-studio/blocks/dropdown-notification`)
in the app layout header (`apps/web/src/app/(app)/app/layout.tsx`, line ~99) with a real
`apps/web/src/components/notifications/NotificationBell.tsx`:
- `useUnreadCount()` → a small count badge overlaid on a `Bell` (lucide) icon trigger (hide when 0 / errored).
- `useNotificationsRealtime()` mounted here (the header is always mounted once authed → the badge + feed update
  live).
- A `DropdownMenu`: header row with **Mark all read** (`useMarkAllRead().mutate()`); the most recent ~8 from
  `useNotifications()` rendered with the shared `NotificationItem` (compact); a footer **See all** `Link` →
  `/app/notifications`. Empty → a friendly line (`empty`). Loading → a small skeleton.

## C. Notifications page — `/app/notifications`
- A pinned **Partner requests** card/row: `usePartnerRequestSummary()` → `t('pendingCount', { count })` (i18next
  plural via `pendingCount_one`/`pendingCount_other`) → links to `/app/notifications/partner-requests`.
- The feed: `useNotifications()` (infinite — flatten `data.pages`, **Load more** when `hasNextPage`) of
  `NotificationItem`s. Header actions: **Mark all read** (`useMarkAllRead`) + **Clear all** (`useClearAll`).
  States: loading → `Skeleton`; error → `loadError`; empty → `empty`.

## Shared `NotificationItem`
`apps/web/src/components/notifications/NotificationItem.tsx` — props `{ n: NotificationRow; onNavigate?: () => void }`
(the optional `onNavigate` lets the bell dropdown close itself after a click).
- **Message**: `t(n.type, { actor: n.actor_name ?? '', entity: n.entity_name ?? '' })` against the `notifications`
  namespace — the notification `type` IS the i18n key (e.g. `event_invite`, `follow`). Unknown type → fall back to
  `t(n.type, { defaultValue: n.entity_name ?? '' })` (never render a raw key as the whole message; acceptable to
  show the entity name).
- **Unread**: a visual treatment (e.g. background tint / dot) when `!n.read_at`.
- **Time**: relative/locale time from `n.created_at`.
- **Click** (the row): `useMarkRead().mutate(n.id)` (only if unread), then if `notificationRoute(n)` is non-null,
  `router.push('/app' + route)` (the util returns `/event/<id>`, `/group/<id>`, `/community/<id>`, `/profile/<id>`
  — prefix with `/app`); call `onNavigate?.()`. Null route → still marks read, no nav.
- **CTA** for `n.type ∈ {event_invite, group_invite, community_invite}`: a **Join** `Button`
  (`useCompleteNotificationCta().mutate(n)`) when `!n.cta_done`, else a muted **Joined** (`joined`) label. The Join
  button stops row-click propagation.

## D. Partner-requests inbox — `/app/notifications/partner-requests`
`useIncomingPartnerRequests()` → rows with `{ requestId/id, kind: 'event' | 'community', requester_name,
requester_avatar, entity_name/event_name }` (confirm the exact field names against the `incoming_partner_requests`
RPC return / the mobile screen). Each row: avatar (`requester_avatar`) + requester name + a label
(`partnerRequestLabel` for `kind==='event'`, `joinRequestLabel` for `kind==='community'`, interpolating the entity)
+ **Accept** / **Decline** `Button`s → `useRespondToRequest().mutate({ kind, requestId, action: 'accept' | 'decline' })`.
States: loading → `Skeleton`; empty → `requestsEmpty`; error → `requestsError`; action failure → `respondError`
inline. A back link to `/app/notifications`.

## i18n
A `notifications` namespace in `lib/i18n-web.ts` (en/pt-PT/pt-BR) + `registerWebNotificationsCopy(instance)` called
in `Providers.tsx` (after `registerWebChatCopy`). Lift values verbatim per-locale from the mobile `notifications`
bundle (`apps/mobile/lib/i18n-mobile.ts`):
- **Chrome:** `title, partnerRequests, pendingCount_one, pendingCount_other, markAllRead, clearAll, seeAll
  ('See all' — web-only, translate), join, joined, empty, loadError, accept, decline, requestsEmpty, requestsError,
  respondError, partnerRequestLabel, joinRequestLabel`.
- **Type sentence templates** (the message keys): `follow, event_invite, group_invite, community_invite,
  community_request_accepted, follow_joined_event, event_cancelled, event_updated` — plus any other `type` keys
  present in the mobile bundle (copy the full set so no notification type renders a raw key).

## Reuse
`@padel/api`: `useNotifications`, `useUnreadCount`, `useNotificationsRealtime`, `useMarkRead`, `useMarkAllRead`,
`useClearAll`, `useCompleteNotificationCta`, `usePartnerRequestSummary`, `useIncomingPartnerRequests`,
`useRespondToRequest`, `NotificationRow` (type). `notificationRoute` (`@padel/utils`). `avatarUrl` (`@/lib/upload`).
shadcn `DropdownMenu`, `Badge`, `Button`, `Card`, `Avatar`, `Skeleton`. lucide `Bell`.

## Error / edge handling
- Bell: no badge when unread is 0 or the query errors; dropdown still opens.
- `NotificationItem` with no route → not navigable but still marks read; unknown type → entity-name fallback.
- CTA / respond failures surface inline (don't crash the list).
- `useNotificationsRealtime` invalidates the unread + notifications queries so the badge and lists stay live.

## Verification
`pnpm --filter web typecheck` + `build`; browser: `/` redirects to `/auth`; the header bell shows an unread badge +
a dropdown preview; **See all** → `/app/notifications` renders the feed with correct per-type text; clicking a
notification marks it read and navigates to the entity (`/app/event/…` etc.); an `event_invite`'s **Join** works;
**Mark all read** clears the badge; **Clear all** empties the feed; the **Partner requests** entry lists incoming
requests and Accept/Decline respond. (Notifications are server-generated — against local Supabase, verify with any
seeded data, otherwise the shell + empty states + the `/`→`/auth` redirect + the live badge wiring.)

## Out of scope
The W7 marketing landing (dropped); push delivery + the device badge (server/ops, Phase 1.4); notification
**settings** toggles (web settings hub, W1); server-side notification generation; in-feed media.
