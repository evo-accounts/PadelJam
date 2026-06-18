# Edit Location & Courts + Thumbnails + Re-notify (A2) — Design

*Padel Jam • 2026-06-19 • Brainstormed design / spec*

## Goal

Complete **JM-24** by letting an organizer edit a scheduled event's **location** and **court count**, upload
or replace a **thumbnail** (and wire thumbnail upload at create time, which is currently unwired), and
**re-notify** confirmed players when the date/time or location changes. Closes the `TODO(Phase 6f)` left after
the editable-fields half shipped in `update_event` (0078).

## Scope decisions (from the brainstorm)

1. **Location editing** — venue search vs manual name/address (XOR) + coordinates, reusing the wizard's
   `Step5Location`.
2. **Courts editing** — `num_courts` (reuse `Step6Courts`/`CourtCounter`), with a server guard that **blocks**
   lowering `num_courts` below the confirmed non-standby roster (`courts_below_roster`).
3. **Re-notify** — a new `'event_updated'` notification fires for confirmed participants when **`starts_at`
   changed OR location changed** (one notification regardless of how many of those changed).
4. **Thumbnail** — picker on the edit screen **and** the create wizard (so new events get a thumbnail), reusing
   the existing `uploadCommunityImage`/`pickAndValidateImage`/`ImagePickerRow` helpers, uploading into a **new
   `event-thumbnails` bucket** foldered by **user id**. (The `community-thumbnails` bucket is community-admin-
   gated by RLS — `is_community_admin(folder)` — so it can't accept thumbnails from non-admin organizers; a new
   bucket with own-folder RLS, mirroring `avatars`, is required.)

### Explicitly deferred

- Recurring "this / this & future" edit prompt (pairs with deferred occurrence edit-scope work).
- Editing `event_type` / `specification` / `group_id` / `series` (immutable per JM-24).

## Verified context

- **`update_event`** ([0078_update_event.sql](../../../infra/supabase/migrations/0078_update_event.sql)):
  updates name/description/thumbnail_path/starts_at/duration/scoring/standby/privacy/fees/players_submit/
  organizer_role; comment says `event_type/specification/num_courts/location/group_id/series` are NOT touched.
  Holds the standby capacity guard (`standby_below_roster`).
- **`events`** columns ([0040_events_core.sql:16-55](../../../infra/supabase/migrations/0040_events_core.sql) +
  [0066_events_geo.sql](../../../infra/supabase/migrations/0066_events_geo.sql)): `venue_id`,
  `manual_location_name`, `manual_location_address`, `has_location`, `num_courts`, `location_point geography`,
  `location_text`. CHECKs: `events_venue_xor_manual` (`venue_id is null or manual_location_name is null`),
  `events_standalone_private`.
- **Capacity** ([0044_events_helpers_rls.sql:120-125](../../../infra/supabase/migrations/0044_events_helpers_rls.sql)):
  `event_capacity = num_courts*4 + (allow_standby ? standby_spots : 0)`. Confirmed roster is enforced at join
  time, so lowering `num_courts` could strand confirmed main-roster players — hence the new guard.
- **`create_event` location encoding**
  ([0067_create_event_location.sql:51-69](../../../infra/supabase/migrations/0067_create_event_location.sql)):
  `location_point = st_setsrid(st_makepoint(lng,lat),4326)::geography` when both coords present;
  `location_text = nullif(p_payload->>'location_text','')`; `has_location` from payload.
- **Schemas** ([packages/api/src/schemas.ts](../../../packages/api/src/schemas.ts)): `createEventSchema` /
  `buildCreateEventPayload` carry `venueId`, `manualLocationName`, `manualLocationAddress`, `locationLat`,
  `locationLng`, `hasLocation`, `numCourts`, `thumbnailPath`; `buildCreateEventPayload` nulls the opposite side
  of the venue/manual XOR. `updateEventSchema` / `buildUpdateEventPayload` currently omit all of these.
- **`useUpdateEvent`** ([packages/api/src/events/mutations.ts](../../../packages/api/src/events/mutations.ts)):
  calls `update_event(p_event_id, p_payload)`; `mapPgError` KNOWN already has `not_editable`,
  `standby_below_roster`.
- **Edit screen** ([apps/mobile/app/event/[id]/edit.tsx](../../../apps/mobile/app/event/[id]/edit.tsx)): sections
  Details / Date & Time / Scoring / Preferences. Its draft already seeds `hasLocation`, `numCourts`,
  `manualLocationName`, `manualLocationAddress`, `venueId`, `locationLat/lng`, `thumbnailPath` from the row —
  but the save payload omits them.
- **Wizard steps**: `Step5Location` (venue search via `useSearchVenues` → `search_venues` RPC; manual
  name/address; `useMyLocation` reverse-geocode for coords) and `Step6Courts` (`CourtCounter`, min 1 / max 12)
  in [apps/mobile/components/event/wizard/steps/](../../../apps/mobile/components/event/wizard/steps/). Both
  operate on the wizard `draft` via `patch(...)`.
