# Edit Location & Courts + Thumbnails + Re-notify (A2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete JM-24 — organizer can edit a scheduled event's location and court count, upload/replace a thumbnail (and set one at create time), and confirmed players are re-notified when the date or location changes.

**Architecture:** Migration `0080` recreates `update_event` to also write location + `num_courts` (with a `courts_below_roster` guard and old-coords preservation), fires an `event_updated` notification on date/location change, and adds a public `event-thumbnails` bucket with own-folder RLS. `@padel/api` extends `updateEventSchema`/`buildUpdateEventPayload`. The edit screen reuses the wizard's `Step5Location`/`Step6Courts` + an `ImagePickerRow`; the create wizard gains the same thumbnail picker.

**Tech Stack:** Supabase Postgres (plpgsql RPC, storage RLS, PostGIS `geography`), `@padel/api` (zod + payload builder), Expo Router / React Native, `expo-image-picker` via `lib/storage.ts` helpers.

**Spec:** [docs/superpowers/specs/2026-06-19-edit-location-courts-design.md](specs/2026-06-19-edit-location-courts-design.md)

---

## File Structure

| File | Responsibility |
|---|---|
| `infra/supabase/migrations/0080_update_event_location.sql` | `event_updated` type; recreate `update_event` (location + courts + guard + re-notify); `event-thumbnails` bucket + RLS |
| `infra/supabase/tests/update_event_location.sql` | SQL test: location persistence, courts guard, event_updated fire/no-fire |
| `packages/api/src/schemas.ts` | Extend `updateEventSchema` + `buildUpdateEventPayload` with location + `numCourts` |
| `packages/api/src/client.ts` | Add `courts_below_roster` to `mapPgError` KNOWN |
| `apps/mobile/app/event/[id]/edit.tsx` | Seed + render Location/Courts sections + thumbnail picker; include in save payload |
| `apps/mobile/components/event/wizard/steps/Step9Details.tsx` | Add thumbnail picker to the create wizard details step |
| `apps/mobile/app/event/create/index.tsx` | Upload picked thumbnail in `finalize()`, pass `thumbnailPath` |
| `apps/mobile/lib/i18n-mobile.ts` | New `event` keys + `notifications.event_updated` copy (English) |

---

## Task 1: Migration `0080` — recreate `update_event` + bucket

**Files:**
- Create: `infra/supabase/migrations/0080_update_event_location.sql`

- [ ] **Step 1: Write the migration**

