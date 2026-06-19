# Location Geocoding (C5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate event coordinates from a typed/venue address via the on-device `expo-location` geocoder (no API key), so events appear in distance-ranked Explore.

**Architecture:** A pure `geocodeQuery` (which address string to geocode) in `@padel/utils` + a native `geocodeAddress` (`expo-location`) in the app; `Step5Location` geocodes on venue-pick + via a "Find location" button; create/edit do a submit-time geocode fallback. No migration — coords flow through the existing `location_point` path.

**Tech Stack:** `@padel/utils` (vitest), `expo-location`, React Native.

**Spec:** [docs/superpowers/specs/2026-06-19-location-geocoding-design.md](specs/2026-06-19-location-geocoding-design.md)

**Note:** `geocodeAddress` is native I/O (verifies on the dev build). The pure `geocodeQuery` + types + i18n parity are locally verifiable.

---

## Task 1: Geocoding helpers

**Files:** Create `packages/utils/src/geocode-query.ts` + `.test.ts`; Modify `packages/utils/src/index.ts`; Create `apps/mobile/lib/geocode.ts`.

- [ ] **Step 1: Pure `geocodeQuery` — `packages/utils/src/geocode-query.ts`**
```ts
/** Compose the address string to geocode from location fields; null if nothing usable. */
export function geocodeQuery(parts: { name?: string | null; address?: string | null }): string | null {
  const q = [parts.name, parts.address].map((s) => (s ?? '').trim()).filter(Boolean).join(', ');
  return q.length > 0 ? q : null;
}
```

- [ ] **Step 2: Test — `packages/utils/src/geocode-query.test.ts`**
```ts
import { describe, it, expect } from 'vitest';
import { geocodeQuery } from './geocode-query';

describe('geocodeQuery', () => {
  it('joins name and address', () => {
    expect(geocodeQuery({ name: 'Padel Palace', address: '1 Court St' })).toBe('Padel Palace, 1 Court St');
  });
  it('uses name alone when address is missing', () => {
    expect(geocodeQuery({ name: 'Padel Palace' })).toBe('Padel Palace');
  });
  it('trims and skips blanks', () => {
    expect(geocodeQuery({ name: '  ', address: ' 9 Court Ave ' })).toBe('9 Court Ave');
  });
  it('returns null when nothing usable', () => {
    expect(geocodeQuery({})).toBeNull();
    expect(geocodeQuery({ name: '', address: '   ' })).toBeNull();
  });
});
```

- [ ] **Step 3: Export** — append to `packages/utils/src/index.ts`: `export * from './geocode-query';`

- [ ] **Step 4: Native `geocodeAddress` — `apps/mobile/lib/geocode.ts`**
```ts
import * as Location from 'expo-location';

/** Resolve an address string to coordinates via the OS geocoder. Null on no-match / denied / error. */
export async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const [hit] = await Location.geocodeAsync(query);
    return hit ? { lat: hit.latitude, lng: hit.longitude } : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Verify + commit**
`pnpm --filter @padel/utils test && pnpm -w typecheck` → specs pass; 13/13.
```bash
git add packages/utils/src/geocode-query.ts packages/utils/src/geocode-query.test.ts packages/utils/src/index.ts apps/mobile/lib/geocode.ts
git commit -m "feat(events): geocode helpers (pure geocodeQuery + on-device geocodeAddress) (C5)"
```

---

## Task 2: `Step5Location` — geocode on pick + button + i18n

**Files:** Modify `apps/mobile/components/event/wizard/steps/Step5Location.tsx`; Modify `apps/mobile/lib/i18n-mobile.ts`.

- [ ] **Step 1: Imports + state.** Add `import { geocodeQuery } from '@padel/utils';` and `import { geocodeAddress } from '@/lib/geocode';`. Add state near the existing ones:
```tsx
  const [geocoding, setGeocoding] = useState(false);
  const [geoNotFound, setGeoNotFound] = useState(false);
```

- [ ] **Step 2: A shared geocode runner + use it on venue-pick and a button.**
```tsx
  const runGeocode = async (query: string | null) => {
    if (!query || geocoding) return;
    setGeocoding(true);
    setGeoNotFound(false);
    const r = await geocodeAddress(query);
    if (r) patch({ locationLat: r.lat, locationLng: r.lng });
    else setGeoNotFound(true);
    setGeocoding(false);
  };
