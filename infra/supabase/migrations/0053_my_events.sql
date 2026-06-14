-- "My events": the viewer's UPCOMING events — ones they organize, or ones they are a
-- confirmed ('going') participant in. SECURITY DEFINER (no RLS inside the function); it only
-- ever returns events the viewer organizes or already joined, so both are inherently theirs
-- to see (no broader visibility re-derivation needed, unlike the explore discovery RPCs).
-- p_filter: 'all' (default) | 'organizing' | 'going'. Unknown values are treated as 'all'.
-- Same (p_filter, p_limit, p_offset) shape powers the tab's paged infinite list.
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
    and ((e.status = 'scheduled' and e.starts_at >= now()) or e.status = 'in_progress')
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
