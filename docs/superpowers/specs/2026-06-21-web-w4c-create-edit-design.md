# Web W4c — Create + Edit event wizard — Design

**Slice:** 3rd of 5 W4 sub-slices (W4a read ✓ → W4b participate ✓ → **W4c create/edit** → W4d manage → W4e match).
A full-parity multi-step **create** wizard + an **edit** form, reusing the `createEventSchema`/`updateEventSchema`
(zod) already in `@padel/api`. Largest W4 slice.

## Goal

A community owner/admin/organizer can create an event on web via a desktop stepper (full mobile-wizard parity,
including recurrence series + invite-at-create), and edit an existing event's mutable fields — all on the existing
backend via `@padel/api`.

## Source-of-truth enums + schema (from `@padel/api`)
- `EVENT_TYPES = ['americano','mexicano','up_and_down']`
- `SPECIFICATIONS = ['classic','mixed','team']`
- `SCORING_MODES = ['points','time','classic']`
- `ORGANIZER_ROLES = ['organizing_only','organizing_and_playing']`
- `ENTRANCE_FEE_METHODS = ['cash','at_club','mba']`
- `seriesSchema = { dayOfWeek 1–7, startTime /^\d{2}:\d{2}$/, durationMinutes >0, inviteLeadDays 3|5|7 }`
- `inviteeSchema = { invitee_id? uuid, name?, email? (email), phone? }`
- `createEventSchema` (the full payload, below) with refines: standalone (`groupId === null`) ⇒ `isPrivate`
  (`standalone_must_be_private`); `entranceFee.enabled` ⇒ amount + method (`fee_requires_amount_and_method`);
  `name` required (`name_required`).
- `useCreateEvent().mutateAsync(input: CreateEventInput)` → returns the new event id (RPC `create_event`).
- `useUpdateEvent(id).mutate({ values: UpdateEventInput, groupId })` (RPC `update_event`).

## Create route: `/app/community/[id]/event-create`
A desktop **stepper** with a single `EventDraft` state (camelCase, mirrors the mobile draft; thumbnail is a
browser `File | null`). `communityId` from the path; optional `?groupId=` preselects the group (group-detail entry).
Steps — mirror the mobile 10, each with the same `isValid` gate (Next disabled until valid):

1. **Group** — `useCommunityGroups(id)` rows (select one → `groupId`) + a "No group (standalone)" option
   (`groupId: null`). `isValid: () => true`. Standalone ⇒ `isPrivate` is forced on (and shown locked) per the
   schema refine.
2. **Type** — `americano / mexicano / up_and_down` (SelectableCard grid). `isValid: !!eventType`.
3. **Specification** — `classic / mixed / team`. `isValid: !!specification`.
4. **Scoring** — `points / time / classic`; when `!== 'classic'`, a positive integer `scoringValue`.
   `isValid: !!scoringMode && (scoringMode==='classic' || (scoringValue!=null && scoringValue>0))`.
5. **Location** — toggle between **venue search** (`useSearchVenues(query)` → select a venue → `venueId` +
   `hasLocation=true`) and **manual** (`manualLocationName` + `manualLocationAddress` → `hasLocation=true`); or
   leave empty (`hasLocation=false`). No client geocoding — `locationLat/Lng` left undefined (schema-optional).
   `isValid: () => true`.
6. **Courts** — `numCourts` counter (min 1). `isValid: numCourts >= 1`.
7. **Schedule** — `startsAt` via `<input type="datetime-local">` (converted to ISO; must be in the future) +
   `durationMinutes`. A **Recurring** `Switch` reveals the series sub-form (`dayOfWeek` select 1–7, `startTime`
   `<input type="time">`, `durationMinutes`, `inviteLeadDays` select 3/5/7) → `draft.series`.
   `isValid: !!startsAt && durationMinutes>0 && new Date(startsAt) > now`.
8. **Preferences** — `allowStandby` (+ `standbySpots` when on), `isPrivate` (`Switch`; locked-on for standalone),
   `entranceFee {enabled, amount, method, mbaNumber}` (enabled ⇒ amount>0 + method; mbaNumber shown when
   method==='mba'), `playersSubmitResults`, `organizerRole` (`organizing_only` / `organizing_and_playing`).
   `isValid: !entranceFee.enabled || (amount!=null && amount>0 && !!method)`.
9. **Details** — `name` (required, ≤80), `description` (≤500), thumbnail (`<input type=file>` → preview).
   `isValid: name.trim().length > 0`.
10. **Invite** — conditional: when the selected group is **public** and not standalone, the RPC auto-invites all
    group members → show a note, no picker. Otherwise a group-member picker (`useGroupMembers(groupId)`,
    selectable) + a manual add form (`name`/`email`/`phone`) → `draft.invitees[]`. `isValid: () => true`.
    (For standalone events there's no group to pick members from → manual-only.)

**Submit (final step):**
1. If `draft.thumbnail`, `uploadCommunityImage(file, <id>, 'event-thumbnails')` → `thumbnailPath` (non-fatal on
   failure — event can be created without). NOTE: the web `uploadCommunityImage` bucket union must be extended to
   include `'event-thumbnails'` (one-line change in `apps/web/src/lib/upload.ts`); the path prefix arg can be the
   user id (matching how the mobile event create scopes uploads).
2. Assemble `CreateEventInput` from the draft (camelCase keys matching `createEventSchema`).
3. `createEventSchema.safeParse(input)` — on failure, map the first issue's `message` (an i18n key such as
   `standalone_must_be_private` / `fee_requires_amount_and_method` / `name_required` / `invalid_time`) to the
   `event` namespace and show inline; do not submit.
