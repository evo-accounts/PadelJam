# Phase 2 — Notifications — Design

*Padel Jam • 2026-06-15 • Brainstormed design / spec*

## Goal

Build the Notifications system (HN-16..22): a `notifications` table fed by DB triggers, a
real-time feed screen with read-state + an unread bell badge, inline Join CTAs that flip to
"Joined", and a pinned **Partner Requests** entry (count + aggregate screen).

Delivered as **two stacked plans** — build **2A** (feed + producers) first, verify, then
**2B** (Partner Requests aggregate). Each is independently testable.

## Scope decisions (made with the user)

1. **Producers:** all Must + social, **defer "an event you're confirmed in started"** (no natural
   DB trigger fires when a timestamp passes — needs a scheduler; out of scope here).
2. **Fan-out:** **DB triggers** (`SECURITY DEFINER`) — robust regardless of which code path
   (RPC, future web) performs the action.
3. **Bell mount:** **standalone route** this phase — the `/notifications` screen is reachable
   via a temporary entry on the Profile tab; the persistent header bell lands in Phase 3 (Home),
   reusing the same `useUnreadCount` hook + `NotificationBell` component.
4. **Partner Requests:** build the **count RPC + aggregate screen** (fully satisfies HN-16 / §6.1).
5. **Row content:** **denormalized snapshots + i18n templates** — the trigger stores
   `actor_name`/`entity_name` on the row; the client composes the localized sentence from
   `type` + snapshots. Cheap list query, survives source-row deletion, fully translatable.
   (Accepted trade-off: a snapshot name can go stale if later changed — fine for a notification.)

## Verified data model (producers + accept paths exist)

| Notification | Source table (trigger) | Accept RPC for Join CTA |
|---|---|---|
| Invited to event / group-general event | `event_invitations` INSERT (invitee_id set) | `accept_event_invitation` (`useAcceptEventInvitation`) |
| Invited to group | `group_invitations` INSERT | `accept_group_invitation` (`useAcceptGroupInvitation`) |
| Invited to community | `community_invitations` INSERT | `accept_invitation` (`useAcceptInvitation`) |
| Community request accepted | `community_join_requests` UPDATE → `accepted` | — (informational, taps to community) |
| Someone followed you | `follows` INSERT | — (taps to profile) |
| Someone you follow joined an event | `event_participants` INSERT → fan-out to follower set | — (taps to event) |

`blocks` (0055) is consulted in every trigger to suppress notifications between blocked pairs.

---

## Phase 2A — Notifications feed + producers

### DB — `0061_notifications.sql`

```sql
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,   -- recipient
  type        text not null check (type in (
                'event_invite','group_invite','community_invite',
                'community_request_accepted','follow','follow_joined_event')),
  actor_id    uuid references profiles(id) on delete set null,           -- who triggered it
  event_id    uuid references events(id)      on delete cascade,
  group_id    uuid references groups(id)      on delete cascade,
  community_id uuid references communities(id) on delete cascade,
  ref_id      uuid,                                                       -- source invite/request row id (Join CTA)
  actor_name  text,                                                       -- snapshot for rendering
  entity_name text,                                                       -- snapshot for rendering
  read_at     timestamptz,
  cta_done    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notifications_user_created_idx on notifications(user_id, created_at desc);
create index notifications_user_unread_idx  on notifications(user_id) where read_at is null;
```

- **RLS** (own-row only): `select`/`update`/`delete` where `user_id = auth.uid()`; **no insert
  policy for `authenticated`** — rows are written exclusively by the `SECURITY DEFINER` triggers.
  `update` backs mark-read + cta-done; `delete` backs "clear all".
- **6 producer triggers**, each `language plpgsql security definer set search_path = public`,
  `after insert`/`after update` on its source table. Each: resolves recipient(s), skips when
  recipient = actor, skips blocked pairs (either direction), captures `actor_name`/`entity_name`
  snapshots, inserts. Trigger #6 (`event_participants` insert) fans out one row per follower of
  the new participant. Triggers must never raise on bad input — they no-op so the originating
  write always succeeds.
- `alter publication supabase_realtime add table notifications;`
- **`partner_request_summary()`** → `integer`: count of pending `partner_requests` for events the
  caller organizes + pending `community_join_requests` for communities the caller owns.
  `language sql stable security definer set search_path = public`; `grant execute … to authenticated`.
