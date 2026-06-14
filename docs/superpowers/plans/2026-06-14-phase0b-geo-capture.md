# Phase 0B (slice 1) — Onboarding Location Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stub onboarding Location step with real coordinate capture (GPS or typed address, both geocoded via `expo-location`) persisted to the viewer's `profiles.location_point` + `location_text` through a `set_my_location` RPC.

**Architecture:** A `set_my_location(p_lat, p_lng, p_text)` `SECURITY DEFINER` RPC builds the PostGIS point server-side and updates `auth.uid()`'s own profile row. The mobile location step uses `expo-location` built-ins (`requestForegroundPermissionsAsync`/`getCurrentPositionAsync`/`reverseGeocodeAsync` for GPS; `geocodeAsync` for typed address) and calls the RPC via the existing `@/lib/supabase` client.

**Tech Stack:** Supabase Postgres + PostGIS (`sql security definer` RPC), `expo-location`, Expo SDK 56 + Expo Router, local Supabase via `pnpm dlx supabase@latest --workdir infra`.

**Spec:** `docs/superpowers/specs/2026-06-14-phase0b-geo-capture-design.md`. **Branch:** `feat/phase0b-geo-capture` (stacked on `feat/discovery-explore`). **Next migration:** `0054`.

## Resolved facts
- `profiles` already has `location_text text` and `location_point geography(point)` (migration `0003`); PostGIS enabled (`0001`). Columns are nullable.
- PostGIS point order is **(longitude, latitude)**: `st_setsrid(st_makepoint(lng, lat), 4326)`.
- Existing onboarding persistence idiom: `supabase.from('profiles').update(...).eq('id', user.id)` via `@/lib/supabase` (`jammer-plus.tsx`). We use `supabase.rpc(...)` instead for the geography write.
- `OnboardingStep` props: `{ title, body, primaryLabel, onPrimary, onSkip, primaryDisabled?, children? }` (renders Skip + title/body + children + primary button).
- `app.json` `expo.plugins` is an array; `expo.ios` exists with `bundleIdentifier`.
- The `supabase gen types` CLI crashes on this machine (AVX) — DB types are hand-edited.

## File Structure
```
infra/supabase/migrations/0054_set_my_location.sql   set_my_location RPC + grant
infra/supabase/tests/set_my_location.sql             coords/null/caller-scope test
packages/db/src/database.types.ts                    (modify: + set_my_location signature)
apps/mobile/package.json                             (modify: + expo-location, via expo install)
apps/mobile/app.json                                 (modify: + expo-location plugin)
apps/mobile/lib/i18n-mobile.ts                       (modify: + 5 onboarding keys × 3 locales)
apps/mobile/app/(onboarding)/location.tsx            (rewrite: GPS + manual capture)
```

---

## Task 1: `set_my_location` RPC + SQL test

**Files:** Create `infra/supabase/migrations/0054_set_my_location.sql`; Test `infra/supabase/tests/set_my_location.sql`.

- [ ] **Step 1: Write the migration** `infra/supabase/migrations/0054_set_my_location.sql`:
```sql
-- Persist the caller's own location. The geography point is built server-side so the client
-- never hand-encodes WKT/SRID. Null lat/lng clears the point (a manual address that couldn't
-- be geocoded is stored as text only). SECURITY DEFINER, but scoped to auth.uid()'s own row.
-- PostGIS point order is (longitude, latitude).
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

- [ ] **Step 2: Write the failing test** `infra/supabase/tests/set_my_location.sql` (mirrors the fixture style of `infra/supabase/tests/my_events.sql`):
```sql
-- set_my_location: persists coords+text for the caller; null coords clear the point;
-- only the caller's own row is written.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e5000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','loc1@x.com'),
  ('e5000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','loc2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e5000001-0000-0000-0000-000000000001','loc1@x.com','+351900600001','LocViewer'),
  ('e5000002-0000-0000-0000-000000000002','loc2@x.com','+351900600002','LocOther') on conflict do nothing;

