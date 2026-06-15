-- 0064_my_groups.sql
-- The caller's groups across all communities (active groups only), for the Home
-- "My groups" preview + the Your-Groups list. (Phase 3)
create or replace function my_groups()
returns table (
  group_id       uuid,
  name           text,
  community_id   uuid,
  community_name text,
  member_count   integer
)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, c.id, c.name,
         (select count(*)::int from group_members gm2 where gm2.group_id = g.id)
  from group_members gm
  join groups g      on g.id = gm.group_id and g.archived_at is null
  join communities c on c.id = g.community_id
  where gm.user_id = auth.uid()
  order by g.name;
$$;
grant execute on function my_groups() to authenticated;
