# Venue-Name Display on Event Detail — Design

*Padel Jam • 2026-06-19 • Brainstormed design / spec (small fix)*

## Goal

The event detail screen shows the real **venue name + address** for venue-based events instead of falling
through to "location TBD". Pre-existing gap surfaced during A2 (venue editing made venue events more reachable).

## Root cause (verified)

- `useEvent` ([packages/api/src/events/queries.ts](../../../packages/api/src/events/queries.ts)) does
  `select('*')` from `events` — it returns `venue_id`/`location_text` but **never joins `venues`**.
- The detail "Where" section
  ([apps/mobile/app/event/[id]/index.tsx](../../../apps/mobile/app/event/[id]/index.tsx), ~L579-592) renders
  only `has_location && manual_location_name`. For a venue event `manual_location_name` is `null` (the
  `events_venue_xor_manual` CHECK), so it falls through to `locationTbd`.
- `venues` ([0039_events_catalog.sql](../../../infra/supabase/migrations/0039_events_catalog.sql)) is
  **public-read** (`venues: read` policy + `grant select … to authenticated`), so a PostgREST embed works.
- Only the detail screen renders event location (event cards + manage screen do not), so the blast radius is
  contained.

## Architecture

### 1. `useEvent` embeds the venue

Change the select to embed the related venue:
```ts
.select('*, venue:venues(name, address)')
```
PostgREST resolves the `events.venue_id → venues` FK, giving `event.venue = { name: string; address: string |
null } | null` (null when `venue_id` is null). If the hand-edited generated types don't infer the embed
cleanly, type the hook's return explicitly (an `EventWithVenue = Events['Row'] & { venue: { name: string;
address: string | null } | null }` alias, or a narrow cast on the returned `data`). Keep `.maybeSingle()`.

### 2. Detail screen "Where" section

Replace the conditional with a three-way (venue → manual → TBD):
```tsx
{event.venue ? (
  <>
    <Text style={styles.body}>{event.venue.name}</Text>
    {event.venue.address ? <Text style={styles.bodyMuted}>{event.venue.address}</Text> : null}
  </>
) : event.has_location && event.manual_location_name ? (
  <>
    <Text style={styles.body}>{event.manual_location_name}</Text>
    {event.manual_location_address ? <Text style={styles.bodyMuted}>{event.manual_location_address}</Text> : null}
  </>
) : (
  <Text style={styles.body}>{t('locationTbd')}</Text>
)}
```
No new i18n (reuses `whereTitle` / `locationTbd`). Existing manual-location and no-location behavior unchanged.

## Error handling

- A deleted/missing venue: the `venues: read` policy filters `deleted_at is null`, so the embed returns `null`
  for a soft-deleted venue → the screen falls back to the manual branch, then `locationTbd`. Acceptable.

## Testing / verification

- `pnpm -w typecheck` (13/13) — the embed select + any type alias must compile; `pnpm --filter @padel/api test`.
- **Simulator smoke:** a venue-based event shows the venue's name (+ address); a manual-location event is
  unchanged; a no-location event still shows "TBD".
- The `venues` join is review-verified (PostgREST embed over a public-read table) and exercised at runtime.

## Out of scope

Showing location on event cards / the manage screen (they don't render it today); backfilling `location_text`;
maps/coordinates display.

## Conventions followed

No migration; minimal query + render change; reuse existing i18n; `useEvent`'s `qk`/`maybeSingle` pattern kept.
