# Phase 5G-1 — Event Deadlines & Countdowns — Design

*Padel Jam • 2026-06-17 • Brainstormed design / spec*

## Goal

Surface the fixed join/leave deadlines on the event detail screen: a live "time left to join"
countdown, a "joining closed" state past the join cutoff, and — past the leave cutoff — a
"Message organizer" affordance in place of the Leave button. Closes **JM-18, JM-19, JM-20, JM-21**.

This is the first slice of Phase 5G (Manage-Event), which is being built sub-slice by sub-slice
(5G-1 … 5G-6). 5G-1 is purely client-side.

## Scope decisions (from the 5G-1 brainstorm)

1. **Organizer contact** past the leave deadline = **Message organizer (1:1 DM)** — opens a Stream
   `messaging` channel with the organizer (no phone/email exposure).
2. **Surfaces = event detail screen only.** EventCard/lists and the manage screen are out of scope.
3. **No backend work.** The 6h join / 12h leave cutoffs are already enforced server-side; this slice
   only makes them visible. The RPCs remain the source of truth (defense-in-depth for boundary races).

## Verified context

- Cutoffs are hardcoded in the roster RPCs ([0047_roster_rpcs.sql:14](../../../infra/supabase/migrations/0047_roster_rpcs.sql#L14),
  [:58](../../../infra/supabase/migrations/0047_roster_rpcs.sql#L58)):
  `join_event` raises `event_closed` when `now() > starts_at − interval '6 hours'`;
  `leave_event` raises `leave_deadline_passed` when `now() > starts_at − interval '12 hours'`.
- The detail screen ([apps/mobile/app/event/[id]/index.tsx](../../../apps/mobile/app/event/[id]/index.tsx))
  currently gates Join/Leave only on `showJoinLeave = status === 'scheduled'` — **no deadline UI**; the
  cutoffs surface only as the generic `{error}` line after a tap. The CTA branches are:
  organizer → manage/start; participant (waiting_list / standby / confirmed) → Leave/leave-waitlist;
  invited → accept/decline; otherwise → join / team-join / waitlist-join. `event.organizer_id`, `me`,
  `myInvite`, and a busy/error `run()` wrapper already exist.
- Direct messages are Stream `messaging` channels created client-side
  ([chat/new.tsx:29](../../../apps/mobile/app/chat/new.tsx#L29)):
  `streamClient.channel('messaging', { members: [uid, otherId] })` → `await channel.watch()` →
  `router.replace('/chat/' + channel.cid)`. `streamClient` is imported from `@/lib/streamClient`.
- `@padel/utils` has vitest + an existing test (`phone.test.ts`); the mobile app has **no** test runner.
  → pure logic lives in `@padel/utils` (TDD), the screen consumes it.
- `useEnsureChannel` only supports `kind: 'group' | 'event'` — it is NOT used for the DM here.

## Architecture

### 1. `@padel/utils` — pure, unit-tested logic

New `packages/utils/src/eventDeadlines.ts`, re-exported from `packages/utils/src/index.ts`:

- `JOIN_CUTOFF_MS = 6 * 60 * 60 * 1000`, `LEAVE_CUTOFF_MS = 12 * 60 * 60 * 1000`.
- `deadlineState(startsAtIso: string, nowMs: number)` → `{ joinCutoffMs, leaveCutoffMs, joinClosed, leaveLocked }`
  where `joinCutoffMs = Date.parse(startsAtIso) − JOIN_CUTOFF_MS`, `joinClosed = nowMs > joinCutoffMs`
  (and likewise for leave). Invalid/unparseable `startsAtIso` → both `*Closed/*Locked` default to `false`
  (fail-open in the UI; the server still enforces).
- `formatCountdown(msRemaining: number)` → adaptive compact string: `> 0` →
  `"2d 4h"` (≥1 day, show d + h), `"5h 12m"` (≥1 h, show h + m), `"43m"` (<1 h), `"<1m"` (<60 s);
  `≤ 0` → `""`. Letters are embedded (English-first app).

`packages/utils/src/eventDeadlines.test.ts` (vitest): boundary cases for `deadlineState`
(just-before / just-after each cutoff, invalid ISO) and `formatCountdown` (days, hours+minutes,
minutes-only, sub-minute, zero/negative).

### 2. Mobile `useCountdown` hook

New `apps/mobile/lib/useCountdown.ts`: `useCountdown(targetMs: number)` returns `msRemaining`
(`targetMs − Date.now()`), recomputed on a **30s** `setInterval` (cleared on unmount). Re-renders keep
the countdown and the derived CTA state live; crossing a cutoff flips the CTA automatically.

### 3. Event detail CTA wiring (`apps/mobile/app/event/[id]/index.tsx`)

Only affects the `status === 'scheduled'` branches. Compute once per render:
```
const { joinCutoffMs, leaveCutoffMs, joinClosed, leaveLocked } =
  deadlineState(event.starts_at, Date.now());
const joinMsLeft  = useCountdown(joinCutoffMs);   // for the "time left to join" line
```

- **Join paths** (no `me`, not organizer): `joinCta` (join / team-join / waitlist-join) and the
  **invited** accept/decline path:
  - `joinClosed` → render a muted **"Joining closed"** notice instead of the action(s) (JM-20). For the
    invited path this replaces accept/decline too (accepting is a new confirmation).
  - else → existing CTA, **with a countdown line `t('joinCountdown', { time: formatCountdown(joinMsLeft) })`
    above it** (JM-21).
- **Confirmed / standby player (Leave path):**
  - `leaveLocked` → replace the Leave button with a **"Message organizer"** button + helper text
    `t('leaveLockedBody')` (JM-19). Keep the role badge.
  - else → existing Leave button + a subtle hint
    `t('leaveByHint', { when: formatWhen(new Date(leaveCutoffMs).toISOString()) })`.
- **Waitlist leave** stays always-available (not a committed spot; `leave_waiting_list` has no deadline).
- **Organizer / `in_progress` / `completed`** branches: unchanged.

**Message-organizer action** (mirrors chat/new.tsx), wrapped in the existing `run()` for busy/error:
```
const onMessageOrganizer = () => run(async () => {
  const channel = streamClient.channel('messaging', { members: [uid!, event.organizer_id] });
  await channel.watch();
  router.push(('/chat/' + channel.cid) as never);
});
```
Add `import { streamClient } from '@/lib/streamClient';`.

### 4. i18n (`event` namespace, `apps/mobile/lib/i18n-mobile.ts`)

Add to all locale blocks present in the `event` namespace (match the existing locale set):
`joinCountdown` ("{{time}} left to join"), `joiningClosed` ("Joining closed"),
`leaveLockedBody` ("Past the drop-out deadline — message the organizer to leave."),
`messageOrganizerCta` ("Message organizer"), `leaveByHint` ("You can leave until {{when}}").

## Error handling

- Boundary race (tap right at a cutoff): the server RPC still raises `event_closed` /
  `leave_deadline_passed`, surfaced by the existing `{error}` line — no change needed.
- Message-organizer failure (Stream): caught by `run()` → existing error line; map to a generic
  `unknown_error`/`startError`-style key.
- `useCountdown` with a past target → `msRemaining ≤ 0` → `formatCountdown` returns `""`; the
  `joinClosed` branch already hides the countdown in that case.

## Testing

- **Unit (vitest):** `@padel/utils/eventDeadlines.test.ts` covers `deadlineState` boundaries +
  `formatCountdown`. Run `pnpm --filter @padel/utils test` and `pnpm -w typecheck`.
- **App smoke (simulator):** with a seeded scheduled event, verify (a) countdown line renders for a
  joinable viewer, (b) past the 6h cutoff the join CTA is replaced by "Joining closed", (c) past the 12h
  cutoff a confirmed player sees "Message organizer" instead of Leave and tapping opens a DM. Time-based
  states are exercised by seeding `starts_at` at the relevant offsets.

## Explicitly out of scope

EventCard/list deadline badges; manage-screen countdowns; any schema/RPC change; editing the cutoff
durations (fixed per JM-18); 5G-2…5G-6.

## Conventions followed

Pure logic in `@padel/utils` with vitest (mirrors `phone.ts`/`phone.test.ts`); mobile hook in
`apps/mobile/lib`; `useT('event')`; reuse the existing `run()` wrapper, `streamClient` DM pattern,
and `formatWhen`; no migration (next reserved number `0070` stays for a later 5G slice).