- **Storage helpers** ([apps/mobile/lib/storage.ts](../../../apps/mobile/lib/storage.ts)):
  `pickAndValidateImage() → PickedImage|null` (launches picker, validates ≤5MB + jpeg/png/webp) and
  `uploadCommunityImage(client, bucket, folderId, uri, mimeType) → path` (uploads to `{folderId}/{unique}.{ext}`),
  used by groups/communities/posts via the `ImagePickerRow` component
  ([apps/mobile/components/community/ImagePickerRow.tsx](../../../apps/mobile/components/community/ImagePickerRow.tsx)).
- **Buckets** ([0026_storage_buckets.sql](../../../infra/supabase/migrations/0026_storage_buckets.sql)):
  `community-thumbnails` write RLS is `is_community_admin((foldername)[1])` — admin-gated, **unusable for event
  organizers who aren't community admins**. The `avatars` bucket
  ([0056_profile_fields.sql](../../../infra/supabase/migrations/0056_profile_fields.sql)) uses own-folder RLS
  (`(storage.foldername(name))[1] = auth.uid()::text`) — the pattern to copy for a new `event-thumbnails` bucket.
- **Notifications** ([0061_notifications.sql](../../../infra/supabase/migrations/0061_notifications.sql),
  [0073_cancel_event.sql](../../../infra/supabase/migrations/0073_cancel_event.sql)): rows created only via
  SECURITY DEFINER code; current type CHECK list ends at `'event_cancelled'`. `event_cancelled` inserts for
  `event_participants` where `status='confirmed' and user_id is not null and user_id <> v_user`.
- Highest migration is **`0079`**; this slice uses **`0080`**.

## Architecture

### 1. Migration `0080_update_event_location.sql`

**Add the notification type:**
```sql
alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'event_invite','group_invite','community_invite',
  'community_request_accepted','follow','follow_joined_event','event_cancelled','event_updated'));
```

**Recreate `update_event`** (keep all existing behavior from 0078; add the parts below):
- New locals: `v_num_courts int`, `v_confirmed_main int`, `v_lat/v_lng`, `v_date_changed bool`,
  `v_loc_changed bool`.
- **Courts guard** (before the UPDATE), using the existing `v_ev` snapshot:
  ```sql
  v_num_courts := coalesce((p_payload->>'num_courts')::int, v_ev.num_courts);
  select count(*) into v_confirmed_main
    from event_participants where event_id = p_event_id and status='confirmed' and not is_standby;
  if v_num_courts * 4 < v_confirmed_main then
    raise exception 'courts_below_roster' using errcode='P0001';
  end if;
  ```
- **Change detection** (computed from `v_ev` vs payload, evaluated before/at UPDATE):
  ```sql
  v_date_changed := (p_payload->>'starts_at')::timestamptz is distinct from v_ev.starts_at;
  v_loc_changed :=
       nullif(p_payload->>'venue_id','')::uuid       is distinct from v_ev.venue_id
    or nullif(p_payload->>'manual_location_name','') is distinct from v_ev.manual_location_name
    or nullif(p_payload->>'manual_location_address','') is distinct from v_ev.manual_location_address;
  ```
- **Extend the UPDATE** with:
  ```sql
    venue_id                = nullif(p_payload->>'venue_id','')::uuid,
    manual_location_name    = nullif(p_payload->>'manual_location_name',''),
    manual_location_address = nullif(p_payload->>'manual_location_address',''),
    has_location            = coalesce((p_payload->>'has_location')::boolean, false),
    num_courts              = v_num_courts,
    location_point          = case
        when p_payload->>'location_lat' is not null and p_payload->>'location_lng' is not null
        then st_setsrid(st_makepoint((p_payload->>'location_lng')::float8,(p_payload->>'location_lat')::float8),4326)::geography
        else null end,
    location_text           = nullif(p_payload->>'location_text',''),
  ```
  (The client nulls the opposite side of the venue/manual XOR; `events_venue_xor_manual` backstops it.)
- **Re-notify** (after the UPDATE):
  ```sql
  if v_date_changed or v_loc_changed then
    insert into notifications (user_id, type, actor_id, event_id, actor_name, entity_name)
    select ep.user_id, 'event_updated', v_user, p_event_id,
           (select full_name from profiles where id = v_user), btrim(p_payload->>'name')
    from event_participants ep
    where ep.event_id = p_event_id and ep.status='confirmed'
      and ep.user_id is not null and ep.user_id <> v_user;
  end if;
  ```

`database.types.ts`: **no change** (signature unchanged).

