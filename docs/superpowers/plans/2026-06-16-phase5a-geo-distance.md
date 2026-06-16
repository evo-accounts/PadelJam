# Phase 5A — Geo Foundation + Distance Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give events coordinates + a viewer-distance helper, rank Explore/Home event suggestions by proximity, and show "X km away" on event cards.

**Architecture:** A migration adds `events.location_point`/`location_text` + a null-safe `viewer_distance_m(geography)` SQL helper and rewrites `explore_events` to return `(event, distance_m)` ordered distance-first. The discovery hooks flatten the composite to an event row + `distance_m`; `EventCard` renders the distance label.

**Tech Stack:** Supabase Postgres + PostGIS (geography, ST_Distance), `@padel/api` (TanStack Query), React Native, `@padel/i18n`.

**Spec:** `docs/superpowers/specs/2026-06-16-phase5a-geo-distance-design.md`

**Verification posture:** SQL tests + `pnpm --filter @padel/api test` + `pnpm -w typecheck`; simulator smoke for the card label.

**Verified context:** PostGIS on; `profiles.location_point geography(point)` set via `set_my_location` (SRID-4326). `explore_events` (`0052_explore_rpcs.sql`) returns `setof events`, public group-events only, ordered `starts_at asc, same-country desc`; consumed by `useExploreEvents` (rail), `useExploreEventsList` (see-all), and Home suggestions. `EventCard` ( `apps/mobile/components/event/EventCard.tsx`) prop `event: EventRow`.

---

## File Structure
- **Create** `infra/supabase/migrations/0066_events_geo.sql` — events geo cols + `viewer_distance_m` + rewrite `explore_events`.
- **Create** `infra/supabase/tests/events_geo.sql` — `viewer_distance_m` null-safety/correctness + `explore_events` ordering.
- **Modify** `packages/db/src/database.types.ts` — events Row/Insert/Update gain geo cols; `explore_events` Returns becomes composite.
- **Modify** `packages/api/src/discovery/queries.ts` — flatten `(event, distance_m)` in `useExploreEvents` + `useExploreEventsList`.
- **Modify** `apps/mobile/components/event/EventCard.tsx` — distance label + prop type.
- **Modify** `apps/mobile/lib/i18n-mobile.ts` — `discovery` distance keys.

---

## Task 1: migration — events geo + distance helper + explore_events rewrite

**Files:**
- Create: `infra/supabase/migrations/0066_events_geo.sql`
- Create: `infra/supabase/tests/events_geo.sql`
- Modify: `packages/db/src/database.types.ts`

- [ ] **Step 1: Write the migration**

Create `infra/supabase/migrations/0066_events_geo.sql`:

```sql
-- 0066_events_geo.sql
-- Events coordinates + a viewer-distance helper; rank explore_events by proximity. (Phase 5A)
alter table events add column location_point geography(point);
alter table events add column location_text text;

-- Distance in metres from the caller's profile location to p. NULL-safe: returns NULL if p is null
-- OR the caller has no location (st_distance is NULL when either operand is null).
create or replace function viewer_distance_m(p geography) returns double precision
language sql stable security definer set search_path = public as $$
  select case
    when p is null then null
    else st_distance((select location_point from profiles where id = auth.uid()), p)
  end;
$$;
grant execute on function viewer_distance_m(geography) to authenticated;

-- explore_events: now returns the event + distance, ranked nearest-first then soonest.
-- Return type changes (was: setof events), so drop + recreate.
drop function if exists explore_events(int, int);
create function explore_events(p_limit int default 10, p_offset int default 0)
returns table (event events, distance_m double precision)
language sql stable security definer set search_path = public as $$
  select e::events as event, viewer_distance_m(e.location_point) as distance_m
  from events e
  join groups g on g.id = e.group_id
  join communities c on c.id = g.community_id
  join tenants t on t.id = c.tenant_id
  where e.deleted_at is null
    and e.status = 'scheduled'
    and e.starts_at >= now()
    and e.is_private = false
    and e.group_id is not null
    and g.archived_at is null
    and c.archived_at is null
    and g.is_private = false
    and (
      c.privacy = 'public'
      or c.tenant_id in (select tm.tenant_id from tenant_memberships tm where tm.user_id = auth.uid())
    )
    and auth.uid() is not null
    and e.organizer_id <> auth.uid()
    and not exists (
      select 1 from event_participants ep where ep.event_id = e.id and ep.user_id = auth.uid()
    )
  order by
    viewer_distance_m(e.location_point) asc nulls last,
    e.starts_at asc,
    (t.country = any (
      select tt.country from tenant_memberships tm
      join tenants tt on tt.id = tm.tenant_id where tm.user_id = auth.uid()
    )) desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;
grant execute on function explore_events(int, int) to authenticated;
```

- [ ] **Step 2: Hand-add the types**

In `packages/db/src/database.types.ts`:
- In the `events` table `Row`, add `location_point: string | null` and `location_text: string | null`; in `Insert`/`Update` add `location_point?: string | null` and `location_text?: string | null`. (Geography serialises opaquely; the client never reads `location_point`, so `string | null` is a safe placeholder type.)
- Replace the `explore_events` Functions entry's `Returns` with the composite shape:

```ts
      explore_events: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: { event: Database['public']['Tables']['events']['Row']; distance_m: number | null }[]
      }
```
(If the file references the events Row type differently, match its convention — the point is `Returns` is an array of `{ event: <events Row>; distance_m: number | null }`.)

- [ ] **Step 3: Write the SQL test**

Create `infra/supabase/tests/events_geo.sql`:

```sql
-- events_geo: viewer_distance_m null-safety + monotonicity; explore_events ranks nearest-first, nulls last.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('fa000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','geo1@x.com'),
  ('fa000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','geo2@x.com')
  on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('fa000001-0000-0000-0000-000000000001','geo1@x.com','+351900080001','Viewer Geo'),
  ('fa000002-0000-0000-0000-000000000002','geo2@x.com','+351900080002','Organizer Geo')
  on conflict do nothing;

do $$
declare v constant uuid := 'fa000001-0000-0000-0000-000000000001';   -- viewer
  o constant uuid := 'fa000002-0000-0000-0000-000000000002';          -- organizer (different user)
  v_tenant uuid; v_comm uuid; v_group uuid;
  e_near uuid; e_far uuid; e_null uuid;
  -- Lisbon ~ (38.72, -9.14). near ~ same; far ~ Porto (41.15, -8.61).
  near_pt geography := st_setsrid(st_makepoint(-9.14, 38.72), 4326)::geography;
  far_pt  geography := st_setsrid(st_makepoint(-8.61, 41.15), 4326)::geography;
  d_near double precision; d_far double precision; d_nullarg double precision;
  v_rows uuid[];
begin
  -- Viewer's home location = Lisbon.
  update profiles set location_point = st_setsrid(st_makepoint(-9.14, 38.72), 4326)::geography where id = v;

  -- viewer_distance_m: null arg -> null; near < far; (acting as viewer)
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v), true);
  select viewer_distance_m(null) into d_nullarg;
  if d_nullarg is not null then raise exception using errcode='PT001', message='viewer_distance_m(null) not null'; end if;
  select viewer_distance_m(near_pt) into d_near;
  select viewer_distance_m(far_pt) into d_far;
  if d_near is null or d_far is null or not (d_near < d_far) then
    raise exception using errcode='PT001', message=format('distance order wrong near=%s far=%s', d_near, d_far); end if;

  -- Public community + public group + a far, near, and null-coord upcoming event by organizer o.
  insert into tenants (type, name, country) values ('community','Geo Tenant','PT') returning id into v_tenant;
  insert into communities (tenant_id, name, type, privacy) values (v_tenant,'Geo Community','club','public') returning id into v_comm;
  insert into groups (community_id, name) values (v_comm,'Geo Group') returning id into v_group;
  insert into events (organizer_id, group_id, event_type, specification, scoring_mode, scoring_value,
                      manual_location_name, has_location, num_courts, is_private, starts_at,
                      duration_minutes, organizer_role, name, status, location_point)
    values (o, v_group,'americano','mixed','points',24,'Far',true,2,false, now()+interval '2 days',
            90,'organizing_and_playing','Far Event','scheduled', far_pt) returning id into e_far;
  insert into events (organizer_id, group_id, event_type, specification, scoring_mode, scoring_value,
                      manual_location_name, has_location, num_courts, is_private, starts_at,
                      duration_minutes, organizer_role, name, status, location_point)
    values (o, v_group,'americano','mixed','points',24,'Near',true,2,false, now()+interval '3 days',
            90,'organizing_and_playing','Near Event','scheduled', near_pt) returning id into e_near;
  insert into events (organizer_id, group_id, event_type, specification, scoring_mode, scoring_value,
                      manual_location_name, has_location, num_courts, is_private, starts_at,
                      duration_minutes, organizer_role, name, status)
    values (o, v_group,'americano','mixed','points',24,'Nul',true,2,false, now()+interval '1 day',
            90,'organizing_and_playing','Null Event','scheduled') returning id into e_null;

  -- explore_events (as viewer): near first, far second, null-coord last — despite null being soonest.
  select array_agg((event).id order by ord) into v_rows
    from (select event, row_number() over () as ord from explore_events(10, 0)) s;
  if v_rows[1] <> e_near or v_rows[2] <> e_far or v_rows[3] <> e_null then
    raise exception using errcode='PT001', message=format('explore order wrong: %s (want near,far,null = %s,%s,%s)', v_rows, e_near, e_far, e_null); end if;

  raise notice 'OK events_geo';
end $$;
rollback;
```

> If the `events`/`communities`/`groups`/`tenants` inserts hit a constraint, read the failing column from the psql error and add a valid value (these mirror the working `chat_channel_spec.sql` / `my_groups.sql` test inserts). `explore_events` returns rows ordered, but `array_agg(... order by ord)` preserves the function's output order via the `row_number()` subquery.

- [ ] **Step 4: Run migration + test**