```sql
-- A2 (JM-24): extend update_event with location + num_courts (with a courts capacity guard),
-- re-notify confirmed players on a date/location change ('event_updated'), and add the
-- event-thumbnails storage bucket. Keeps all editable-field behavior from 0078.

alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'event_invite','group_invite','community_invite',
  'community_request_accepted','follow','follow_joined_event','event_cancelled','event_updated'));

create or replace function update_event(p_event_id uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype;
        v_allow_standby boolean; v_standby int; v_private boolean; v_standby_have int;
        v_num_courts int; v_confirmed_main int;
        v_date_changed boolean; v_loc_changed boolean;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'not_editable' using errcode='P0001'; end if;
  if coalesce(btrim(p_payload->>'name'),'') = '' then raise exception 'name_required' using errcode='P0001'; end if;

  v_allow_standby := coalesce((p_payload->>'allow_standby')::boolean, false);
  v_standby := nullif(p_payload->>'standby_spots','')::int;
  v_private := case when v_ev.group_id is null then true
                    else coalesce((p_payload->>'is_private')::boolean, false) end;
  v_num_courts := coalesce((p_payload->>'num_courts')::int, v_ev.num_courts);

  -- Standby capacity guard (from 0078): don't strand current standby players.
  select count(*) into v_standby_have from event_participants where event_id=p_event_id and is_standby;
  if v_standby_have > 0 and (not v_allow_standby or coalesce(v_standby,0) < v_standby_have) then
    raise exception 'standby_below_roster' using errcode='P0001';
  end if;

  -- Courts capacity guard (A2): num_courts*4 must seat the confirmed non-standby roster.
  select count(*) into v_confirmed_main
    from event_participants where event_id=p_event_id and status='confirmed' and not is_standby;
  if v_num_courts * 4 < v_confirmed_main then
    raise exception 'courts_below_roster' using errcode='P0001';
  end if;

  -- Change detection (A2) for the re-notify.
  v_date_changed := (p_payload->>'starts_at')::timestamptz is distinct from v_ev.starts_at;
  v_loc_changed :=
       nullif(p_payload->>'venue_id','')::uuid          is distinct from v_ev.venue_id
    or nullif(p_payload->>'manual_location_name','')    is distinct from v_ev.manual_location_name
    or nullif(p_payload->>'manual_location_address','') is distinct from v_ev.manual_location_address;

  update events set
    name                    = btrim(p_payload->>'name'),
    description             = p_payload->>'description',
    thumbnail_path          = p_payload->>'thumbnail_path',
    starts_at               = (p_payload->>'starts_at')::timestamptz,
    duration_minutes        = (p_payload->>'duration_minutes')::int,
    scoring_mode            = p_payload->>'scoring_mode',
    scoring_value           = nullif(p_payload->>'scoring_value','')::int,
    allow_standby           = v_allow_standby,
    standby_spots           = case when v_allow_standby then v_standby else null end,
    is_private              = v_private,
    counts_for_ranking      = case when v_private is distinct from v_ev.is_private
                                  then (v_ev.group_id is not null and not v_private)
                                  else v_ev.counts_for_ranking end,
    entrance_fee_enabled    = coalesce((p_payload->>'entrance_fee_enabled')::boolean, false),
    entrance_fee_amount     = nullif(p_payload->>'entrance_fee_amount','')::numeric,
    entrance_fee_method     = nullif(p_payload->>'entrance_fee_method',''),
    entrance_fee_mba_number = p_payload->>'entrance_fee_mba_number',
    players_submit_results  = coalesce((p_payload->>'players_submit_results')::boolean, false),
    organizer_role          = p_payload->>'organizer_role',
    -- A2: location + courts. Client nulls the opposite side of the venue/manual XOR;
    -- events_venue_xor_manual backstops it. location_point is preserved when no new coords are sent.
    venue_id                = nullif(p_payload->>'venue_id','')::uuid,
    manual_location_name    = nullif(p_payload->>'manual_location_name',''),
    manual_location_address = nullif(p_payload->>'manual_location_address',''),
    has_location            = coalesce((p_payload->>'has_location')::boolean, false),
    num_courts              = v_num_courts,
    location_point          = case
        when p_payload->>'location_lat' is not null and p_payload->>'location_lng' is not null
        then st_setsrid(st_makepoint((p_payload->>'location_lng')::float8,(p_payload->>'location_lat')::float8),4326)::geography
        else v_ev.location_point end,
    location_text           = nullif(p_payload->>'location_text','')
  where id = p_event_id;

  -- Re-notify confirmed participants (not the organizer) on a date or location change.
  if v_date_changed or v_loc_changed then
    insert into notifications (user_id, type, actor_id, event_id, actor_name, entity_name)
    select ep.user_id, 'event_updated', v_user, p_event_id,
           (select full_name from profiles where id = v_user), btrim(p_payload->>'name')
    from event_participants ep
    where ep.event_id = p_event_id and ep.status='confirmed'
      and ep.user_id is not null and ep.user_id <> v_user;
  end if;
end; $$;

grant execute on function update_event(uuid, jsonb) to authenticated;

-- A2: dedicated public bucket for event thumbnails. community-thumbnails is community-admin gated
-- (is_community_admin(folder)); event organizers aren't necessarily admins. Own-folder RLS mirrors avatars.
insert into storage.buckets (id, name, public) values ('event-thumbnails','event-thumbnails', true)
  on conflict (id) do nothing;
create policy "event-thumb write: self" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "event-thumb update: self" on storage.objects for update to authenticated
  using (bucket_id = 'event-thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "event-thumb delete: self" on storage.objects for delete to authenticated
  using (bucket_id = 'event-thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: Apply the migration**

Run: `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset`
Expected: completes with no errors, all migrations through `0080` applied. If an error mentions a column or constraint name, verify against [0040_events_core.sql](../../../infra/supabase/migrations/0040_events_core.sql) and [0073_cancel_event.sql](../../../infra/supabase/migrations/0073_cancel_event.sql) (the current notification type list) and fix only the genuine mismatch.

- [ ] **Step 3: Commit**

```bash
git add infra/supabase/migrations/0080_update_event_location.sql
git commit -m "feat(events): update_event location+courts, re-notify, event-thumbnails bucket (A2)"
```

---

## Task 2: SQL test `update_event_location.sql`

**Files:**
- Create: `infra/supabase/tests/update_event_location.sql`

Mirror the fixture style of [infra/supabase/tests/update_event.sql](../../../infra/supabase/tests/update_event.sql) and [cancel_event.sql](../../../infra/supabase/tests/cancel_event.sql).

- [ ] **Step 1: Write the test**

```sql
-- A2: update_event location + courts guard + event_updated re-notify.
-- Verifies: venue<->manual location persistence (opposite side nulled), coords -> location_point,
-- num_courts guard (courts_below_roster), and event_updated notifications fire on date/location
-- change but NOT on a name-only edit. 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('b0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','loc-u1@x.com'),
  ('b0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','loc-p1@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('b0000001-0000-0000-0000-000000000001','loc-u1@x.com','+351900700001','LocOrganizer'),
  ('b0000002-0000-0000-0000-000000000002','loc-p1@x.com','+351900700002','LocPlayer') on conflict do nothing;

do $$
declare
  u1  uuid := 'b0000001-0000-0000-0000-000000000001';
  p1  uuid := 'b0000002-0000-0000-0000-000000000002';
  cid uuid;
  g   uuid;
  ven uuid;
  ev  uuid;
  base jsonb;
  v_venue uuid;
  v_mname text;
  v_courts int;
  v_point_null boolean;
  n_upd int;
  n_after int;
  v_starts timestamptz;
  i int;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"b0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('LocC','club','PT','public');

  perform set_config('role','postgres',true);
  select id into g from groups where community_id = cid order by created_at limit 1;
  insert into venues (name, address, created_by) values ('Padel Palace','1 Court St', u1) returning id into ven;

  -- Scheduled group event, manual location, num_courts=2 (capacity 8).
  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode, scoring_value,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private,
    manual_location_name, has_location
  ) values (
    g, u1, 'americano', 'classic', 'points', 24,
    2, now() + interval '2 day', 90, 'organizing_only', 'LocEv', 'scheduled', false,
    'Old Gym', true
  ) returning id into ev;

  -- A confirmed non-organizer participant (for the re-notify assertions).
  insert into event_participants (event_id, user_id, status, is_standby) values (ev, p1, 'confirmed', false);

  -- Base payload: a full editable snapshot (matches what the client always sends).
  base := jsonb_build_object(
    'name','LocEv','description','d',
    'starts_at',(now()+interval '2 day')::text,'duration_minutes',90,
    'scoring_mode','points','scoring_value',24,
    'allow_standby',false,'is_private',false,
    'entrance_fee_enabled',false,'players_submit_results',false,'organizer_role','organizing_only',
    'num_courts',2,'has_location',true,
    'manual_location_name','Old Gym','manual_location_address',null,'venue_id',null);

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"b0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);

  -- (1) manual -> venue: send venue_id, null manual. Expect venue set + manual nulled + event_updated fired.
  perform update_event(ev, base || jsonb_build_object('venue_id', ven::text, 'manual_location_name', null, 'location_text', null));
  perform set_config('role','postgres',true);
  select venue_id, manual_location_name into v_venue, v_mname from events where id = ev;
  if v_venue is distinct from ven or v_mname is not null then
    raise exception using errcode='PT001', message='manual->venue: expected venue set + manual nulled';
  end if;
  select count(*) into n_upd from notifications where event_id = ev and type='event_updated' and user_id = p1;
  if n_upd <> 1 then
    raise exception using errcode='PT001', message='location change should notify the confirmed player once, got '||n_upd;
  end if;
  raise notice 'OK location manual->venue + event_updated fired';

  -- (2) venue -> manual + coords: expect manual set, venue nulled, location_point written.
  perform set_config('role','authenticated',true);
  perform update_event(ev, base || jsonb_build_object(
    'venue_id', null, 'manual_location_name','New Club','manual_location_address','9 Court Ave',
    'location_lat', 38.72, 'location_lng', -9.14, 'location_text','New Club'));
  perform set_config('role','postgres',true);
  select venue_id, manual_location_name, (location_point is null) into v_venue, v_mname, v_point_null from events where id = ev;
  if v_venue is not null or v_mname <> 'New Club' or v_point_null then
    raise exception using errcode='PT001', message='venue->manual: expected manual set, venue null, location_point written';
  end if;
  raise notice 'OK location venue->manual + coords -> location_point';

  -- (3) courts guard: seed 5 confirmed main players total, then lowering to num_courts=1 (cap 4) must fail.
  perform set_config('role','postgres',true);
  for i in 1..4 loop
    insert into event_participants (event_id, guest_name, status, is_standby)
      values (ev, 'Guest'||i, 'confirmed', false);
  end loop; -- now 5 confirmed main (p1 + 4 guests)
  perform set_config('role','authenticated',true);
  begin
    perform update_event(ev, base || jsonb_build_object('num_courts', 1,
      'manual_location_name','New Club','manual_location_address','9 Court Ave','location_text','New Club'));
    raise exception using errcode='PT001', message='lowering courts below confirmed roster should raise courts_below_roster';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('courts_below_roster' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for courts guard: '||sqlerrm;
      end if;
  end;
  raise notice 'OK courts guard: courts_below_roster';

  -- (4) name-only edit (SAME starts_at + SAME location as the current row) -> NO new event_updated.
  -- Reuse the row's stored starts_at + current location so neither v_date_changed nor v_loc_changed trips.
  -- (Re-sending now()+interval '2 day' would be a *later* instant than the value the step-2 update stored,
  --  which would falsely count as a date change — hence we read the stored value here.)
  perform set_config('role','postgres',true);
  select starts_at into v_starts from events where id = ev;
  select count(*) into n_upd from notifications where event_id = ev and type='event_updated' and user_id = p1;
  perform set_config('role','authenticated',true);
  perform update_event(ev, base || jsonb_build_object('name','Renamed',
    'starts_at', v_starts::text,
    'manual_location_name','New Club','manual_location_address','9 Court Ave','location_text','New Club'));
  perform set_config('role','postgres',true);
  select count(*) into n_after from notifications where event_id = ev and type='event_updated' and user_id = p1;
  if n_after <> n_upd then
    raise exception using errcode='PT001', message='name-only edit must not add an event_updated notification ('||n_upd||'->'||n_after||')';
  end if;
  raise notice 'OK name-only edit: no extra event_updated';

  raise notice 'OK update_event_location';
end $$;
rollback;
```

- [ ] **Step 2: Run the test**

Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/update_event_location.sql`
Expected: prints the `OK …` notices ending in `OK update_event_location`; NO `PT001` / `ERROR`. If a `PT001` fires, the RPC has a real bug — STOP and report it (do not weaken the assertion). If it's a fixture/seed column error, fix the fixture only.

- [ ] **Step 3: Commit**

```bash
git add infra/supabase/tests/update_event_location.sql
git commit -m "test(events): update_event location/courts/re-notify SQL test (A2)"
```

---

## Task 3: `@padel/api` — schema + payload + error code

**Files:**
- Modify: `packages/api/src/schemas.ts` (`updateEventSchema` [schemas.ts:180-204](../../../packages/api/src/schemas.ts), `buildUpdateEventPayload` [schemas.ts:207-226](../../../packages/api/src/schemas.ts))
- Modify: `packages/api/src/client.ts` (`KNOWN` array [client.ts:6-26](../../../packages/api/src/client.ts))

- [ ] **Step 1: Extend `updateEventSchema`**

Add these fields inside the `z.object({ ... })` of `updateEventSchema` (mirroring `createEventSchema`):
```ts
    manualLocationName: z.string().trim().optional(),
    manualLocationAddress: z.string().trim().optional(),
    venueId: z.string().uuid().optional(),
    locationLat: z.number().optional(),
    locationLng: z.number().optional(),
    hasLocation: z.boolean(),
    numCourts: z.number().int().min(1),
```

- [ ] **Step 2: Extend `buildUpdateEventPayload`**

Add to the returned object (mirroring `buildCreateEventPayload`'s location encoding):
```ts
    num_courts: input.numCourts,
    manual_location_name: input.venueId ? null : (input.manualLocationName ?? null),
    manual_location_address: input.venueId ? null : (input.manualLocationAddress ?? null),
    venue_id: input.venueId ?? null,
    location_lat: input.locationLat ?? null,
    location_lng: input.locationLng ?? null,
    location_text: input.manualLocationName ?? null,
    has_location: input.hasLocation,
```

- [ ] **Step 3: Add the error code**

In `packages/api/src/client.ts`, append `'courts_below_roster'` to the events line of `KNOWN` (the one already containing `'standby_below_roster'`):
```ts
  'recurring_events', 'not_cancellable', 'invalid_scope', 'not_editable', 'standby_below_roster', 'series_inactive', 'courts_below_roster',
```

- [ ] **Step 4: Verify**

Run: `pnpm -w typecheck && pnpm --filter @padel/api test`
Expected: typecheck 13/13; `@padel/api` tests pass. Note: `updateEventSchema` now requires `hasLocation` + `numCourts` — the edit screen (Task 4) must supply them. If any existing test constructs an `updateEventSchema` input, update it to include the two new required fields.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/schemas.ts packages/api/src/client.ts
git commit -m "feat(api): updateEventSchema location+courts; courts_below_roster (A2)"
```

---

## Task 4: Edit screen — Location, Courts, Thumbnail

**Files:**
- Modify: `apps/mobile/app/event/[id]/edit.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts` (`event` English block)

Reference: `Step5Location`/`Step6Courts` take `{ draft, patch }` (see [Step5Location.tsx](../../../apps/mobile/components/event/wizard/steps/Step5Location.tsx)). `ImagePickerRow` from `@/components/community/ImagePickerRow` takes `{ label, variant, uri, onPress, disabled }`. `pickAndValidateImage`/`uploadCommunityImage` from `@/lib/storage`. The supabase client singleton is `import { supabase } from '@/lib/supabase'`. The user id is `useSession().session?.user.id` from `@padel/auth`.

- [ ] **Step 1: Imports + state**

Add imports:
```tsx
import { useSession } from '@padel/auth';
import { Step5Location } from '@/components/event/wizard/steps/Step5Location';
import { Step6Courts } from '@/components/event/wizard/steps/Step6Courts';
import { ImagePickerRow } from '@/components/community/ImagePickerRow';
import { pickAndValidateImage, uploadCommunityImage, type PickedImage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
```
Add state inside the component (near the other `useState`s):
```tsx
  const uid = useSession().session?.user.id;
  const [picked, setPicked] = useState<PickedImage | null>(null);
```

- [ ] **Step 2: Seed location fields from the row**

In the `seeded` object, replace `hasLocation: true,` with the real values and add the location fields:
```tsx
      hasLocation: event.has_location,
      venueId: event.venue_id ?? undefined,
      manualLocationName: event.manual_location_name ?? undefined,
      manualLocationAddress: event.manual_location_address ?? undefined,
```
(Leave `numCourts: event.num_courts` as-is — already seeded. `locationLat/locationLng` stay unset; the RPC preserves `location_point` when no new coords are sent.)

- [ ] **Step 3: Thumbnail preview URL + picker handler**

Add before `onSave`:
```tsx
  const existingThumbUrl = d.thumbnailPath
    ? supabase.storage.from('event-thumbnails').getPublicUrl(d.thumbnailPath).data.publicUrl
    : null;
  const onPickThumbnail = () => {
    void (async () => {
      try {
        const result = await pickAndValidateImage();
        if (result) setPicked(result);
      } catch (e) {
        setError(t(e instanceof Error ? e.message : 'unknown_error'));
      }
    })();
  };
```

- [ ] **Step 4: Rewrite `onSave` to upload (if needed) + include location/courts**

Replace the existing `onSave` with:
```tsx
  const onSave = () => {
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        let thumbnailPath = d.thumbnailPath;
        if (picked && uid) {
          thumbnailPath = await uploadCommunityImage(supabase, 'event-thumbnails', uid, picked.uri, picked.mimeType);
        }
        const parsed = updateEventSchema.safeParse({
          name: d.name,
          description: d.description?.trim() ? d.description : undefined,
          thumbnailPath,
          startsAt: d.startsAt,
          durationMinutes: d.durationMinutes,
          scoringMode: d.scoringMode,
          scoringValue: d.scoringValue,
          allowStandby: d.allowStandby,
          standbySpots: d.standbySpots,
          isPrivate: d.isPrivate,
          entranceFee: d.entranceFee,
          playersSubmitResults: d.playersSubmitResults,
          organizerRole: d.organizerRole,
          hasLocation: d.hasLocation,
          numCourts: d.numCourts,
          venueId: d.venueId,
          manualLocationName: d.manualLocationName,
          manualLocationAddress: d.manualLocationAddress,
          locationLat: d.locationLat,
          locationLng: d.locationLng,
        });
        if (!parsed.success) {
          setError(t(parsed.error.issues[0]?.message ?? 'name_required'));
          return;
        }
        await update.mutateAsync({ values: parsed.data, groupId: event!.group_id });
        router.back();
      } catch (e) {
        setError(t(e instanceof Error ? e.message : 'unknown_error'));
      } finally {
        setBusy(false);
      }
    })();
  };
