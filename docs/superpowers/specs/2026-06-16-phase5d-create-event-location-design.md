# Phase 5D — Create-Event Location Completion — Design

*Padel Jam • 2026-06-16 • Brainstormed design / spec*

## Goal

Complete the create-event location step: a **venue search** (name ILIKE) picker and a
**"Use my location"** reverse-geocode capture that writes `events.location_point` (the column added
in 5A) — so newly created events get coordinates and surface with distance in Explore/Home.

## Scope decisions (from the 5D brainstorm)
1. **Coords + venue search now.** Venue search is built even though `venues`/`courts` are unseeded
   (plumbing for later curation). Coords come only via the **manual** "Use my location" path.
2. **Defer:** venue *coordinates* + Places API (venues stay coord-less; search is name-only);
   specific-court picker (no courts seeded); team-pairing at creation (doable later via Manage-Event).
3. Reuse the onboarding `location.tsx` `expo-location` reverse-geocode pattern.

## Verified context
- `create_event(p_payload jsonb)` (`0046_create_event_rpcs.sql`) **already** reads `venue_id`,
  `manual_location_name/address`, `has_location`, `court_ids` — only `location_point` is new.
  `events_venue_xor_manual` CHECK: `venue_id` XOR `manual_location_name` (can't set both).
- `venues`(id, name, address …) + `courts` exist but are empty (0 rows).
- `Step5Location.tsx`: free-text name + address + a "skip" link; the draft (`draft.ts`) has
  `manualLocationName/Address`, `hasLocation`, `numCourts`, `courtIds` — no venue/coords fields.
- The create payload is assembled in `apps/mobile/app/event/create/index.tsx` (passes
  manualLocation*, hasLocation, numCourts, courtIds — but **not** venue_id/coords yet).
- `set_my_location` uses `st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography` (SRID-4326).
- `expo-location` is installed (onboarding uses `requestForegroundPermissionsAsync` +
  `getCurrentPositionAsync` + `reverseGeocodeAsync`).

## Architecture

### Migration `0067_create_event_location.sql`
- `search_venues(p_query text)` → `returns table (id uuid, name text, address text)`:
  `select id, name, manual? ...` — `where name ilike '%'||p_query||'%'` (+ address match), limit 20,
  ordered by name. `language sql stable security definer set search_path = public`; grant to authenticated.
  (Venues are globally readable curated rows; no per-user scoping needed.)
- Extend `create_event` (`create or replace`, full body re-stated): add `location_point` +
  `location_text` to the `events` INSERT, valued from the payload:
  `case when p_payload->>'location_lat' is not null and p_payload->>'location_lng' is not null
     then st_setsrid(st_makepoint((p_payload->>'location_lng')::float8,(p_payload->>'location_lat')::float8),4326)::geography end`
  and `p_payload->>'location_text'`. Re-grant. (Mirror the duplicate_event RPC if it shares the insert.)
- SQL tests (`infra/supabase/tests/create_event_location.sql`): `search_venues` returns an ILIKE match
  (seed a venue in the test); `create_event` with `location_lat/lng` sets a non-null `location_point`
  (assert via `viewer_distance_m` or `st_y/st_x`). `PT001`/`OK create_event_location`.
- Hand-add `search_venues` to `database.types.ts` Functions; `create_event` Args unchanged (jsonb).

### `@padel/api`
- `useSearchVenues(query: string)` in `packages/api/src/events/queries.ts` — `useQuery`,
  `enabled: query.trim().length > 0`, `db.rpc('search_venues', { p_query: query })`. `qk.searchVenues(query)`.
- Extend the create-event payload (wherever the create mutation builds jsonb, or in `index.tsx`):
  include `venue_id: draft.venueId`, `location_lat/lng`, `location_text` when present.

### Wizard
- `draft.ts`: add `venueId?: string; locationLat?: number; locationLng?: number;`. (`locationText`
  reuses `manualLocationName`.)
- `Step5Location.tsx`: two mutually-exclusive paths —
  - **Venue search:** a search `TextInput` → `useSearchVenues` results list (FlashList/rows); selecting
    a row `patch({ venueId: id, manualLocationName: name, manualLocationAddress: undefined, locationLat: undefined, locationLng: undefined, hasLocation: true })` (venue chosen → clear manual coords). Show the empty/`venueResultsEmpty` state.
  - **Manual location:** the existing name/address inputs (kept), **plus a "Use my location" button** →
    `requestForegroundPermissionsAsync` → `getCurrentPositionAsync` → `reverseGeocodeAsync` → `patch({
    manualLocationName: <formatted>, locationLat, locationLng, venueId: undefined, hasLocation: true })`.
    Editing the manual fields clears `venueId`.
  - Step `isValid` stays `() => true` (location optional).
- **i18n** (`event` namespace): `searchVenueLabel`, `searchVenuePlaceholder`, `venueResultsEmpty`,
  `useMyLocation`, `locating`, `locationDenied`, `orEnterManually`.

## Error handling
- Location permission denied / GPS failure → fall back to manual text entry + a `locationDenied`
  notice (mirror onboarding `location.tsx`).
- Venue search error → empty results (no hard error).
- The XOR is enforced client-side (selecting a venue clears manual + coords, and vice-versa); the DB
  CHECK is the backstop.

## Explicitly deferred
- Venue coordinates + Places/Maps API; specific-court picker; team-pairing at creation.

## Conventions followed
Additive migration `0067`; `security definer set search_path = public` + grants; SQL test with
`set_config`/`PT001`/`OK`; hand-edited `database.types.ts`; thin `@padel/api` hook + `qk` key;
`useT('event')`; SRID-4326 geography mirroring `set_my_location`; `expo-location` per onboarding.
