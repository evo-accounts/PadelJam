# Phase 5D — Create-Event Location Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a venue search picker and a "Use my location" reverse-geocode capture to the create-event location step, writing `events.location_point` so new events get distance ranking.

**Architecture:** A migration adds `search_venues` + extends `create_event` to set `location_point` from payload coords (venue_id/manual/courts already plumbed). The schema/payload + create wizard draft carry `venueId`/`locationLat`/`locationLng`; Step5 gets a venue search + a device-location button.

**Tech Stack:** Supabase Postgres + PostGIS, `@padel/api` + Zod (`schemas.ts`), Expo `expo-location`, React Native, `@padel/i18n`.

**Spec:** `docs/superpowers/specs/2026-06-16-phase5d-create-event-location-design.md`

**Verification:** `0067` SQL tests; `pnpm --filter @padel/api test` + `pnpm -w typecheck`; simulator smoke (use-my-location → event has `location_point` → shows distance in Explore).

**Verified context:**
- `create_event(p_payload jsonb)` (`0046`) already inserts `venue_id`, `manual_location_*`, `has_location`, and `court_ids`; only `location_point`/`location_text` are new. `events_venue_xor_manual` CHECK = venue_id XOR manual_location_name.
- `CreateEventInput = z.infer<typeof createEventSchema>` + `buildCreateEventPayload(input)` in `packages/api/src/schemas.ts` (payload omits venue_id/coords today). `useCreateEvent` calls `buildCreateEventPayload`.
- `apps/mobile/app/event/create/index.tsx` builds the `CreateEventInput` `input` object from `draft`.
- `draft.ts` `EventDraft`/`WizardStepProps`; `Step5Location.tsx` = free-text name/address. `expo-location` installed (onboarding `location.tsx` uses `requestForegroundPermissionsAsync`/`getCurrentPositionAsync`/`reverseGeocodeAsync`). SRID-4326 via `st_setsrid(st_makepoint(lng,lat),4326)::geography`.

---

## File Structure
- **Create** `infra/supabase/migrations/0067_create_event_location.sql` — `search_venues` + `create_event` extension.
- **Create** `infra/supabase/tests/create_event_location.sql` — search match + create-with-coords.
- **Modify** `packages/db/src/database.types.ts` — `search_venues` Functions entry.
- **Modify** `packages/api/src/schemas.ts` — `createEventSchema` fields + `buildCreateEventPayload` mapping.
- **Modify** `packages/api/src/events/queries.ts` + `query-keys.ts` — `useSearchVenues` + `qk.searchVenues`.
- **Modify** `apps/mobile/app/event/create/index.tsx` — pass `venueId`/coords into the `input`.
- **Modify** `apps/mobile/components/event/wizard/draft.ts` — draft fields.
- **Modify** `apps/mobile/components/event/wizard/steps/Step5Location.tsx` — venue search + use-my-location.
- **Modify** `apps/mobile/lib/i18n-mobile.ts` — `event` namespace keys.

---

## Task 1: migration — search_venues + create_event location_point

**Files:**
- Create: `infra/supabase/migrations/0067_create_event_location.sql`
- Create: `infra/supabase/tests/create_event_location.sql`
- Modify: `packages/db/src/database.types.ts`

- [ ] **Step 1: Write the migration**

Create `infra/supabase/migrations/0067_create_event_location.sql`. The `search_venues` RPC is new; the
`create_event` change adds two columns to its `events` INSERT — **copy the current `create_event` body
verbatim from `0046_create_event_rpcs.sql` into a `create or replace`, then add the two additions shown
below** (this keeps the large body intact and the return type unchanged — no drop needed).

```sql
-- 0067_create_event_location.sql
-- Venue name search + write events.location_point from create-event coords. (Phase 5D)
create or replace function search_venues(p_query text)
returns table (id uuid, name text, address text)
language sql stable security definer set search_path = public as $$
  select v.id, v.name, v.address
  from venues v
  where p_query <> '' and (v.name ilike '%'||p_query||'%' or coalesce(v.address,'') ilike '%'||p_query||'%')
  order by v.name
  limit 20;
$$;
grant execute on function search_venues(text) to authenticated;
```

Then the `create_event` re-creation. In the copied body, the `events` INSERT column list (currently
ends `… players_submit_results, organizer_role, name, description, thumbnail_path, counts_for_ranking)`)
gains `location_point, location_text`, and the matching `values (…)` gains the two expressions
**before** the final `counts_for_ranking` value. Concretely, add to the column list:

```
    , location_point, location_text
```
and to the `values` list (matching position):