```

- [ ] **Step 5: Render the new sections**

After the `<Step8Preferences draft={d} patch={patch} />` line, add:
```tsx
        {/* Location */}
        <Text style={styles.section}>{t('editLocationSection')}</Text>
        <Step5Location draft={d} patch={patch} />

        {/* Courts */}
        <Text style={styles.section}>{t('editCourtsSection')}</Text>
        <Step6Courts draft={d} patch={patch} />

        {/* Thumbnail */}
        <Text style={styles.section}>{t('editThumbnailSection')}</Text>
        <ImagePickerRow
          label={t('editThumbnailLabel')}
          variant="cover"
          uri={picked?.uri ?? existingThumbUrl}
          onPress={onPickThumbnail}
          disabled={busy}
        />
```

- [ ] **Step 6: Add i18n keys**

In `apps/mobile/lib/i18n-mobile.ts`, add to the `event` English block:
```ts
    editLocationSection: 'Location',
    editCourtsSection: 'Courts',
    editThumbnailSection: 'Thumbnail',
    editThumbnailLabel: 'Event image',
    courts_below_roster: "Too many players are confirmed for that few courts. Remove players first.",
```

- [ ] **Step 7: Typecheck**

Run: `pnpm -w typecheck`
Expected: passes (13/13). Fix any error from the edits.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/app/event/[id]/edit.tsx apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): edit event location, courts & thumbnail (A2)"
```

