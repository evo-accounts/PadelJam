# Phase 0B (slice 1) — Onboarding Location Capture — Design

*Padel Jam • 2026-06-14 • Brainstormed design / spec*

## Goal

Replace the stub onboarding **Location** step with real coordinate capture: the user either
shares their current GPS location or types an address, and we resolve and persist
**`profiles.location_point`** (PostGIS `geography(point)`) + **`profiles.location_text`**.
Closes **AU-19**. This is the foundation that later phases (Home suggestions, Explore/Search
distance ranking) build on — they need the *viewer's* coordinates.

This is **slice 1** of roadmap Phase 0B. Per the scope decision, it covers **viewer capture
only**. Explicitly deferred (not here): entity geo columns on `venues`/`groups`/`communities`,
the distance helper RPC, distance ranking wiring, the AU-19 full-screen map + live autocomplete.

Branch `feat/phase0b-geo-capture` (stacked on `feat/discovery-explore`). Next migration: **0054**.

## Scope decisions (made with the user)

1. **Viewer capture only.** No entity geo columns / distance helper this slice (no consumer yet).
2. **Both paths, no map.** "Use current location" (GPS → reverse-geocode) and "Enter address"
   (typed → forward-geocode), both via **`expo-location`** built-ins — no `react-native-maps`,
   no Google/Mapbox key. Manual entry that fails to geocode is saved as text only.
3. **Geography write via RPC.** A small `set_my_location` RPC builds the point in SQL, rather
   than fiddly client-side WKT/GeoJSON in a direct `.update()`.

## Architecture / data flow

```
(onboarding)/location.tsx
  ├─ "Use current location"
  │     expo-location: requestForegroundPermissionsAsync → getCurrentPositionAsync
  │     → reverseGeocodeAsync(coords) → display address; hold {lat, lng, text} in state
  └─ TextInput (manual address)
        on Continue, if no GPS coords: geocodeAsync(text) → {lat, lng} (or null on failure)
  Continue → supabase.rpc('set_my_location', { p_lat, p_lng, p_text }) → router.push('/(onboarding)/hand')
  Skip     → router.push('/(onboarding)/hand')   (no write)
        │
        ▼
  set_my_location(p_lat, p_lng, p_text)  [security definer]
    update profiles
      set location_point = (null when lat/lng null, else st_setsrid(st_makepoint(lng,lat),4326)::geography),
          location_text  = p_text
    where id = auth.uid()
```

The existing onboarding persistence idiom is `supabase.from('profiles').update(...).eq('id', user.id)`
(see `jammer-plus.tsx`); we use the same `@/lib/supabase` client but call `.rpc()` so the
geography point is constructed server-side.

## Components

### Migration `infra/supabase/migrations/0054_set_my_location.sql`
```sql
-- Persist the caller's own location. Geography point is built server-side so the client
-- never has to hand-encode WKT/SRID. Null lat/lng clears the point (manual address that
-- couldn't be geocoded is stored as text only). SECURITY DEFINER but scoped to auth.uid().
create or replace function set_my_location(
  p_lat  double precision,
  p_lng  double precision,
  p_text text
)
returns void
language sql volatile security definer set search_path = public as $$
  update profiles
     set location_point = case
           when p_lat is null or p_lng is null then null
           else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
         end,
         location_text = p_text
   where id = auth.uid();
$$;

grant execute on function set_my_location(double precision, double precision, text) to authenticated;
```
Note arg order in `st_makepoint` is **(lng, lat)** — PostGIS X=longitude, Y=latitude.

### SQL test `infra/supabase/tests/set_my_location.sql`
Established `set local role authenticated` + JWT-claims + `PT001` sentinel pattern. With a
seeded user/profile, acting as that user:
- call `set_my_location(38.7223, -9.1393, 'Lisbon')`; assert `location_text = 'Lisbon'` and
  `round(st_y(location_point::geometry)::numeric,4) = 38.7223` and
  `round(st_x(location_point::geometry)::numeric,4) = -9.1393`.
- call `set_my_location(null, null, 'Just text')`; assert `location_point is null` and
  `location_text = 'Just text'`.
- assert it only writes the caller's row (acting as user B does not change user A's row).

### DB types `packages/db/src/database.types.ts`
Hand-add the `set_my_location` signature under `Functions` (Args `{ p_lat: number; p_lng:
number; p_text: string }`, Returns `undefined`) so `supabase.rpc('set_my_location', …)` is
typed. *(The `supabase gen types` CLI crashes on this machine — AVX — so hand-edit, then
typecheck.)*