do $$
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e5000001-0000-0000-0000-000000000001","role":"authenticated"}',true);

  -- coords + text persist (Lisbon ~ 38.7223, -9.1393).
  perform set_my_location(38.7223, -9.1393, 'Lisbon');
  if not exists (
    select 1 from profiles
    where id = 'e5000001-0000-0000-0000-000000000001'
      and location_text = 'Lisbon'
      and round(st_y(location_point::geometry)::numeric, 4) = 38.7223
      and round(st_x(location_point::geometry)::numeric, 4) = -9.1393
  ) then raise exception using errcode='PT001', message='coords/text not persisted'; end if;

  -- null coords clear the point but keep text.
  perform set_my_location(null, null, 'Just text');
  if not exists (
    select 1 from profiles
    where id = 'e5000001-0000-0000-0000-000000000001'
      and location_text = 'Just text' and location_point is null
  ) then raise exception using errcode='PT001', message='null coords did not clear point/set text'; end if;

  -- caller-scoped: user A's call must not touch user B.
  if exists (
    select 1 from profiles
    where id = 'e5000002-0000-0000-0000-000000000002'
      and (location_point is not null or location_text is not null)
  ) then raise exception using errcode='PT001', message='wrote another user''s row'; end if;

  raise notice 'OK set_my_location';
end $$;
rollback;
```

- [ ] **Step 3: Verify FAIL first.** Create only the test file, then:
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/set_my_location.sql
```
Expected: error `function set_my_location(...) does not exist`. (Containers already running.)

- [ ] **Step 4: Create the migration, re-reset, verify PASS:**
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/set_my_location.sql
```
Expected: `NOTICE:  OK set_my_location`, no errors.

- [ ] **Step 5: Commit:**
```bash
git add infra/supabase/migrations/0054_set_my_location.sql infra/supabase/tests/set_my_location.sql
git commit -m "feat(geo): set_my_location RPC + SQL test"
```

---

## Task 2: DB types — hand-add `set_my_location`

**Files:** Modify `packages/db/src/database.types.ts`.

- [ ] **Step 1: Add the function signature.** In the `Functions` block (e.g. right after the `my_events` entry), add:
```ts
      set_my_location: {
        Args: { p_lat: number | null; p_lng: number | null; p_text: string | null }
        Returns: undefined
      }
```
(Args are nullable because the screen passes `null` for un-geocoded manual entries / empty text. The CLI is broken on this machine — hand-edit, do not run `gen types`.)

- [ ] **Step 2: Verify typecheck:**
```bash
pnpm --filter @padel/db typecheck && grep -n "set_my_location" packages/db/src/database.types.ts
```
Expected: clean typecheck; the function name appears.

- [ ] **Step 3: Commit:**
```bash
git add packages/db/src/database.types.ts
git commit -m "chore(db): add set_my_location RPC type (hand-added)"
```

---

## Task 3: Install `expo-location` + config plugin

**Files:** Modify `apps/mobile/package.json` (via expo install); Modify `apps/mobile/app.json`.

- [ ] **Step 1: Install the SDK-matched version:**
```bash
cd apps/mobile && npx expo install expo-location
```
Expected: `expo-location` added to `apps/mobile/package.json` dependencies at an SDK 56-compatible version. (If the sandbox blocks network, report BLOCKED — the controller will install.)

- [ ] **Step 2: Add the config plugin to `apps/mobile/app.json`.** In `expo.plugins` (currently ends with `"expo-sharing"`), add an entry:
```json
[
  "expo-location",
  {
    "locationWhenInUsePermission": "PadelJam uses your location to suggest nearby games and communities."
  }
]
```
Keep valid JSON (comma after the previous `"expo-sharing"` element).

- [ ] **Step 3: Verify the manifest parses + typecheck:**
```bash
cd /Users/joaopaulos4/Cursor/PadelJam && node -e "JSON.parse(require('fs').readFileSync('apps/mobile/app.json','utf8')); console.log('app.json OK')" && pnpm --filter mobile typecheck
```
Expected: `app.json OK`; typecheck clean.

- [ ] **Step 4: Commit:**
```bash
git add apps/mobile/package.json apps/mobile/app.json pnpm-lock.yaml
git commit -m "build(mobile): add expo-location + permission config plugin"
```

---

## Task 4: i18n — onboarding location keys (3 locales)

**Files:** Modify `apps/mobile/lib/i18n-mobile.ts`.

- [ ] **Step 1: Add 5 keys to each locale of `mobileOnboarding`.** The object has `'pt-PT'`, `'pt-BR'`, and `en` blocks (each currently ending after `sideRight`). Add these keys to the respective blocks:

`'pt-PT'`:
```ts
    locationUseCurrent: 'Usar localização atual',
    locationManualPlaceholder: 'Introduza a sua morada',
    locationLocating: 'A localizar…',
    locationPermissionDenied: 'Permissão de localização negada — escreva a morada ou ignore.',
    locationGeocodeFailed: 'Não foi possível encontrar essa morada; guardada como texto.',
