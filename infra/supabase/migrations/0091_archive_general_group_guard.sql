-- CM-05 / communities.md line 11: the general group cannot be archived while it is the
-- community's only active group. archive_community is untouched: it archives everything at once.
create or replace function archive_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_community uuid; v_general boolean;
begin
  if not is_group_admin(p_group_id, auth.uid()) then raise exception 'forbidden' using errcode='P0001'; end if;
  select community_id, is_general into v_community, v_general from groups where id = p_group_id;
  if v_general and not exists (
      select 1 from groups g
      where g.community_id = v_community and g.id <> p_group_id and g.archived_at is null)
  then
    raise exception 'general_group_only_group' using errcode='P0001';
  end if;
  update groups set archived_at = now() where id = p_group_id and archived_at is null;
end; $$;