### Mobile `apps/mobile/app/(onboarding)/location.tsx` (rewrite)
Keeps the `OnboardingStep` shell (`title`, `body`, `primaryLabel`, `onPrimary`, `onSkip`).
Children: a "Use current location" button and the address `TextInput`. State: `{ text,
coords: {lat,lng} | null, status }`.
- **Use current location:** `requestForegroundPermissionsAsync()`; if granted →
  `getCurrentPositionAsync()` → `reverseGeocodeAsync()`; set `text` to a formatted address and
  `coords` to the GPS lat/lng; if denied → show `locationPermissionDenied` copy (user can type or skip).
- **Continue (`onPrimary`):** if `coords` set → `rpc(coords, text)`; else if `text` non-empty →
  `geocodeAsync(text)` → first result's lat/lng (or null on empty/failure, showing
  `locationGeocodeFailed`) → `rpc(coordsOrNull, text)`; else → no write. Then `router.push('/(onboarding)/hand')`.
- **Skip (`onSkip`):** route on, no write.
- Wrap RPC/geocode calls so a failure never blocks advancing (best-effort capture).

`set_my_location` is called via `supabase.rpc('set_my_location', { p_lat, p_lng, p_text })`
using the `@/lib/supabase` client (same as `jammer-plus.tsx`).

### Native config
- `npx expo install expo-location` (resolves the SDK 56-compatible version).
- Add the **expo-location config plugin** to `app.json` with an iOS
  `NSLocationWhenInUseUsageDescription` string (e.g. "PadelJam uses your location to suggest
  nearby games and communities."). This requires a **new native build** of the dev client.

### i18n `apps/mobile/lib/i18n-mobile.ts`
Extend the existing **localized** `onboarding` namespace (pt-PT / pt-BR / en — all three) with:
- `locationUseCurrent` — "Use current location" / "Usar localização atual" / "Usar localização atual"
- `locationManualPlaceholder` — "Enter your address" / "Introduza a sua morada" / "Digite seu endereço"
- `locationLocating` — "Locating…" / "A localizar…" / "Localizando…"
- `locationPermissionDenied` — "Location permission denied — type your address or skip." /
  "Permissão de localização negada — escreva a morada ou ignore." /
  "Permissão de localização negada — digite o endereço ou pule."
- `locationGeocodeFailed` — "Couldn't find that address; saved as text." /
  "Não foi possível encontrar essa morada; guardada como texto." /
  "Não foi possível encontrar esse endereço; salvo como texto."

## Testing strategy
- **SQL:** `infra/supabase/tests/set_my_location.sql` — the correctness gate (coords persisted,
  null→null, caller-scoped).
- **Type/typecheck:** hand-added RPC type compiles; `pnpm -w typecheck`.
- **Manual smoke:** requires a **native rebuild** (`expo run:ios`) since `expo-location` is a
  native module. Verify: "Use current location" prompts for permission and fills the address;
  Continue persists (check `profiles.location_point/text` in the DB); a typed address geocodes
  and persists; permission-denied still lets you type/skip; Skip writes nothing.

## Explicitly deferred (NOT this slice)
- Entity geo columns (`venues`/`groups`/`communities`) + distance helper RPC + distance ranking.
- AU-19 full-screen map picker + live address autocomplete.
- Onboarding resume-at-step (AU-21) and skip-to-end (AU-18) — separate Phase 5 items.
- Editing location later from Profile (Phase 1).

## Conventions followed
Sequential additive migration `0054_set_my_location.sql`; `security definer set search_path =
public`; `grant execute … to authenticated`; SQL test under `infra/supabase/tests/` with
role/JWT-claims + `PT001`; run local Supabase with `--workdir infra` after exporting
`SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN`; persist via the existing `@/lib/supabase` client;
copy via `useT('onboarding')` across all three locales.

## Open items for the implementation plan
- Confirm `profiles` RLS already permits the user to update their own row (jammer-plus relies
  on it); the RPC is `security definer` regardless, so this only affects whether a direct
  update would also work — not the chosen approach.
- Confirm the exact `reverseGeocodeAsync` result fields to compose the display address
  (e.g. `name`, `street`, `city`, `region`) for a sensible `location_text`.
