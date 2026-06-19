# Location Geocoding (C5) — Design

*Padel Jam • 2026-06-19 • Brainstormed design / spec*

## Goal

Populate event coordinates correctly so events appear in distance-ranked discovery — using the **on-device
`expo-location` geocoder (no API key)**. Fixes the flaw where a typed manual address never gets geocoded (coords
were only ever set from "use my location" = current GPS), and gives venue-based events real coordinates. Closes
the buildable core of the 5A/5D-deferred "venue/Places coordinates" work.

## Scope decisions (from the brainstorm)

1. **Geocoder = `expo-location` `geocodeAsync`** (on-device, no key/billing/ToS).
2. **No migration** — events already have `location_point` (geography) written from `location_lat`/`location_lng`
   in the create/update payloads, and Explore already ranks by it. We just populate the coords.
3. **Deferred:** storing coordinates on the curated `venues` catalog + proximity *venue* search (needs a coords
   column + catalog backfill); a keyed Places autocomplete picker.

## Verified context

- **`Step5Location`** (`apps/mobile/components/event/wizard/steps/Step5Location.tsx`): `pickVenue` (from the
  `search_venues` catalog → sets `venueId` + `manualLocationName`=venue name, clears coords), `setManualName`/
  `setManualAddress` (no geocode), `useMyLocation` (`Location.reverseGeocodeAsync` of the *current* position →
  `locationLat/Lng` + a `✓` readout). Used by both the create wizard and the edit screen (A2).
- **`search_venues`** returns `{ id, name, address }`. Venues are a curated catalog (no user writes).
- **Payload flow:** `buildCreateEventPayload`/`buildUpdateEventPayload` pass `location_lat`/`location_lng`;
  `create_event` (0067) + `update_event` (0080) write `location_point` from them; Explore's `viewer_distance_m`
  ranks by `location_point`. No backend change needed.
- **`expo-location`** is a dependency; the app already requests foreground location permission (the
  `expo-location` plugin + `useMyLocation`).

## Architecture

### 1. Geocoding helpers — `apps/mobile/lib/geocode.ts`

```ts
import * as Location from 'expo-location';

/** Compose the address string to geocode from the draft's location fields (pure, unit-testable).
 *  Prefers a manual name+address; for a picked venue, the venue name flows in via manualLocationName. */
export function geocodeQuery(parts: { name?: string | null; address?: string | null }): string | null {
  const q = [parts.name, parts.address].map((s) => (s ?? '').trim()).filter(Boolean).join(', ');
  return q.length > 0 ? q : null;
}

/** Resolve an address string to coordinates via the OS geocoder. Returns null on no-match / denied / error. */
export async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const [hit] = await Location.geocodeAsync(query);
    return hit ? { lat: hit.latitude, lng: hit.longitude } : null;
  } catch {
    return null;
  }
}
```

### 2. `Step5Location` wiring

- **On venue pick** (`pickVenue`): after setting `venueId`/`manualLocationName`, geocode the venue's
  `name + address` (`geocodeQuery` → `geocodeAddress`) and, if it resolves, `patch({ locationLat, locationLng })`.
- **Manual entry:** add a "Find location from address" button (near the existing "Use my location") that runs
  `geocodeAddress(geocodeQuery({ name: draft.manualLocationName, address: draft.manualLocationAddress }))` and on
  success patches `locationLat/Lng`; reuse the existing `✓ {lat}, {lng}` readout + a "not found" inline message.
- **`useMyLocation`** stays unchanged (explicit current-position capture). Precedence: explicit coords already in
  the draft win; the geocode button overwrites with the address's coords when used.

### 3. Submit-time fallback (create + edit)

In `create/index.tsx` `finalize()` and `edit.tsx` `onSave()`, before building the payload: if `locationLat/Lng`
are unset **and** there's an address (`geocodeQuery(...)` non-null), attempt one `geocodeAddress` and use the
result if any. So an organizer who typed an address but didn't tap the button still gets coords. Best-effort —
failure just leaves coords null (event still saves; no distance).

### 4. i18n

`event` namespace, **all three locales** (A5 parity): `findLocationCta` ("Find location from address" /
pt-PT "Localizar pela morada" / pt-BR "Localizar pelo endereço"), `locationNotFound` ("Couldn't find that
address." / pt-PT "Não foi possível encontrar essa morada." / pt-BR "Não foi possível encontrar esse endereço.").

## Error handling

- Geocode no-match / permission denied / error → `geocodeAddress` returns `null` → inline "not found" (button
  path) or silent skip (submit fallback). Event creation/edit never blocked by geocoding.
- Permission: `geocodeAsync` may require foreground location permission on iOS; the app already requests it. If
  denied, geocoding returns null gracefully.

## Testing / verification

- **Unit:** `pnpm --filter mobile test` (or `@padel/utils` if the pure helper lands there) — `geocodeQuery`
  specs: name+address joined, name-only, empty → null. (`geocodeAddress` is native I/O — not unit-tested.)
- **Types/i18n:** `pnpm -w typecheck` (13/13); i18n parity green (new `event` keys in all locales).
- **Gated (dev build):** type a manual address → "Find location" → ✓ coords; pick a venue → coords resolve;
  create the event → it shows a distance in Explore for a nearby viewer. Permission-denied / bad address →
  graceful "not found", event still creates.

## Conventions followed

No migration (reuse `location_point` + the existing payload path); `expo-location` (already a dep, no key);
pure `geocodeQuery` unit-tested, native `geocodeAddress` device-verified; reuse `Step5Location` for both create
+ edit; new i18n in all locales (A5 parity). Venue-catalog coords + proximity venue search stay deferred.

## Out of scope

`venues` coordinate column + catalog backfill + proximity venue search; keyed Places autocomplete; map UI.