---

## Task 5: Create-time thumbnail

**Files:**
- Modify: `apps/mobile/components/event/wizard/steps/Step9Details.tsx`
- Modify: `apps/mobile/app/event/create/index.tsx`

`EventDraft` already has `thumbnail?: PickedImage | null` and `thumbnailPath?` ([draft.ts:47-48](../../../apps/mobile/components/event/wizard/draft.ts)).

- [ ] **Step 1: Add the picker to Step9Details**

In `Step9Details.tsx`, add imports:
```tsx
import { ImagePickerRow } from '@/components/community/ImagePickerRow';
import { pickAndValidateImage } from '@/lib/storage';
```
Add a pick handler in the component body:
```tsx
  const onPickThumbnail = () => {
    void (async () => {
      const result = await pickAndValidateImage().catch(() => null);
      if (result) patch({ thumbnail: result });
    })();
  };
```
Render after the description field (inside the container `View`):
```tsx
      <View style={styles.field}>
        <Text style={styles.label}>{t('editThumbnailLabel')}</Text>
        <ImagePickerRow
          label={t('editThumbnailLabel')}
          variant="cover"
          uri={draft.thumbnail?.uri ?? null}
          onPress={onPickThumbnail}
        />
      </View>
```
(`editThumbnailLabel` was added to the `event` namespace in Task 4.)

