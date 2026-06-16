-- 0068_groups_gaps.sql
-- my_groups.is_managing (GR-12 tabs) + add_group_admins (GR-40 sole-admin-leave). (Phase 5E-1)
drop function if exists my_groups();
create function my_groups()
returns table (
  group_id       uuid,
  name           text,
  community_id   uuid,
  community_name text,
  member_count   integer,
  is_managing    boolean
)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, c.id, c.name,
         (select count(*)::int from group_members gm2 where gm2.group_id = g.id),
         is_group_admin(g.id, auth.uid())
  from group_members gm
  join groups g      on g.id = gm.group_id and g.archived_at is null
  join communities c on c.id = g.community_id
  where gm.user_id = auth.uid()
  order by g.name;
$$;
grant execute on function my_groups() to authenticated;

-- Add community admins (of the group's community) to a group, so they can manage it. Caller must be
-- a group admin; only community owner/admins are eligible. (GR-40 sole-admin-leave resolution.)
create or replace function add_group_admins(p_group_id uuid, p_user_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_comm uuid;
begin
  if not is_group_admin(p_group_id, v_uid) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select community_id into v_comm from groups where id = p_group_id;
  insert into group_members (group_id, user_id)
    select p_group_id, u from unnest(p_user_ids) u
    where exists (
      select 1 from community_members cm
      where cm.community_id = v_comm and cm.user_id = u and cm.role in ('owner','admin'))
  on conflict do nothing;
end; $$;
grant execute on function add_group_admins(uuid, uuid[]) to authenticated;
