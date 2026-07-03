# Web W4b — Event participation — Design

**Slice:** 2nd of 5 W4 sub-slices (W4a read ✓ → **W4b participate** → W4c create/edit → W4d manage → W4e match).
Turns the W4a read-only detail's "coming soon" CTA into the real player-action state machine, and adds the team
partner-request flow.

## Goal

A player can join / leave / waitlist-leave an event, accept/decline an event invitation, and (for team events)
request / accept / decline a partner — all on the existing backend via `@padel/api`, with the same deadline +
capacity gating the mobile app enforces. An organizer can also join/leave as a player.

## Core: adaptive CTA on `/app/event/[id]`

Replace the W4a disabled placeholder CTA block. Add to the existing detail page:
- `useEventInvitations(id)` (pending invitations; rows `{ id, invitee_id, invited_by, status, invitee:{...} }`),
- `useSession().session?.user.id` (uid),
- the participation mutation hooks (below).
(`useEvent`, `useEventParticipants`, `useEventTeams`, `useEventRealtime` already on the page from W4a.)

### Derived participation state (pure helper — see Isolation)
- **`me`** = `participants.find(p => p.user_id === uid) ?? null`.
- **`myInvite`** = `invitations.find(i => i.invitee_id === uid) ?? null`.
- **`isOrganizer`** = `uid != null && uid === event.organizer_id`.
- **Capacity:** `regularCapacity = event.num_courts * 4`; `confirmedRegular` = count of `status==='confirmed' && !is_standby`; `standbyUsed` = count of `is_standby`; `totalCapacity = regularCapacity + (event.allow_standby ? (event.standby_spots ?? 0) : 0)`; `totalIn = confirmedRegular + standbyUsed`.
- **Deadlines:** `deadlineState(event.starts_at, nowMs)` from `@padel/utils` → `{ joinCutoffMs, leaveCutoffMs, joinClosed, leaveLocked }` (join closes 6h before start, leave locks 12h before). `formatCountdown(joinCutoffMs - nowMs)` for the join countdown text.
- **`roleBadge`**: organizer → `organizerBadge`; else `me` → waitlist (`waitlistBadge` w/ `me.waiting_list_position`) / standby (`standbyBadge`) / going (`goingBadge`); else null.

### CTA state machine (mirror `apps/mobile/app/event/[id]/index.tsx`)
The full join/leave CTA only renders when `event.status === 'scheduled'`. For `in_progress` / `completed`, keep a
disabled / "coming soon" affordance (the live/results view is **W4e**).

For `status === 'scheduled'`:
1. **`isOrganizer`** → `organizerBadge` (or `organizerPlayingBadge` if `me != null`). Manage/Start buttons render
   as **disabled "coming soon"** (→ W4d/W4e). Plus organizer-as-player:
   - `me == null && !joinClosed` → **Join as player** (team event → route to partner-requests instead of `join`).
   - `me != null && !leaveLocked` → **Leave as player** + a "leave by {when}" hint.
2. **`me`** (non-organizer):
   - `me.status === 'waiting_list'` → waitlist badge + **Leave waiting list** (`useLeaveWaitingList`).
   - else (`is_standby` or confirmed/going) → badge + **Leave** (`useLeaveEvent`), with a "leave by {when}" hint;
     if `leaveLocked` → show the **leave-locked notice** only (the message-organizer DM is **deferred to W5**).
3. **`myInvite`** (not yet participant) → inviter banner (`invitedBanner` w/ inviter name from
   `participants.find(p => p.user_id === myInvite.invited_by)?.profiles?.full_name`, else `invitedBannerGeneric`)
   + **Decline** (`useDeclineEventInvitation`) / **Accept** (`useAcceptEventInvitation`). If `joinClosed` →
   `joiningClosed` notice.
4. **neither** →
   - `joinClosed` → `joiningClosed` notice.
   - team event (`event.specification === 'team'`) → **Find a partner** → `/app/event/[id]/partner-requests`.
   - else → join countdown (`joinCountdown` w/ formatted text) + **Join** / **Join waiting list** (label =
     `totalIn >= totalCapacity ? waitlist : join`) via `useJoinEvent`.

### Mutations (verify signatures in `packages/api/src/events/mutations.ts`)
- `useJoinEvent().mutate({ eventId: id, groupId: event.group_id })`
- `useLeaveEvent().mutate({ eventId: id, groupId: event.group_id })`
- `useLeaveWaitingList(id).mutate()`
- `useAcceptEventInvitation().mutate({ eventId: id, groupId: event.group_id })`
- `useDeclineEventInvitation(id).mutate()`
Surface RPC error keys inline (`mapPgError` already throws `Error(message)`); map known keys to i18n with an
`unknown_error` fallback.

