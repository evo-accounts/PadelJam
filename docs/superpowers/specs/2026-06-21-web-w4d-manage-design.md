# Web W4d — Event manage hub — Design

**Slice:** 4th of 5 W4 sub-slices (W4a read ✓ → W4b participate ✓ → W4c create/edit ✓ → **W4d manage** → W4e match).
The organizer's management area: roster + payment tracking + add-manual + CSV + blast + activity log + cancel +
duplicate. Wires the W4b "Manage" CTA (currently a disabled "coming soon").

## Goal

An event organizer can manage the roster (confirm / payment / remove / add manual), export & email the roster CSV,
send email blasts (with history + retry), view the activity log, duplicate the event, and cancel it (with recurring
scope) — all on the existing backend via `@padel/api`.

## Access gating
All `/app/event/[id]/manage/**` routes are organizer-only: load `useEvent(id)`; if `event.data.organizer_id !== uid`
→ `router.replace('/app/event/'+id)` (in a `useEffect`) and render null while loading/redirecting. RPCs + RLS
enforce server-side regardless.

## Routes

### `/app/event/[id]/manage` (roster hub)
`useEvent(id)` + `useEventParticipants(id)` + `useEventInvitations(id)` + `useEventRealtime(id)`. Roster grouped into
four sections — **Confirmed** (`status==='confirmed' && !is_standby`), **Waiting list** (`status==='waiting_list'`),
**Standby** (`is_standby`), **Invited** (from `useEventInvitations`). Each participant row: avatar + display name
(`profiles?.full_name ?? guest_name ?? '—'`); a **paid/unpaid** `Badge` when `event.entrance_fee_enabled`; a
`DropdownMenu` of actions:
- **Mark confirmed** (`useMarkConfirmed(id).mutate({ participantId: row.id, targetName })`) — shown for non-confirmed rows.
- **Mark paid / Mark unpaid** (`useMarkPaid(id).mutate({ participantId: row.id, paid: !row.has_paid, targetName })`) — when fee enabled.
- **Remove → to invited** (`mode: 'to_invited'`) / **Remove → from event** (`mode: 'from_event'`) via
  `useRemoveParticipant(id).mutate({ participantId: row.id, mode, targetName })`, behind an `AlertDialog`.
(`targetName` is the display name, for the optimistic/activity label.)
Plus, above/below the sections:
- **Mark all paid** `Button` (`useMarkAllPaid(id).mutate()`), when fee enabled.
- **Add manual participant** form: name `Input` (required) + optional gender `Select` →
  `useAddManualParticipant(id).mutate({ name, gender })`.

A **management actions** `Card` (links + buttons):
- **Edit event** → `/app/event/[id]/edit` (W4c).
- **Send blast** → `/app/event/[id]/manage/blast`.
- **Activity log** → `/app/event/[id]/manage/activity`.
- **Export CSV** — `buildRosterCsv(participants, event)` (`@padel/utils`) → download via a `Blob`
  (`text/csv`) named `rosterCsvFilename(event.name, event.starts_at)`. (`CsvParticipant` = `{ user_id, guest_name,
  status, is_standby, joined_at, confirmed_at, has_paid, paid_at, profiles:{full_name} }`; `CsvEvent` =
  `{ entrance_fee_enabled, entrance_fee_amount }` — pass the participant rows + the event row.)
- **Email CSV** — `useSendRosterCsvEmail(id).mutate()` (success/error toast/inline).
- **Duplicate** — `useDuplicateEvent().mutate({ eventId: id, groupId: event.group_id, overrides: {} })` → returns the
  new event uuid → `router.push('/app/event/'+newId)`.
- **Cancel event** — `useCancelEvent(id).mutate({ scope })` behind an `AlertDialog`: when `event.series_id` is set,
  offer **Cancel only this** (`scope: 'only_this'`) and **Cancel this and upcoming** (`scope: 'this_and_upcoming'`);
  otherwise a single confirm (`scope: 'only_this'`). On success → `router.push('/app/event/'+id)` (or the group/community).

### `/app/event/[id]/manage/blast`
Organizer-gated. Compose + send an event blast — **email only** (WhatsApp descoped per the roadmap →
`channels: ['email']`). Optionally select a **template** (`useBlastTemplates()` → `{ id, title, description,
image_path, category, is_default }`) to prefill title/description. When `useCanCustomizeBlast(id).data === true`, the
title/description are editable; otherwise template-only (fields read-only / a template must be chosen). Blast **image
upload is deferred** (`imagePath: undefined`). **Send** → `useSendBlast(id).mutate({ sourceTemplateId, title,
description, imagePath: undefined, channels: ['email'] })`.
Below the composer: **past blasts** (`useEventBlasts(id)` → `{ id, title, description, channels, sent_to_count,
sent_at, source_template_id, image_path }`), each with its **delivery status** from `useEventBlastDeliveries(id)`
(`{ blast_id, status, attempt, sent_count, failed_count, error }`) mapped to `deliveryDelivered` / `deliveryPending`
/ `deliveryFailed`; a **Retry** action (`useRetryBlast(id).mutate(blastId)`) on failed deliveries. Empty → `blastYourEmpty`.