```
    , case
        when p_payload->>'location_lat' is not null and p_payload->>'location_lng' is not null
        then st_setsrid(st_makepoint((p_payload->>'location_lng')::float8, (p_payload->>'location_lat')::float8), 4326)::geography
      end
    , nullif(p_payload->>'location_text','')
```
End the migration by re-granting if `0046` granted `create_event` (`grant execute on function create_event(jsonb) to authenticated;`).

> Keep the `event_courts` insert + invitee + participant logic from the original body unchanged — only the two columns/values are added to the events INSERT. Do NOT touch `duplicate_event` (out of scope).

- [ ] **Step 2: Hand-add the search_venues type**

In `packages/db/src/database.types.ts` Functions:

```ts
      search_venues: {
        Args: { p_query: string }
        Returns: { id: string; name: string; address: string | null }[]
      }
```

- [ ] **Step 3: Write the SQL test**

Create `infra/supabase/tests/create_event_location.sql`:

```sql
-- create_event_location: search_venues ILIKE match; create_event writes location_point from coords.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('fb000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ce1@x.com')
  on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('fb000001-0000-0000-0000-000000000001','ce1@x.com','+351900090001','Org CE') on conflict do nothing;

do $$
declare o constant uuid := 'fb000001-0000-0000-0000-000000000001';
  v_tenant uuid; v_comm uuid; v_group uuid; v_event uuid; v_pt geography; v_cnt int;
begin
  -- seed a venue to prove search_venues
  insert into venues (name, address) values ('Padel Central Lisboa', 'Av. Test 1');
  insert into tenants (type, name, country) values ('community','CE Tenant','PT') returning id into v_tenant;
  insert into communities (tenant_id, name, type, privacy) values (v_tenant,'CE Community','club','public') returning id into v_comm;
  insert into groups (community_id, name) values (v_comm,'CE Group') returning id into v_group;
  insert into group_members (group_id, user_id) values (v_group, o);

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', o), true);

  -- search_venues matches on name
  select count(*) into v_cnt from search_venues('central');
  if v_cnt < 1 then raise exception using errcode='PT001', message='search_venues did not match'; end if;

  -- create_event with coords sets location_point
  v_event := create_event(jsonb_build_object(
    'group_id', v_group::text, 'event_type','americano', 'specification','mixed',
    'scoring_mode','points', 'scoring_value','24', 'num_courts','2',
    'starts_at', (now() + interval '1 day')::text, 'duration_minutes','90',
    'is_private', false, 'organizer_role','organizing_and_playing', 'name','CE Event',
    'manual_location_name','My Court', 'has_location', true,
    'location_lat','38.72', 'location_lng','-9.14', 'location_text','My Court, Lisboa'
  ));
  select location_point into v_pt from events where id = v_event;
  if v_pt is null then raise exception using errcode='PT001', message='location_point not set'; end if;

  raise notice 'OK create_event_location';
end $$;
rollback;
```

> If `venues` requires NOT-NULL columns beyond `name`/`address`, read the psql error and add valid
> values (check `0039_events_catalog.sql`). If `create_event`'s payload validation rejects a field,
> match the exact keys/types the RPC reads.

- [ ] **Step 4: Run migration + test**

```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/create_event_location.sql
```
Expected: `NOTICE: OK create_event_location`.

- [ ] **Step 5: Typecheck db**

Run: `pnpm --filter @padel/db typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add infra/supabase/migrations/0067_create_event_location.sql infra/supabase/tests/create_event_location.sql packages/db/src/database.types.ts
git commit -m "feat(events): search_venues RPC + create_event writes location_point"
```

---

## Task 2: schema/payload + useSearchVenues + create input

**Files:**
- Modify: `packages/api/src/schemas.ts`
- Modify: `packages/api/src/events/queries.ts`
- Modify: `packages/api/src/query-keys.ts`
- Modify: `apps/mobile/app/event/create/index.tsx`

- [ ] **Step 1: Extend the Zod schema + payload mapping**

In `packages/api/src/schemas.ts`, add to the `createEventSchema` object (optional fields):

```ts
  venueId: z.string().uuid().optional(),
  locationLat: z.number().optional(),
  locationLng: z.number().optional(),
```
In `buildCreateEventPayload`, add to the `payload` object (after `manual_location_address`):

```ts
    venue_id: input.venueId ?? null,
    location_lat: input.locationLat ?? null,
    location_lng: input.locationLng ?? null,
    location_text: input.manualLocationName ?? null,
```

- [ ] **Step 2: Add useSearchVenues + query key**

In `packages/api/src/query-keys.ts`, add inside `qk`:

```ts
  searchVenues: (q: string) => ['venues', 'search', q] as const,
```
In `packages/api/src/events/queries.ts`, add:

