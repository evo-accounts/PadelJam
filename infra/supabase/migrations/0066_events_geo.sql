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