- **SQL tests** (`infra/supabase/tests/notifications.sql`): one OK-notice block per trigger
  (fires / suppressed-on-block / suppressed-on-self), RLS (can read own, cannot read another's),
  and `partner_request_summary` correctness. `PT001` sentinel on failure.

### `packages/db/src/database.types.ts`
Hand-add the `notifications` table row/insert/update types + `partner_request_summary` function
(CLI gen crashes on this CPU — always hand-edit).

### `packages/api/src/notifications/`
- `queries.ts`: `useNotifications` (`useInfiniteQuery`, newest-first, page size 20),
  `useUnreadCount` (head/count where `read_at is null`), `usePartnerRequestSummary` (`db.rpc`).
- `mutations.ts`: `useMarkRead(id)`, `useMarkAllRead()`, `useClearAll()`,
  `useCompleteNotificationCta(notification)` — switches on `type` to call the matching existing
  accept hook/RPC, then sets `cta_done = true`; invalidates the list + unread count.
- `realtime.ts`: `useNotificationsRealtime()` — subscribes to `notifications` inserts/updates for
  the current user, invalidates `qk.notifications` + unread count (mirrors `communities/realtime.ts`).
- Query keys in `query-keys.ts`: `notifications`, `notificationsUnread`, `partnerRequestSummary`.
- Re-export from `packages/api/src/index.ts`.

### Mobile
- **`apps/mobile/app/notifications/index.tsx`** — header ("Notification" title, settings "…"
  top-right). Pinned **Partner Requests** row: `usePartnerRequestSummary` count (e.g. "3 pendings"),
  routes to `/notifications/partner-requests` (built in 2B). Below: a `FlashList` of notifications
  newest-first. On mount, mark currently-unread rows read (HN-22). Each row renders the localized
  sentence (i18n template by `type` + snapshots) + relative time; tapping routes to the entity
  (HN-21). Invitation rows (`*_invite`) show an inline **Join** button → `useCompleteNotificationCta`
  → flips to "Joined" (`cta_done`) (HN-17/18). The "…" modal: **Mark all as read** + **Clear all**
  (HN-22); the pinned Partner Requests row is never affected by either.
- **`apps/mobile/components/NotificationBell.tsx`** — bell icon + red-dot badge driven by
  `useUnreadCount`; `onPress` → `/notifications`. Mounted this phase as a temporary entry on the
  **Profile tab** screen; Phase 3 relocates it to the Home header unchanged.
- Mount `useNotificationsRealtime()` once high in the tree (e.g. the authed layout) so the badge
  + feed stay live app-wide.
- **i18n** — new `notifications` namespace (English-only, like `mobileProfile`): per-`type`
  sentence templates with `{{actor}}` / `{{entity}}` interpolation, `partnerRequests`,
  `pendingCount`, `markAllRead`, `clearAll`, `join`, `joined`, `empty`, screen `title`.

### 2A verification
SQL tests green; `pnpm --filter @padel/api test` + `pnpm -w typecheck`; simulator smoke —
trigger a follow/invite from a second account, see the row arrive in real time, mark read (badge
clears), Join flips to Joined, Clear all empties the list.

---

## Phase 2B — Partner Requests aggregate

### DB — `0062_partner_request_queue.sql`
- **`incoming_partner_requests()`** → table of unified rows:
  `kind text` ('event'|'community'), `request_id uuid`, `entity_id uuid`, `entity_name text`,
  `requester_id uuid`, `requester_name text`, `requester_avatar text`, `created_at timestamptz`.
  Union of pending `partner_requests` for events the caller organizes + pending
  `community_join_requests` for communities the caller owns. `security definer set search_path = public`,
  `grant execute … to authenticated`. SQL tests (`infra/supabase/tests/partner_request_queue.sql`).

### `packages/api/src/notifications/`
- `useIncomingPartnerRequests()` (`db.rpc`) — note the distinct name (the existing
  `usePartnerRequests(eventId)` is per-event; this is the aggregate). Accept/decline reuse the
  existing `useAcceptPartnerRequest` / `useAcceptJoinRequest` hooks.

### Mobile — `apps/mobile/app/notifications/partner-requests.tsx`
Aggregate screen grouped by kind, each row showing the requester (avatar + name) with inline
accept/decline. Community rows surface the target community name ("wants to join Padel do Porto",
§6.1) so multi-community owners know the target. Wire the pinned row's navigation to this screen.

### 2B verification
SQL tests green; typecheck; simulator smoke — pending requests from both sources appear; accept
decrements the pinned count.

---

## Architecture notes

- **One feature, one API module** (`@padel/api/notifications`) spanning both slices; the feed and
  the aggregate screen are separate route files with single responsibilities.
- **Triggers are the only writers** of `notifications`; the client only reads/updates/deletes its
  own rows. This keeps fan-out logic server-side and consistent.
- **Snapshots over joins** keeps the infinite list query single-table and resilient to entity
  deletion; the i18n layer owns all user-facing wording.

## Explicitly deferred / follow-ups
- **"An event you're confirmed in has started"** notification — needs a scheduler (pg_cron /
  edge function on a timer); revisit as its own slice.
- **Persistent header bell** — mounted in Phase 3 (Home header) reusing this phase's bell + hook.
- **Push / WhatsApp / email delivery** — `user_settings` toggles already exist
  (`profile/notifications.tsx`); actual external delivery is a later phase. This phase is in-app only.
- **PT/PT-BR translations** for the `notifications` namespace (English-only for now, like the
  other mobile namespaces).

## Conventions followed
Additive migrations `0061`/`0062`; RPCs `security definer set search_path = public` +
`grant execute … to authenticated`; SQL tests with `set_config` role/jwt + `PT001` sentinel;
hand-edit `database.types.ts`; thin TanStack hooks wrapping `db.rpc`/`db.from`; `qk` query keys;
realtime via `supabase_realtime` publication (mirrors `0049`) + a `realtime.ts` subscription hook
(mirrors `communities/realtime.ts`); i18n via a new `registerMobileCopy` namespace.
