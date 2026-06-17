-- Wire up the deferred FK now that events exists (no result posts exist yet, so this is safe).
alter table community_posts
  add constraint community_posts_result_event_id_fkey
  foreign key (result_event_id) references events(id) on delete cascade;

create or replace function post_event_result(p_event_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_community uuid; v_post uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.status <> 'completed' then raise exception 'not_completed' using errcode='P0001'; end if;
  v_community := event_group_community(p_event_id);
  if v_community is null then raise exception 'no_community' using errcode='P0001'; end if;
  if exists (select 1 from community_posts where result_event_id = p_event_id) then
    raise exception 'already_posted' using errcode='P0001'; end if;

  insert into community_posts (community_id, author_id, kind, result_event_id)
  values (v_community, v_user, 'result', p_event_id)
  returning id into v_post;
  return v_post;
end; $$;

create or replace function event_result_summary(p_event_id uuid)
returns table (rank int, name text, points int)
language sql stable security definer set search_path = public as $$
  select s.rank,
         coalesce(pr.full_name, ep.guest_name, '—') as name,
         s.points
  from standings(p_event_id) s
  join event_participants ep on ep.id = s.entity_id
  left join profiles pr on pr.id = ep.user_id
  where event_group_community(p_event_id) is not null
    and is_community_member(event_group_community(p_event_id))
  order by s.rank asc, name asc;
$$;

grant execute on function post_event_result(uuid), event_result_summary(uuid) to authenticated;