```
`'pt-BR'`:
```ts
    locationUseCurrent: 'Usar localização atual',
    locationManualPlaceholder: 'Digite seu endereço',
    locationLocating: 'Localizando…',
    locationPermissionDenied: 'Permissão de localização negada — digite o endereço ou pule.',
    locationGeocodeFailed: 'Não foi possível encontrar esse endereço; salvo como texto.',
```
`en`:
```ts
    locationUseCurrent: 'Use current location',
    locationManualPlaceholder: 'Enter your address',
    locationLocating: 'Locating…',
    locationPermissionDenied: 'Location permission denied — type your address or skip.',
    locationGeocodeFailed: "Couldn't find that address; saved as text.",
```

- [ ] **Step 2: Typecheck:** `pnpm --filter mobile typecheck` — expect clean.

- [ ] **Step 3: Commit:**
```bash
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): onboarding location capture i18n keys"
```

---

## Task 5: Rewrite the onboarding Location step

**Files:** Modify (overwrite) `apps/mobile/app/(onboarding)/location.tsx`.

- [ ] **Step 1: Overwrite the screen:**
```tsx
import { useT } from '@padel/i18n';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { OnboardingStep } from '@/components/OnboardingStep';
import { supabase } from '@/lib/supabase';

type Coords = { lat: number; lng: number };