```ts
export const useSearchVenues = (query: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.searchVenues(query),
    enabled: query.trim().length > 0,
    queryFn: async () => {
      const { data, error } = await db.rpc('search_venues', { p_query: query.trim() });
      if (error) throw error;
      return data ?? [];
    },
  });
};
```
(`useQuery`/`useDb`/`qk` already imported in this file.)

- [ ] **Step 3: Pass venue/coords from the wizard draft**

In `apps/mobile/app/event/create/index.tsx`, add to the `input: CreateEventInput = { … }` object:

```ts
      venueId: draft.venueId,
      locationLat: draft.locationLat,
      locationLng: draft.locationLng,
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @padel/api typecheck` + `pnpm --filter mobile typecheck` → PASS. (`draft.venueId`/`locationLat`/`locationLng` come from Task 3's draft change — if Task 3 isn't done yet, those error; do Task 3 before this typecheck, or add the draft fields first. To keep tasks independent, **do Task 3 Step 1 (draft fields) before this typecheck.**)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/schemas.ts packages/api/src/events/queries.ts packages/api/src/query-keys.ts 'apps/mobile/app/event/create/index.tsx'
git commit -m "feat(api): create-event venue_id + coords payload + useSearchVenues"
```

---

## Task 3: draft fields + Step5 venue search & use-my-location + i18n

**Files:**
- Modify: `apps/mobile/components/event/wizard/draft.ts`
- Modify: `apps/mobile/components/event/wizard/steps/Step5Location.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: Add draft fields**

In `apps/mobile/components/event/wizard/draft.ts`, add to the `EventDraft` type (near `manualLocation*`):