```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/events_geo.sql
```
Expected: `NOTICE: OK events_geo`, no `PT001`.

- [ ] **Step 5: Typecheck db**

Run: `pnpm --filter @padel/db typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add infra/supabase/migrations/0066_events_geo.sql infra/supabase/tests/events_geo.sql packages/db/src/database.types.ts
git commit -m "feat(geo): events location_point + viewer_distance_m + distance-ranked explore_events"
```

---

## Task 2: flatten the composite in the discovery hooks

**Files:**
- Modify: `packages/api/src/discovery/queries.ts`

- [ ] **Step 1: Flatten in `useExploreEvents` (rail)**

In `packages/api/src/discovery/queries.ts`, change the `useExploreEvents` queryFn return to flatten the new composite into an event row + `distance_m`:

```ts
      const { data, error } = await db.rpc('explore_events', { p_limit: RAIL_LIMIT, p_offset: 0 });
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r.event, distance_m: r.distance_m }));
```

- [ ] **Step 2: Flatten in `useExploreEventsList` (see-all)**

Find `useExploreEventsList` (the `useInfiniteQuery` for events) in the same file and apply the same map to its queryFn:

```ts
      const { data, error } = await db.rpc('explore_events', { p_limit: PAGE_SIZE, p_offset: offset as number });
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r.event, distance_m: r.distance_m }));
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @padel/api typecheck`
Expected: PASS. (`r.event` is the events Row, `r.distance_m` is `number | null`, per the Task 1 types. If `getNextPageParam`/`nextOffset` types complain about the new element shape, they only use `length`, so no change needed.)

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/discovery/queries.ts
git commit -m "feat(api): flatten explore_events (event,distance_m) in discovery hooks"
```

---

## Task 3: EventCard distance label + i18n

**Files:**
- Modify: `apps/mobile/components/event/EventCard.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: Add i18n keys**

In `apps/mobile/lib/i18n-mobile.ts`, add to the `discovery` namespace's `en` object:

```ts
    distanceKm: '{{km}} km away',
    distanceNear: 'Nearby',
```
(If the `discovery` namespace object is small/located elsewhere, add the keys to it wherever it's defined; it's registered via `registerMobileCopy`.)

- [ ] **Step 2: Render the distance label on the card**

In `apps/mobile/components/event/EventCard.tsx`, widen the prop type to carry the optional distance and render a label when present. Change the component signature + add the label:

```tsx
import { useT } from '@padel/i18n';
// ...
export function EventCard({
  event,
  onPress,
}: {
  event: EventRow & { distance_m?: number | null };
  onPress: () => void;
}) {
  const { t } = useT('discovery');
  const distance =
    event.distance_m == null
      ? null
      : event.distance_m < 1000
        ? t('distanceNear')
        : t('distanceKm', { km: (event.distance_m / 1000).toFixed(1) });
  // ...existing render; add, near the meta row:
  // {distance ? <Text style={styles.distance}>{distance}</Text> : null}
}
```
Add a `distance` style (muted, small) to the card's `StyleSheet` (e.g. `{ fontSize: 12, color: '#6B7685', marginTop: 2 }`). Place the `{distance ? ... : null}` line within the existing card body where the date/meta text renders. If `EventCard` already imports `useT` for a different namespace, add a second `useT('discovery')` call or reuse with `{ ns: 'discovery' }` on the `t` calls.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: PASS. (The widened prop accepts both the explore rows — which now carry `distance_m` — and the group-events rows that don't, since `distance_m` is optional. The explore see-all screen passes `event={item as never}`, so it remains compatible.)

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/event/EventCard.tsx apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): show distance on event cards"
```

---

## Verification gate (whole phase)

```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/events_geo.sql   # OK events_geo
pnpm --filter @padel/api test
pnpm -w typecheck
```

---

## Self-Review

**Spec coverage:**
- `events.location_point` + `location_text` → Task 1. ✓
- `viewer_distance_m` null-safe helper → Task 1 (+ test). ✓
- `explore_events` returns `(event, distance_m)`, distance-primary then soonest, nulls last → Task 1 (+ ordering test). ✓
- Hooks flatten composite (rail + see-all; Home reuses the rail) → Task 2. ✓
- `EventCard` shows "X km away" → Task 3. ✓
- i18n distance keys → Task 3. ✓
- Events-only / venues deferred / capture in 5D → respected (no venue/group/community changes; existing events null = rank last). ✓

**Placeholder scan:** none — complete SQL/TS in every code step.

**Type consistency:** `explore_events` Returns `{ event: events Row; distance_m: number|null }[]` (Task 1) matches the hooks' `r.event`/`r.distance_m` flatten (Task 2) and `EventCard`'s `EventRow & { distance_m?: number|null }` (Task 3). `viewer_distance_m(geography)` signature consistent across helper + `explore_events` ordering + test. SRID-4326 geography matches `set_my_location`.

**Known edge:** geography `location_point` typed `string | null` in db types is a placeholder (opaque serialisation); the client never reads it, only `distance_m`. The `drop function explore_events(int,int)` before recreate is required because the return type changes.