**`event-thumbnails` bucket** (same migration 0080, mirroring `avatars` own-folder RLS):
```sql
insert into storage.buckets (id, name, public) values ('event-thumbnails','event-thumbnails', true)
  on conflict (id) do nothing;
-- Path convention: {auth.uid()}/...  (own-folder write, public read since the bucket is public)
create policy "event-thumb write: self" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "event-thumb update: self" on storage.objects for update to authenticated
  using (bucket_id = 'event-thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "event-thumb delete: self" on storage.objects for delete to authenticated
  using (bucket_id = 'event-thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);
```

### 2. `@padel/api`

- `updateEventSchema` — add `venueId`, `manualLocationName`, `manualLocationAddress`, `locationLat`,
  `locationLng`, `hasLocation`, `numCourts` (copy the field definitions + constraints from `createEventSchema`).
- `buildUpdateEventPayload` — encode them exactly as `buildCreateEventPayload` does: when `venueId` set, send
  `venue_id` and null `manual_location_*`; else send manual fields and null `venue_id`; pass `has_location`,
  `num_courts`, `location_lat`/`location_lng`, `location_text`.
- `client.ts` — add `'courts_below_roster'` to the events group of `mapPgError` KNOWN.

### 3. Mobile — `apps/mobile/app/event/[id]/edit.tsx`

- Add a **Location** section rendering `Step5Location` and a **Courts** section rendering `Step6Courts` over the
  existing draft (these already operate on draft via `patch`). Include the location + `numCourts` fields in the
  `updateEventSchema.safeParse` payload (currently omitted). Surface `courts_below_roster` inline (alongside the
  existing `standby_below_roster`/`not_editable`).
- Add a **thumbnail picker** row (`ImagePickerRow` + `pickAndValidateImage`). On Save, if a new local image was
  picked, upload via `uploadCommunityImage(client, 'event-thumbnails', <uid>, uri, mimeType)` → set the returned
  path as `thumbnailPath` in the payload; otherwise keep the existing `thumbnailPath`.
- i18n (`event` namespace, English-only — PT/PT-BR to A5): `courts_below_roster`, thumbnail picker labels,
  section titles if not already present.

### 4. Create-time thumbnail wiring

- Add the same thumbnail picker to the create wizard's details step (`Step9Details` or the details step that
  renders name/description). Store the picked image in the wizard draft (`thumbnail`/`thumbnailPath` already
  exist on `EventDraft`).
- In `apps/mobile/app/(tabs)/.../create/index.tsx` `finalize()`: if an image was picked, upload via
  `uploadCommunityImage(client, 'event-thumbnails', <uid>, uri, mimeType)` → include the returned path as
  `thumbnailPath` in the create payload. (`createEventSchema`/`buildCreateEventPayload` already carry it.)

### 5. `event_updated` notification rendering

- Add `event_updated` copy to the `notifications` namespace (English block) so the inbox renders a real string,
  matching how `event_cancelled` was added in 5G-6.

## Error handling

- `update_event` raises `courts_below_roster` (P0001, new) alongside the existing
  `forbidden`/`not_editable`/`standby_below_roster`/`name_required` → `mapPgError` → inline error.
- `events_venue_xor_manual` CHECK backstops a bad venue/manual combo slipping past the client → generic error;
  the client encodes the XOR so this is only a defense.
- Thumbnail upload failure → surfaced inline; the event update is **not** attempted with a half-uploaded path
  (upload first, then build the payload).

## Testing / verification

- **DB:** `db reset` clean; extend `infra/supabase/tests/update_event.sql` (or add
  `infra/supabase/tests/update_event_location.sql`) → `OK …`:
  - manual→venue and venue→manual location updates persist (and null the opposite column); coords write
    `location_point`.
  - `num_courts` update persists; lowering `num_courts` so `num_courts*4 < confirmed-non-standby count` raises
    `courts_below_roster`.
  - `event_updated` notifications: inserted for confirmed non-organizer participants when `starts_at` changes;
    inserted when only location changes; **not** inserted when neither date nor location changed (e.g. a
    name-only edit).
- **Types/API:** `pnpm -w typecheck` (13/13); `pnpm --filter @padel/api test`.
- **App smoke (simulator):** edit a scheduled event's venue/manual location, court count, and thumbnail → detail
  reflects all three; lowering courts below the confirmed roster is blocked; a confirmed participant gets an
  "event updated" notification after a date or location edit; creating a new event with a thumbnail shows it on
  the detail/cards.

## Conventions followed

Additive migration `0080`; RPC `security definer set search_path = public` + grant (recreate, preserving 0078
behavior); SQL test `PT001`/`OK`; thin `@padel/api` schema + payload builder mirroring the create equivalents;
`mapPgError` allow-list; `useT('event')`/`useT('notifications')`; reuse `Step5Location`/`Step6Courts`/
`CourtCounter`/`useSearchVenues`/`ImagePickerRow`/`pickAndValidateImage`/`uploadCommunityImage`; new public
`event-thumbnails` bucket with own-folder RLS (avatar pattern), foldered by user id for both create and edit.
`event_type`/`specification`/`group_id`/`series` remain immutable.