- [ ] **Step 2: Upload in `finalize()`**

In `apps/mobile/app/event/create/index.tsx`:
Add imports:
```tsx
import { useSession } from '@padel/auth';
import { uploadCommunityImage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
```
Add inside `CreateEventWizard` (near the other hooks):
```tsx
  const uid = useSession().session?.user.id;
```
In `finalize()`, before constructing `input`, upload the picked thumbnail:
```tsx
    let thumbnailPath = draft.thumbnailPath;
    if (draft.thumbnail && uid) {
      try {
        thumbnailPath = await uploadCommunityImage(supabase, 'event-thumbnails', uid, draft.thumbnail.uri, draft.thumbnail.mimeType);
      } catch {
        setError('unknown_error');
        return;
      }
    }
```
Then add `thumbnailPath,` to the `input: CreateEventInput = { ... }` object literal (alongside `description`). (`finalize` is already `async`; `setSubmitting(true)` happens after this block today — move `setSubmitting(true)` to before the upload so the button shows progress during upload, OR leave it — keep behavior simple: do the upload, then the existing `setSubmitting(true)` runs.)

- [ ] **Step 3: Typecheck**

Run: `pnpm -w typecheck`
Expected: passes (13/13).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/event/wizard/steps/Step9Details.tsx apps/mobile/app/event/create/index.tsx
git commit -m "feat(mobile): set event thumbnail at create time (A2)"
```

---

## Task 6: `event_updated` notification copy

**Files:**
- Modify: `apps/mobile/lib/i18n-mobile.ts` (`notifications` English block)

- [ ] **Step 1: Add the copy**

Find the `notifications` namespace English block (where `event_cancelled` copy lives — `grep -n "event_cancelled" apps/mobile/lib/i18n-mobile.ts`). Add an `event_updated` entry matching the shape used by the other event notification types (e.g. a title/body template using `entity_name`). Mirror the exact key structure the inbox renderer expects for `event_cancelled` (same sub-keys), e.g.:
```ts
    event_updated: { title: 'Event updated', body: '{{entityName}} was updated — check the new details.' },
```
**Implementer:** open the `event_cancelled` entry first and copy its exact structure/placeholder names; do not invent a different shape.

- [ ] **Step 2: Typecheck**

Run: `pnpm -w typecheck`
Expected: passes (13/13).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): event_updated notification copy (A2)"
```

---

## Verification (end-to-end)

1. **DB:** `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset` clean; `docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/update_event_location.sql` prints `OK update_event_location` with no `PT001`. The pre-existing `infra/supabase/tests/update_event.sql` still passes (`OK update_event`).
2. **Types/API:** `pnpm -w typecheck` (13/13) and `pnpm --filter @padel/api test` pass.
3. **App (simulator):** edit a scheduled event's venue/manual location + court count + thumbnail → detail reflects all three; lowering courts below the confirmed roster is blocked with the courts message; a confirmed participant receives an "event updated" notification after a date or location edit; creating a new event with a thumbnail shows it.

## Out of scope (this slice)

Recurring "this / this & future" edit prompt; editing `event_type`/`specification`/`group_id`/`series`; PT/PT-BR copy (A5).