```
- Update the venue results map to carry `address` and geocode on pick. Change the cast + `pickVenue` call:
```tsx
          results.map((v: { id: string; name: string; address: string | null }) => (
            <Pressable
              key={v.id}
              style={[styles.venueRow, draft.venueId === v.id && styles.venueRowOn]}
              onPress={() => { pickVenue(v.id, v.name); void runGeocode(geocodeQuery({ name: v.name, address: v.address })); }}
              accessibilityRole="button"
            >
              <Text style={styles.venueName}>{v.name}</Text>
            </Pressable>
          ))
```
- Add a "Find location from address" button below the manual address input (before/near the "Use my location" button):
```tsx
      <Pressable
        style={styles.locBtn}
        onPress={() => void runGeocode(geocodeQuery({ name: draft.manualLocationName, address: draft.manualLocationAddress }))}
        disabled={geocoding}
        accessibilityRole="button"
      >
        <Text style={styles.locBtnText}>{geocoding ? t('locating') : t('findLocationCta')}</Text>
      </Pressable>
      {geoNotFound ? <Text style={styles.denied}>{t('locationNotFound')}</Text> : null}
```
(The existing `✓ {locationLat}, {locationLng}` readout already shows the resolved coords. `styles.locBtn`/`locBtnText`/`denied` exist. `t('locating')` exists.)

- [ ] **Step 3: i18n** — add to the `event` namespace in all three locales (after an existing location key like `useMyLocation`):
  - en: `findLocationCta: 'Find location from address'`, `locationNotFound: "Couldn't find that address."`
  - pt-PT: `findLocationCta: 'Localizar pela morada'`, `locationNotFound: 'Não foi possível encontrar essa morada.'`
  - pt-BR: `findLocationCta: 'Localizar pelo endereço'`, `locationNotFound: 'Não foi possível encontrar esse endereço.'`

- [ ] **Step 4: Verify + commit**
`pnpm -w typecheck` (13/13) + `pnpm --filter mobile test` (parity green).
```bash
git add apps/mobile/components/event/wizard/steps/Step5Location.tsx apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(events): geocode venue/manual address in Step5Location (C5)"
```

---

## Task 3: Submit-time geocode fallback (create + edit)

**Files:** Modify `apps/mobile/app/event/create/index.tsx`; Modify `apps/mobile/app/event/[id]/edit.tsx`.

For both: if coords are unset but an address exists, geocode once before building the payload.

- [ ] **Step 1: create/index.tsx `finalize()`** — add imports `import { geocodeQuery } from '@padel/utils';` + `import { geocodeAddress } from '@/lib/geocode';`. Before constructing `const input: CreateEventInput = {...}`, resolve coords:
```tsx
    let { locationLat, locationLng } = draft;
    if (locationLat == null && locationLng == null) {
      const q = geocodeQuery({ name: draft.manualLocationName, address: draft.manualLocationAddress });
      if (q) { const r = await geocodeAddress(q); if (r) { locationLat = r.lat; locationLng = r.lng; } }
    }
```
Then use `locationLat`/`locationLng` (instead of `draft.locationLat`/`draft.locationLng`) in the `input` object.

- [ ] **Step 2: edit.tsx `onSave()`** — same imports; inside the async save, before `updateEventSchema.safeParse({...})`, compute:
```tsx
        let lat = d.locationLat, lng = d.locationLng;
        if (lat == null && lng == null) {
          const q = geocodeQuery({ name: d.manualLocationName, address: d.manualLocationAddress });
          if (q) { const r = await geocodeAddress(q); if (r) { lat = r.lat; lng = r.lng; } }
        }
```
Then pass `locationLat: lat, locationLng: lng` in the `safeParse` payload (instead of `d.locationLat`/`d.locationLng`).

- [ ] **Step 3: Verify + commit**
`pnpm -w typecheck` → 13/13.
```bash
git add apps/mobile/app/event/create/index.tsx apps/mobile/app/event/[id]/edit.tsx
git commit -m "feat(events): submit-time geocode fallback for create/edit (C5)"
```

---

## Verification (end-to-end)

1. **Unit/types/i18n:** `pnpm --filter @padel/utils test` (geocodeQuery); `pnpm -w typecheck` (13/13); `pnpm --filter mobile test` (parity green).
2. **Gated (dev build):** type a manual address → "Find location from address" → ✓ coords (bad address → "Couldn't find that address"); pick a venue → coords resolve; create/edit an event with only a typed address (no button tap) → submit-fallback geocodes it; the event then shows a distance in Explore for a nearby viewer.

## Out of scope

`venues` coordinate column + catalog backfill + proximity venue search; keyed Places autocomplete; map UI.