### `/app/event/[id]/manage/activity`
Organizer-gated. `useEventActivity(id)` → `{ id, action, detail, created_at, profiles:{full_name, avatar_url} }[]`
rendered as avatar + actor name + a localized action label (`t('activity_' + action, { defaultValue: action })`) +
relative time (locale date). Read-only; empty state.

## Components & i18n
Under `apps/web/src/components/event/manage/`: `RosterSection` + `RosterRow` (with the `DropdownMenu` actions),
`AddManualForm`, `BlastComposer`, `BlastHistory`, `ActivityFeed`. Extend the `event` i18n namespace (en/pt-PT/pt-BR)
with the manage/blast/activity keys, lifting values from the mobile `event` bundle (`apps/mobile/lib/i18n-mobile.ts`):
`manageTitle, rosterConfirmedSection, rosterWaitingSection, rosterStandbySection, rosterInvitedSection, noRoster,
markConfirmedCta, markAllPaidCta, paidBadge, unpaidBadge, removeCta, removeToInvitedCta, removeFromEventCta,
removeConfirmTitle, removeConfirmBody, addManualCta, manualNameLabel, manualGenderLabel, duplicateCta, editEventCta,
sendBlastCta, activityLogCta, exportCsvCta, emailCsvCta, csvEmailed, cancelEventCta, cancelStandardTitle,
cancelStandardBody, cancelRecurringTitle, cancelOnlyThisCta, cancelThisAndUpcomingCta, blastTitle, blastTitleLabel,
blastDescLabel, blastSendCta, blastSendToAll, blastSentTitle, blastYourEmpty, blastCustomizeTitle, retryBlastCta,
deliveryDelivered, deliveryPending, deliveryFailed, activityTitle` + the RPC error keys already present
(`forbidden`, etc.) and a generic `unknown_error`. Action-label keys `activity_<action>` use `defaultValue` so a
missing one falls back to the raw action string.

## Reuse
`@padel/api`: `useEvent`, `useEventParticipants`, `useEventInvitations`, `useEventRealtime`, `useMarkConfirmed`,
`useMarkPaid`, `useMarkAllPaid`, `useRemoveParticipant`, `useAddManualParticipant`, `useCancelEvent`,
`useDuplicateEvent`, `useSendRosterCsvEmail`, `useSendBlast`, `useBlastTemplates`, `useCanCustomizeBlast`,
`useEventBlasts`, `useEventBlastDeliveries`, `useRetryBlast`, `useEventActivity`. `buildRosterCsv` /
`rosterCsvFilename` (`@padel/utils`). `avatarUrl` (`@/lib/upload`). shadcn `DropdownMenu`, `AlertDialog`, `Card`,
`Badge`, `Button`, `Input`, `Select`, `Textarea`, `Skeleton`, `Avatar` — verify `dropdown-menu` is present
(W2d used it); if absent, add the shadcn component or use a small inline menu.

## Wire the entry
In W4b's `EventCTA` (`apps/web/src/components/event/EventCTA.tsx`), the organizer branch renders a disabled
**Manage** button + "coming soon" note. Change it to a `Link` `Button` → `/app/event/${event.id}/manage` (drop the
"coming soon" note). (The W4c Edit link on the detail page stays.)

## Error / edge handling
- Non-organizer hitting `/manage/**` → redirect to the event.
- Destructive actions (remove participant, cancel event) behind `AlertDialog`; map known RPC error keys
  (`forbidden`, `not_participant`, `event_closed`, `recurring_events`, …) to i18n with `unknown_error` fallback.
- CSV export is client-built (no network); email-CSV + blast send + retry surface success/error inline.
- `useEventRealtime` keeps the roster live; mutations also invalidate via their `onSuccess`.
- Blast: when `useCanCustomizeBlast` is false, require a template selection before send.

## Verification
`pnpm --filter web typecheck` + `build`; browser (local Supabase, as the organizer): open an event → **Manage** →
roster sections render; mark a player confirmed, toggle paid, mark-all-paid, add a manual participant, remove (to
invited / from event); **Export CSV** downloads a file, **Email CSV** succeeds; **Duplicate** → lands on a new
event; **Cancel** (and, on a recurring event, the only-this vs this-and-upcoming choice); **Send blast** → it
appears in history with a delivery status, retry a failed one; **Activity log** lists actions. A non-organizer is
redirected from `/manage`.

## Out of scope
Live match / team assignment / scoring / start / finish (W4e); blast image upload + WhatsApp channel (descoped);
co-organizer management; editing the roster of a completed event beyond what the RPCs allow.
