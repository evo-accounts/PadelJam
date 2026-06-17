-- 5G-6 (JM-34 / §4.9b): organizer cancels an event (standard or recurring). Notifies confirmed members.

-- Extend the notifications type domain with 'event_cancelled' (preserve all existing values from 0061).
alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'event_invite','group_invite','community_invite',
  'community_request_accepted','follow','follow_joined_event','event_cancelled'));

create or replace function cancel_event(p_event_id uuid, p_scope text default 'only_this') returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_actor text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'not_cancellable' using errcode='P0001'; end if;
  if p_scope not in ('only_this','this_and_upcoming') then raise exception 'invalid_scope' using errcode='P0001'; end if;

  select full_name into v_actor from profiles where id = v_user;

  -- this event
  update events set status='cancelled' where id = p_event_id;
  insert into notifications (user_id, type, actor_id, event_id, actor_name, entity_name)
  select ep.user_id, 'event_cancelled', v_user, p_event_id, v_actor, v_ev.name
  from event_participants ep
  where ep.event_id = p_event_id and ep.status='confirmed'
    and ep.user_id is not null and ep.user_id <> v_user;

  -- recurring: cancel siblings at/after this one, then deactivate the series
  if p_scope = 'this_and_upcoming' and v_ev.series_id is not null then
    insert into notifications (user_id, type, actor_id, event_id, actor_name, entity_name)
    select ep.user_id, 'event_cancelled', v_user, e.id, v_actor, e.name
    from events e
    join event_participants ep on ep.event_id = e.id
    where e.series_id = v_ev.series_id and e.status='scheduled'
      and e.starts_at >= v_ev.starts_at and e.id <> p_event_id
      and ep.status='confirmed' and ep.user_id is not null and ep.user_id <> v_user;
    update events set status='cancelled'
      where series_id = v_ev.series_id and status='scheduled'
        and starts_at >= v_ev.starts_at and id <> p_event_id;
    update event_series set is_active=false, deleted_at=now() where id = v_ev.series_id;
  end if;
end; $$;

grant execute on function cancel_event(uuid, text) to authenticated;