```ts
  venueId?: string;
  locationLat?: number;
  locationLng?: number;
```
(No new default needed — they're optional/undefined by default.)

- [ ] **Step 2: Add i18n keys**

In `apps/mobile/lib/i18n-mobile.ts`, add to the `event` namespace's `en` object:

```ts
    searchVenueLabel: 'Search a venue',
    searchVenuePlaceholder: 'Venue name',
    venueResultsEmpty: 'No venues found.',
    useMyLocation: 'Use my location',
    locating: 'Getting your location…',
    locationDenied: 'Location permission denied — enter it manually.',
    orEnterManually: 'Or enter a location manually',
```

- [ ] **Step 3: Rebuild Step5Location with venue search + use-my-location**

Replace `apps/mobile/components/event/wizard/steps/Step5Location.tsx` with (keeps manual inputs, adds
a venue search list + a device-location button; venue ↔ manual are mutually exclusive):

```tsx
import { useSearchVenues } from '@padel/api';
import { useT } from '@padel/i18n';
import * as Location from 'expo-location';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { WizardStepProps } from '../draft';

export function Step5Location({ draft, patch }: WizardStepProps) {
  const { t } = useT('event');
  const [venueQuery, setVenueQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const venues = useSearchVenues(venueQuery);

  const pickVenue = (id: string, name: string) =>
    patch({
      venueId: id,
      manualLocationName: name,
      manualLocationAddress: undefined,
      locationLat: undefined,
      locationLng: undefined,
      hasLocation: true,
    });

  const useMyLocation = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({});
      const [place] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const label = [place?.name, place?.city ?? place?.subregion, place?.region]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(', ');
      patch({
        venueId: undefined,
        manualLocationName: label || draft.manualLocationName,
        locationLat: pos.coords.latitude,
        locationLng: pos.coords.longitude,
        hasLocation: true,
      });
    } finally {
      setLocating(false);
    }
  };

  const setManualName = (text: string) =>
    patch({
      venueId: undefined,
      manualLocationName: text,
      hasLocation: text.trim().length > 0 || (draft.manualLocationAddress ?? '').trim().length > 0,
    });
  const setManualAddress = (text: string) =>
    patch({
      venueId: undefined,
      manualLocationAddress: text,
      hasLocation: (draft.manualLocationName ?? '').trim().length > 0 || text.trim().length > 0,
    });

  const results = venues.data ?? [];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('step5Title')}</Text>

      <Text style={styles.label}>{t('searchVenueLabel')}</Text>
      <TextInput
        style={styles.input}
        value={venueQuery}
        onChangeText={setVenueQuery}
        placeholder={t('searchVenuePlaceholder')}
        placeholderTextColor="#9AA4B2"
        autoCapitalize="none"
      />
      {venueQuery.trim().length > 0 ? (
        venues.isLoading ? (
          <ActivityIndicator color="#0B1F3A" style={{ marginTop: 8 }} />
        ) : results.length === 0 ? (
          <Text style={styles.empty}>{t('venueResultsEmpty')}</Text>
        ) : (
          results.map((v: { id: string; name: string }) => (
            <Pressable
              key={v.id}
              style={[styles.venueRow, draft.venueId === v.id && styles.venueRowOn]}
              onPress={() => pickVenue(v.id, v.name)}
              accessibilityRole="button"
            >
              <Text style={styles.venueName}>{v.name}</Text>
            </Pressable>
          ))
        )
      ) : null}

      <Text style={styles.or}>{t('orEnterManually')}</Text>

      <Text style={styles.label}>{t('locationNameLabel')}</Text>
      <TextInput
        style={styles.input}
        value={draft.manualLocationName ?? ''}
        onChangeText={setManualName}
        placeholder={t('locationNamePlaceholder')}
        placeholderTextColor="#9AA4B2"
      />
      <Text style={styles.label}>{t('locationAddressLabel')}</Text>
      <TextInput
        style={styles.input}
        value={draft.manualLocationAddress ?? ''}
        onChangeText={setManualAddress}
        placeholder={t('locationAddressPlaceholder')}
        placeholderTextColor="#9AA4B2"
      />

      <Pressable style={styles.locBtn} onPress={useMyLocation} disabled={locating} accessibilityRole="button">
        <Text style={styles.locBtnText}>{locating ? t('locating') : t('useMyLocation')}</Text>
      </Pressable>
      {draft.locationLat != null ? <Text style={styles.coords}>✓ {draft.locationLat.toFixed(4)}, {draft.locationLng?.toFixed(4)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  title: { fontSize: 20, fontWeight: '800', color: '#0B1F3A', marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#0B1F3A', marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#D7DEE6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: '#fff' },
  empty: { color: '#6B7685', fontSize: 13, paddingVertical: 8 },
  venueRow: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginTop: 6, borderWidth: 1, borderColor: '#E2E8F0' },
  venueRowOn: { borderColor: '#0B7BFF', backgroundColor: '#EAF2FF' },
  venueName: { fontSize: 15, color: '#0B1F3A', fontWeight: '600' },
  or: { textAlign: 'center', color: '#6B7685', fontSize: 13, marginVertical: 12 },
  locBtn: { backgroundColor: '#EAF2FF', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  locBtnText: { color: '#0B7BFF', fontWeight: '700', fontSize: 15 },
  coords: { color: '#1F9D55', fontSize: 12, marginTop: 6, textAlign: 'center' },
});
```
(If the original `Step5Location` styles/labels differ — e.g. a `skipLocation` link — preserve any
existing `locationNameLabel`/`locationAddressLabel`/placeholder keys it used; they already exist in i18n.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter mobile typecheck` → PASS. (`expo-location` is installed; `useSearchVenues` exported from `@padel/api`.)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/event/wizard/draft.ts 'apps/mobile/components/event/wizard/steps/Step5Location.tsx' apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(events): create-event venue search + use-my-location capture"
```

- [ ] **Step 6: Simulator smoke (deferred)**

Create an event → Step5 → "Use my location" fills the name + a coords check → finish → the event has a
`location_point` and appears with "X km away" in Explore for a nearby viewer. Venue search shows
results once venues are curated.

---

## Verification gate (whole phase)
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/create_event_location.sql   # OK create_event_location
pnpm --filter @padel/api test
pnpm -w typecheck
```

## Self-Review
**Spec coverage:** `search_venues` RPC → Task 1. `create_event` writes `location_point` from coords → Task 1. `useSearchVenues` → Task 2. payload `venue_id`/coords + Zod fields → Task 2. draft fields → Task 3. Step5 venue search + use-my-location reverse-geocode (manual path carries coords; venue↔manual XOR) → Task 3. i18n → Task 3. Deferred (venue coords/Places, court picker, team pairing) respected. ✓
**Placeholder scan:** none — full SQL/TS. The `create_event` body is extended by copying `0046`'s verbatim + the two shown additions (not a placeholder — an explicit, bounded edit to a large existing function).
**Type consistency:** `CreateEventInput` gains `venueId/locationLat/locationLng` (Task 2 Zod) used by `index.tsx` (Task 2 Step 3) + `draft.ts` (Task 3 Step 1); `buildCreateEventPayload` emits `venue_id/location_lat/location_lng/location_text` matching the `create_event` payload reads (Task 1). `search_venues` Returns `{id,name,address}` (Task 1 types) matches `useSearchVenues` + the Step5 row render. **Ordering note:** do Task 3 Step 1 (draft fields) before Task 2 Step 4's mobile typecheck (or run typechecks after both) since `index.tsx` reads the draft fields.
