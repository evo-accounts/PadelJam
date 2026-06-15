-- 0065_chat_channel_spec.sql
-- Authorizes a caller for a group/event chat and returns its Stream channel spec
-- (name + member ids). Used by the ensure-channel edge function. (Phase 4B)
create or replace function chat_channel_spec(p_kind text, p_id uuid)
returns table (name text, member_ids uuid[])
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_private boolean; v_group uuid;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = 'P0001'; end if;

  if p_kind = 'group' then
    if not exists (select 1 from group_members where group_id = p_id and user_id = v_uid) then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;
    return query
      select g.name,
             (select coalesce(array_agg(gm.user_id), '{}'::uuid[])
                from group_members gm where gm.group_id = p_id)
      from groups g where g.id = p_id;

  elsif p_kind = 'event' then
    select e.is_private, e.group_id into v_private, v_group
      from events e where e.id = p_id and e.deleted_at is null;
    if not found then raise exception 'event_not_found' using errcode = 'P0001'; end if;
    -- Only private or standalone (group-less) events have their own chat.
    if not (v_private or v_group is null) then raise exception 'no_chat' using errcode = 'P0001'; end if;
    if not (exists (select 1 from event_participants where event_id = p_id and user_id = v_uid)
            or exists (select 1 from events where id = p_id and organizer_id = v_uid)) then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;
    return query
      select e.name,
             (select coalesce(array_agg(ep.user_id), '{}'::uuid[])
                from event_participants ep where ep.event_id = p_id and ep.user_id is not null)
      from events e where e.id = p_id;

  else
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;
end; $$;
grant execute on function chat_channel_spec(text, uuid) to authenticated;