export default function LocationStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const [text, setText] = useState('');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const goNext = () => router.push('/(onboarding)/hand');

  const formatAddress = (p: Location.LocationGeocodedAddress | undefined): string => {
    if (!p) return '';
    return [p.name, p.city ?? p.subregion, p.region].filter(Boolean).join(', ');
  };

  const useCurrentLocation = async () => {
    if (locating) return;
    setNotice(null);
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setNotice(t('locationPermissionDenied'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const next: Coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCoords(next);
      try {
        const places = await Location.reverseGeocodeAsync({ latitude: next.lat, longitude: next.lng });
        const addr = formatAddress(places[0]);
        if (addr) setText(addr);
      } catch {
        // reverse-geocode is best-effort; keep the coords even if it fails.
      }
    } catch {
      setNotice(t('locationPermissionDenied'));
    } finally {
      setLocating(false);
    }
  };

  const onContinue = async () => {
    if (saving) return;
    setSaving(true);
    try {
      let finalCoords = coords;
      const trimmed = text.trim();
      if (!finalCoords && trimmed) {
        try {
          const results = await Location.geocodeAsync(trimmed);
          if (results[0]) finalCoords = { lat: results[0].latitude, lng: results[0].longitude };
          else setNotice(t('locationGeocodeFailed'));
        } catch {
          setNotice(t('locationGeocodeFailed'));
        }
      }
      if (finalCoords || trimmed) {
        await supabase.rpc('set_my_location', {
          p_lat: finalCoords?.lat ?? null,
          p_lng: finalCoords?.lng ?? null,
          p_text: trimmed || null,
        });
      }
      goNext();
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingStep
      title={t('locationTitle')}
      body={t('locationBody')}
      primaryLabel={t('continue')}
      onPrimary={onContinue}
      onSkip={goNext}
      primaryDisabled={saving}>
      <Pressable
        style={styles.gpsButton}
        onPress={useCurrentLocation}
        disabled={locating}
        accessibilityRole="button">
        {locating ? (
          <ActivityIndicator color="#0B7BFF" />
        ) : (
          <Text style={styles.gpsButtonText}>{t('locationUseCurrent')}</Text>
        )}
      </Pressable>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={(v) => {
          setText(v);
          setCoords(null);
        }}
        placeholder={t('locationManualPlaceholder')}
        autoCapitalize="words"
      />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  gpsButton: {
    borderWidth: 1,
    borderColor: '#0B7BFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  gpsButtonText: { color: '#0B7BFF', fontSize: 16, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  notice: { marginTop: 10, color: '#6B7685', fontSize: 13 },
});
```

- [ ] **Step 2: Typecheck:** `pnpm --filter mobile typecheck` — expect clean. (If `supabase.rpc('set_my_location', …)` errors on the null args, confirm Task 2's `Args` made them `| null`.)

- [ ] **Step 3: Commit:**
```bash
git add "apps/mobile/app/(onboarding)/location.tsx"
git commit -m "feat(mobile): capture location in onboarding (GPS + geocoded address)"
```

---

## Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Fresh DB + SQL test:**
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/set_my_location.sql
```
Expected: `NOTICE:  OK set_my_location`.

- [ ] **Step 2: Workspace typecheck + api tests (no regression):**
```bash
pnpm -w typecheck && pnpm --filter @padel/api test
```
Expected: 0 type errors; api tests pass.

- [ ] **Step 3: Manual smoke (iOS simulator — REQUIRES NATIVE REBUILD).**
Because `expo-location` is a native module and `app.json` changed, rebuild the dev client: `cd apps/mobile && npx expo run:ios` (with `supabase functions serve` running for sign-up). Then, going through onboarding:
- "Use current location" prompts for permission; on allow, the address field fills.
- Continue → check the DB: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres -c "select location_text, st_y(location_point::geometry) lat, st_x(location_point::geometry) lng from profiles order by created_at desc limit 1;"` shows the captured values.
- Typing an address (no GPS) and Continue geocodes + persists (or saves text-only with the `locationGeocodeFailed` notice).
- Denying permission shows the notice and still lets you type/skip; Skip writes nothing.

- [ ] **Step 4: Finish the branch.**
Announce: "I'm using the finishing-a-development-branch skill to complete this work." Follow superpowers:finishing-a-development-branch; PR/merge targets `feat/discovery-explore` (stacked).

---

## Self-Review notes (addressed)
- **Spec coverage:** RPC + server-side point (spec §Components/Migration) → Task 1; hand-added types → Task 2; expo-location + permission plugin (spec §Native config) → Task 3; i18n 5 keys × 3 locales (spec §i18n) → Task 4; GPS + manual-geocode capture flow (spec §Mobile) → Task 5; SQL/typecheck/native-smoke (spec §Testing) → Task 6.
- **No placeholders:** complete SQL, TSX, and JSON in every step; permission string and all copy spelled out.
- **Type consistency:** RPC name `set_my_location` and arg names `p_lat`/`p_lng`/`p_text` identical across Task 1 (SQL), Task 2 (types, nullable), Task 5 (call site, passes `… ?? null`). `Coords = { lat; lng }` defined and used only in Task 5.
- **Resolved:** point built `(lng, lat)`; null coords → null point (manual geocode-fail path); RPC scoped to `auth.uid()` (caller-scope test).
- **Native caveat:** expo-location requires a dev-client rebuild — flagged in Task 6; the SQL test (not the simulator) is the automated correctness gate.