4. `await useCreateEvent().mutateAsync(parsed)` → returns the new event uuid → `router.replace('/app/event/'+id)`.
5. Surface RPC error keys (`event_full` is N/A here; relevant: `forbidden`, `group_not_found`,
   `standalone_must_be_private`, `fee_requires_amount_and_method`, `recurring_events`, generic `unknown_error`).

Gate the entire wizard / submit with `useCanCreateEvent(selectedGroupId)` when a group is selected (disable submit
+ show a limit notice when `data === false`); standalone has no group entitlement check (server enforces).

## Edit route: `/app/event/[id]/edit`
Organizer-only (derive from `useEvent(id).organizer_id === uid`; redirect otherwise). A grouped form (NOT the full
stepper) covering the **mobile-edit subset**: Scoring, Location, Courts, Schedule, Preferences, Details — **not**
group/type/specification/invitees/series. Seed local state from `useEvent(id)` (snake→camel). Build
`UpdateEventInput` → `updateEventSchema.safeParse` → `useUpdateEvent(id).mutate({ values, groupId: event.group_id })`
→ on success redirect to `/app/event/[id]`. Thumbnail re-upload via `uploadCommunityImage(..., 'event-thumbnails')`
(non-fatal). Surface mapped errors inline.

## Architecture / isolation
`apps/web/src/components/event/wizard/`:
- `draft.ts` — the web `EventDraft` type, `defaultDraft`, the per-step `isValid` predicates, and a **pure**
  `draftToCreateInput(draft, thumbnailPath?)` builder returning a `CreateEventInput`-shaped object.
- `steps.ts` — the `STEPS` array (`{ key, titleKey, isValid }`) for stepper nav + validation gating.
- `steps/*.tsx` — one component per step (props `{ draft, patch, communityId }`).
- `Stepper.tsx` / `StepIndicator.tsx` — nav + progress; shared bits `SelectableCard`, court counter, scoring panel.
- The create page owns the `draft`/`patch`/`stepIndex` state (a small reducer or `useState`), renders the current
  step + Back/Next/Submit. The edit page reuses the field sub-components (scoring/location/courts/schedule/
  preferences/details) directly in a single form.

**Tests (vitest, in `@padel/utils` or a colocated web test if a web test runner is added — prefer extracting the
pure builder/predicates so they live in a tested module):** `draftToCreateInput` produces a valid
`createEventSchema` parse for a complete draft; standalone-without-private fails the refine; fee-enabled-without-
amount fails. (If no web vitest exists, put `draftToCreateInput` + predicates in `@padel/utils`
`event-wizard.ts` and test there — decide in the plan; keep the pure logic out of the React tree regardless.)

## Entry points
A **New event** button on the community **Events** tab (`/app/community/[id]`, W4a) and on the group detail page
(`/app/group/[id]`), gated by `useCanCreateEvent(groupId)` (community-level entry can route without a preset group;
group entry passes `?groupId=`). Both → `/app/community/[id]/event-create`. Also add an **Edit** link on the event
detail page for the organizer (W4a/W4b detail) → `/app/event/[id]/edit`.

## Reuse
`@padel/api`: `useCreateEvent`, `useUpdateEvent`, `useEvent`, `useCommunityGroups`, `useGroupMembers`,
`useSearchVenues`, `useCanCreateEvent`, `createEventSchema`/`updateEventSchema`, the enum consts + types
(`EventType`, `Specification`, `ScoringMode`, `OrganizerRole`, `EntranceFeeMethod`, `CreateEventInput`,
`UpdateEventInput`). `uploadCommunityImage` (bucket union extended to `'event-thumbnails'`). shadcn
`Input/Textarea/Switch/Select/RadioGroup/Button/Card/Label/Skeleton`. Extend the `event` i18n namespace.

## Error / edge handling
- Per-step Next disabled until `isValid`; the final Submit also runs `safeParse` as the authoritative gate.
- Thumbnail upload failure is non-fatal (create/edit proceeds without the image).
- Standalone (no group) auto-forces `isPrivate` on and locks the toggle.
- Public-group event → invite step shows the auto-invite note (no picker).
- Non-organizer hitting `/edit` → redirect to the event.
- `useCanCreateEvent(groupId) === false` → disable submit + show the limit notice.
- RPC + zod error keys mapped to i18n with an `unknown_error` fallback.

## i18n
Extend the `event` namespace (en/pt-PT/pt-BR) with: step titles (`step1Title`…`step10Title` + subtitles where
used), field labels, enum option labels (type/spec/scoring/fee-method/organizer-role), recurrence labels
(day-of-week, lead-days), invite labels, and the validation/error keys (`name_required`, `invalid_time`,
`standalone_must_be_private`, `fee_requires_amount_and_method`, `recurring_events`, `noGroupOption`, `noGroupHint`,
etc.). Lift values from the mobile `event` bundle (`apps/mobile/lib/i18n-mobile.ts`); `type*Label`/`scoring*Label`/
`fee*Label`/`unknown_error`/`forbidden`/`group_not_found` already exist from W4a/W4b.

## Verification
`pnpm --filter web typecheck` + `build`; vitest for `draftToCreateInput`/predicates. Browser (local Supabase, as a
community owner/admin): create a full one-off event end-to-end (every step gates correctly) → lands on the new
event detail with the right data; create a **standalone** event (private forced); create a **recurring** series;
on a private group event, invite members + a manual email; an over-limit group disables submit; **edit** an
event's schedule/fee/details → reflected on the detail; a non-organizer is redirected from `/edit`.

## Out of scope
Manage hub — roster/payments/blast/activity/cancel/duplicate (W4d); live match (W4e); client-side geocoding
(coords omitted, server/Explore handles proximity later); editing group/type/specification after creation (mobile
parity — those are create-only).