## Isolation: `apps/web/src/lib/event-participation.ts`
A pure function `participationState(event, participants, invitations, uid, nowMs)` returning
`{ me, myInvite, isOrganizer, regularCapacity, confirmedRegular, standbyUsed, totalCapacity, totalIn, joinClosed, leaveLocked, joinCutoffMs, leaveCutoffMs }`. Keeps the gnarly capacity/deadline math out of the page and
**unit-testable** (vitest). Minimal typed inputs (only the fields used). The `roleBadge` label is derived in the
component (needs `t`), not in the pure helper. A small **`EventCTA`** component (`components/event/EventCTA.tsx`)
takes the event + state + the mutation handlers and renders the right buttons; the page wires the mutations.

## Team partner flow: `/app/event/[id]/partner-requests`
Only meaningful for team events. Page:
- `useEvent(id)` (for `group_id`, access), `usePartnerRequests(id)`, `useEventParticipants(id)`,
  `useGroupMembers(event.group_id)`.
- `usePartnerRequests(id)` rows `{ id, requester_id, target_id, status, requester:{full_name}, ... }`:
  - **incoming** = `r.target_id === uid && r.status === 'pending'` → Accept (`useAcceptPartnerRequest(id).mutate(r.id)`) / Decline (`useDeclinePartnerRequest(id).mutate(r.id)`).
  - **outgoing** = `r.requester_id === uid && r.status === 'pending'` → shown as "pending" (`partnerRequestPending`).
- **candidates** = group members (`useGroupMembers(event.group_id)`) minus: yourself, already-confirmed
  participants, and anyone you've already requested/who's requested you → **Request** (`useRequestPartner(id).mutate([targetId])`).
- Empty states (`noPartnerRequests`). Gate: if no access / not a team event, a friendly notice or redirect to
  the event.
- `choose_partner` direct-pairing is **not** used (mobile uses the request flow); `useChoosePartner` is out of scope.

## Components & i18n
`apps/web/src/components/event/EventCTA.tsx` (+ the partner-requests page under
`apps/web/src/app/(app)/app/event/[id]/partner-requests/page.tsx`). Extend the existing `event` i18n namespace
(en/pt-PT/pt-BR) with the new keys (join/leave/waitlist/accept/decline/badges/countdown/leave-locked/partner-*),
lifting values from the mobile `event` bundle (`apps/mobile/lib/i18n-mobile.ts`). New keys (English; enumerate +
translate in the plan): `joinCta, waitlistCta, leaveCta, leaveWaitlistCta, joinAsPlayerCta, leaveAsPlayerCta,
teamJoinCta, acceptCta, declineCta, goingBadge, standbyBadge, waitlistBadge ({{pos}}), organizerBadge,
organizerPlayingBadge, invitedBanner ({{name}}), invitedBannerGeneric, joiningClosed, joinCountdown ({{time}}),
leaveByHint ({{when}}), leaveLockedBody, manageCta, startCta, viewMatchesCta, viewResultsCta,
partnerRequestsTitle, partnerIncoming ({{name}}), partnerRequestPending, noPartnerRequests, requestPartnerCta,
choosePartnerTitle, partnerRequested, errorTitle` + known RPC error keys + `unknown_error`.

## Error / edge handling
- Each mutation behind a busy flag; disable buttons while pending; surface mapped error keys inline.
- Realtime (`useEventRealtime`) keeps participants/invites fresh after a mutation; mutations also invalidate via
  their `onSuccess`.
- Deadline-gated states render notices, not actions.
- Partner-requests page on a non-team event or for a non-member → notice / redirect to the event.

## Verification
`pnpm --filter web typecheck` + `build`; **vitest** for `participationState` (capacity, waitlist threshold, join/leave
cutoffs, me/invite/organizer detection). Browser (local Supabase): join a scheduled individual event → "Going" +
Leave → leave; fill to capacity → Join shows "Join waiting list" → join → waitlist badge + Leave waiting list;
receive an invitation → Accept (become participant) / Decline; team event → Find a partner → request a candidate,
accept an incoming request; organizer → Join as player / Leave as player; a near-start event shows joining-closed /
leave-locked notices.

## Out of scope
Create/edit wizard (W4c); manage hub (W4d); start event / live scoring / results (W4e); event chat + message-
organizer DM (W5); `choose_partner` direct pairing.
