-- my_events dropped a scheduled event the instant its start time passed.
--
-- The filter was `(status = 'scheduled' and starts_at >= now()) or status = 'in_progress'`,
-- and nothing moves an event to 'in_progress' except the organizer explicitly calling
-- start_event (0048_match_engine_rpcs.sql) — there is no cron sweeping start times. So the
-- 19:00 event vanished from the organizer's own Events tab at 19:00:00, which is the exact
-- minute they open that tab to start it. The only way back was to already be on the event
-- screen, i.e. to have deep-linked past the list that no longer showed it.
--
-- Fix: a scheduled event stays visible for its whole booked slot plus a grace window.
--
-- Why `starts_at + duration` and not a flat interval from `starts_at`: the slot length is
-- already recorded per event, and it is what "is this event still happening?" actually means.
-- A flat three-hour window would evict a six-hour tournament halfway through while keeping a
-- 30-minute knockabout around long after everyone went home. Duration-aware gets both right
-- without a second tuning knob.
--
-- Why three hours on top: courts overrun, organizers start late, and the tab has to survive
-- both. Three hours keeps an evening event present for the rest of that evening and gone by
-- the next morning, so a never-started event ages out on its own rather than accumulating
-- forever in a list of things you are supposedly about to do.
--
-- 'in_progress' stays unconditional: an event someone actually started is live until it is
-- finished, however long that takes, and hiding it would strand the organizer mid-match.
--
-- Ordering is unchanged (`starts_at asc`), which puts a just-started event at the TOP of the
-- list — where the organizer looking for it expects it.
create or replace function my_events(
  p_filter text default 'all',
  p_limit  int  default 20,
  p_offset int  default 0
)
returns setof events
language sql stable security definer set search_path = public as $$
  select e.*
  from events e
  cross join lateral (
    select case when p_filter in ('organizing','going') then p_filter else 'all' end as f
  ) nf
  where e.deleted_at is null
    and (
      e.status = 'in_progress'
      or (
        e.status = 'scheduled'
        and e.starts_at + make_interval(mins => e.duration_minutes) + interval '3 hours' >= now()
      )
    )
    and (
      (nf.f in ('all','organizing') and e.organizer_id = auth.uid())
      or
      (nf.f in ('all','going') and exists (
        select 1 from event_participants ep
        where ep.event_id = e.id
          and ep.user_id = auth.uid()
          and ep.status = 'confirmed'
      ))
    )
  order by e.starts_at asc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

grant execute on function my_events(text, int, int) to authenticated;

comment on function my_events(text, int, int) is
  'The viewer''s current events: organized or confirmed-going, still scheduled (through the booked slot plus a 3h grace window) or in progress. Ordered starts_at asc, so an event whose start time has just passed sits at the top.';
