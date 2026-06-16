# Phase 5A — Geo Foundation + Distance Ranking — Design

*Padel Jam • 2026-06-16 • Brainstormed design / spec*

## Goal

Close the deferred 0B-DB geo work: give **events** coordinates, add a reusable viewer-distance
helper, and rank the Explore/Home event suggestions by proximity — showing "X km away" on event
cards. Distance applies to **events only** (venues/groups/communities geo + a Places API are
deferred). First slice of Phase 5.

## Scope decisions (from the Phase 5 plan + 5A brainstorm)
1. **Ranking: distance-primary, then soonest.** Order upcoming public events by nearest-first, then
   by start time, then the existing same-country signal. **Rank, don't gate** — events with no
   coordinates (or when the viewer has no location) rank last, never disappear (coords are sparse at
   first).
2. **Display distance now** — event cards show "X km away" when a distance is available. This requires
   `explore_events` to return the event **plus** a `distance_m`.
3. **Events only** — `venues`/`groups`/`communities` get no geo this slice; venue search stays a name
   ILIKE; a Places/Maps API is deferred.
4. **Capture is 5D's job** — 5A adds the `events.location_point` column + ranking; the create-event
   location step (5D) writes coords. Existing events stay null (rank last) until recreated/edited.

## Verified context
- PostGIS is enabled (`0001_extensions.sql`); `profiles.location_point geography(point)` exists, set
  via `set_my_location` using `st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography` (SRID-4326).
- `explore_events` (`0052_explore_rpcs.sql`) currently `returns setof events`, filters to upcoming
  public **group** events (`group_id is not null`, `is_private=false`, viewer not organizer/participant),
  orders `starts_at asc, same-country desc`. It backs the Explore rail (`useExploreEvents`), the
  see-all list (`useExploreEventsList`), and the **Home empty-state suggestions** (Phase 3 reuses the rail).
- `EventCard` (`apps/mobile/components/event/EventCard.tsx`) takes an `event` row + `onPress`.

## Architecture

### Migration `0066_events_geo.sql`
```sql
alter table events add column location_point geography(point);
alter table events add column location_text text;

-- Distance in metres from the caller's profile location to p; NULL if either is null.
create or replace function viewer_distance_m(p geography) returns double precision
language sql stable security definer set search_path = public as $$
  select case
    when p is null then null
    else st_distance((select location_point from profiles where id = auth.uid()), p)
  end;  -- st_distance returns NULL if the viewer's location_point is null → null-safe
$$;
grant execute on function viewer_distance_m(geography) to authenticated;

-- explore_events now returns the event + distance, ranked distance-first.
create or replace function explore_events(p_limit int default 10, p_offset int default 0)
returns table (event events, distance_m double precision)
language sql stable security definer set search_path = public as $$
  select e::events as event, viewer_distance_m(e.location_point) as distance_m
  from events e
  join groups g on g.id = e.group_id
  join communities c on c.id = g.community_id
  join tenants t on t.id = c.tenant_id
  where e.deleted_at is null and e.status = 'scheduled' and e.starts_at >= now()
    and e.is_private = false and e.group_id is not null
    and g.archived_at is null and c.archived_at is null and g.is_private = false
    and (c.privacy = 'public' or c.tenant_id in (
      select tm.tenant_id from tenant_memberships tm where tm.user_id = auth.uid()))
    and auth.uid() is not null and e.organizer_id <> auth.uid()
    and not exists (select 1 from event_participants ep where ep.event_id = e.id and ep.user_id = auth.uid())
  order by
    viewer_distance_m(e.location_point) asc nulls last,
    e.starts_at asc,
    (t.country = any (select tt.country from tenant_memberships tm
       join tenants tt on tt.id = tm.tenant_id where tm.user_id = auth.uid())) desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;
grant execute on function explore_events(int, int) to authenticated;
```
(Keep the `create or replace` for `explore_events` in `0066` so the new return type supersedes `0052`'s.
Note: changing a function's return type requires `drop function explore_events(int,int)` first if
Postgres rejects the `create or replace` — include the drop+recreate+grant if needed.)

- **SQL test** (`infra/supabase/tests/events_geo.sql`): seed a viewer with a known location + two
  events (near + far, with coords) + one with null coords; assert `viewer_distance_m` is null-safe and
  monotonic, and that `explore_events` orders near < far < null. `PT001` sentinel; `OK events_geo`.
- Hand-add to `database.types.ts`: `events` Row/Insert/Update gain `location_point: unknown | null`
  (geography serialises opaquely — type as `string | null` or `unknown`) + `location_text: string | null`;
  the `explore_events` function `Returns` becomes `{ event: <events Row>; distance_m: number | null }[]`.

### `@padel/api` (`packages/api/src/discovery/queries.ts`)
- `useExploreEvents` + `useExploreEventsList` map each row → `{ ...row.event, distance_m: row.distance_m }`
  (a flat event-shaped object with an added `distance_m`), so consumers keep using an event row and can
  read `distance_m`. Adjust the return typing accordingly.

### Mobile
- **`EventCard`**: when `event.distance_m != null`, render a small muted "X km away" label
  (`metres → km`, 1 decimal; "<1 km" under 1000 m). No other layout change. Reads `distance_m` off the
  passed row (present from the explore hooks; absent elsewhere → no label).
- **i18n** (`discovery` namespace): `distanceKm` (e.g. `'{{km}} km away'`) + `distanceNear` (`'Nearby'`
  or `'<1 km'`).

## Error handling / edge cases
- Viewer with no location → all `distance_m` null → list falls back to soonest-first (current behaviour); no card shows a distance label.
- `st_distance` on geography returns metres; null if either operand null (the `case` guards `p`, and a
  null viewer location makes `st_distance` null) — fully null-safe.
- Existing events (null coords) always sort last and show no label.

## Explicitly deferred
- Venue/group/community coordinates + a Places/Maps API + venue-proximity search.
- Distance display anywhere other than event cards; distance on standalone events (not in `explore_events`).
- Recompute/backfill of coords for historical events.

## Conventions followed
Additive migration `0066`; `security definer set search_path = public` + grants; SQL test with
`set_config`/`PT001`/`OK`; hand-edited `database.types.ts`; thin discovery hooks; `useT('discovery')`;
SRID-4326 geography mirroring `set_my_location`.
