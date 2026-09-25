-- 0108_group_departures_archive.sql
--
-- UX Audit — Groups, plan PR 2 (docs/audit/2026-09-25-ux-groups-plan.md: decision 2, bug B6, and
-- the reads Your Groups needs).
--
-- 1. Departures (decision 2, UX-GRP-06/07/15). Someone who leaves a group stays in its history —
--    member list, ranking, past events — in greyscale with a "No longer in group" tag. Their
--    results were never deleted, so the ranking already kept them; what was missing is knowing
--    they left, and the member list had no way to show them at all. `group_departures` records it.
--    Rejoining in the same season restores their points for free (results are keyed by user).
--
--    Written by a TRIGGER on group_members, not by leave_group / remove_group_member, because
--    those are not the only exits: remove_member (community removal) and leave_community delete
--    group rows too, and a departure recorded on two paths out of four is a list that lies.
--    Joining (any path) deletes the departure.
--
--    Not a `left_at` on group_members: that column would have to be threaded through every
--    membership helper, RLS policy, the chat channel spec and every count, where forgetting one
--    silently re-admits the departed.
--
-- 2. group_member_list(g): current members and departed ones in one read, with is_member. Visible
--    to whoever may see the group's members today (group members, community admins) AND — new —
--    to community members of a PUBLIC group, whose preview shows the avatars (UX-GRP-02). Blocks
--    are symmetric, as everywhere but explore_players.
--
-- 3. archive_group (B6). The confirm has always said archiving cancels the upcoming events; it
--    cancelled none. It now cancels every scheduled future event of the group (notifying confirmed
--    players exactly as cancel_event does — cancel_event itself is organizer-only, and the admin
--    archiving need not be the organizer) and retires the group's series. And the "never without
--    a group" guard covers WHICHEVER group is the last active one (UX-GRP-01/10/14), not only the
--    general group: the error is now `last_active_group`.
--
-- 4. my_groups gains the fields Your Groups' cards need (UX-GRP-03) and, for yourself only, an
--    opt-in for the archived groups you administer. The profile's call is unchanged.
--
-- HOSTED: paste as one script, after 0107. The backfill in §1 is empty by construction (nobody has
-- a recorded departure yet — leaving deleted the row and kept nothing). Probe afterwards:
--   select to_regclass('group_departures') is not null
--      and to_regprocedure('group_member_list(uuid)') is not null
--      and to_regprocedure('my_groups(uuid,boolean)') is not null
--      and pg_get_functiondef('archive_group(uuid)'::regprocedure) like '%last_active_group%' as has_0108;

------------------------------------------------------------------------------
-- 1. Departures
------------------------------------------------------------------------------
create table group_departures (
  group_id uuid not null references groups(id) on delete cascade,
  user_id  uuid not null references profiles(id) on delete cascade,
  left_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table group_departures enable row level security;
-- Readable like group_members (0029): fellow members and community admins. Writes: trigger only.
create policy "group_departures: read" on group_departures for select using (
  is_group_member(group_id) or is_community_admin(group_community_id(group_id))
);
grant select on group_departures to authenticated;

create or replace function track_group_departure() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    delete from group_departures where group_id = new.group_id and user_id = new.user_id;
    return new;
  end if;
  -- A cascade from deleting the group or the profile itself is not a departure; the parent row is
  -- already gone by the time the cascade reaches here, and the FK would refuse the insert anyway.
  if exists (select 1 from groups where id = old.group_id)
     and exists (select 1 from profiles where id = old.user_id) then
    insert into group_departures (group_id, user_id) values (old.group_id, old.user_id)
      on conflict (group_id, user_id) do update set left_at = now();
  end if;
  return old;
end; $$;
revoke execute on function track_group_departure() from public, anon, authenticated;

create trigger trg_group_departure_on_join after insert on group_members
  for each row execute function track_group_departure();
create trigger trg_group_departure_on_leave after delete on group_members
  for each row execute function track_group_departure();

------------------------------------------------------------------------------
-- 2. Members, current and departed
------------------------------------------------------------------------------
create or replace function group_member_list(p_group_id uuid)
returns table (
  user_id    uuid,
  full_name  text,
  avatar_url text,
  is_member  boolean,
  joined_at  timestamptz,
  left_at    timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_cid uuid; v_private boolean;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select community_id, is_private into v_cid, v_private from groups where id = p_group_id;
  if v_cid is null then raise exception 'group_not_found' using errcode='P0001'; end if;
  if not (is_group_member(p_group_id)
          or is_group_admin(p_group_id, v_user)
          or (not v_private and is_community_member(v_cid))) then
    raise exception 'forbidden' using errcode='P0001';
  end if;
  return query
    select p.id, p.full_name, p.avatar_url, (gm.user_id is not null), gm.created_at,
           case when gm.user_id is null then d.left_at end
      from profiles p
      left join group_members    gm on gm.group_id = p_group_id and gm.user_id = p.id
      left join group_departures d  on d.group_id  = p_group_id and d.user_id  = p.id
     where (gm.user_id is not null or d.user_id is not null)
       -- Blocks are symmetric everywhere but explore_players: neither side lists the other.
       and not exists (select 1 from blocks b
                       where (b.blocker_id = v_user and b.blocked_id = p.id)
                          or (b.blocker_id = p.id and b.blocked_id = v_user))
     order by (gm.user_id is null), p.full_name;
end; $$;
revoke execute on function group_member_list(uuid) from public, anon, authenticated;
grant execute on function group_member_list(uuid) to authenticated;

------------------------------------------------------------------------------
-- 3. B6: archiving cancels what it says it cancels, and never empties a community
------------------------------------------------------------------------------
create or replace function archive_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_community uuid; v_actor text;
begin
  if not is_group_admin(p_group_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  select community_id into v_community from groups where id = p_group_id and archived_at is null;
  if v_community is null then return; end if;                          -- already archived: no-op
  perform pg_advisory_xact_lock(hashtextextended('community_groups:'||v_community::text, 0));
  -- A community is never left without a group (UX-GRP-01) — whichever group is the last.
  if not exists (select 1 from groups g
                 where g.community_id = v_community and g.id <> p_group_id and g.archived_at is null) then
    raise exception 'last_active_group' using errcode='P0001';
  end if;

  -- Upcoming events are cancelled, and their confirmed players told, as cancel_event does (0073).
  select full_name into v_actor from profiles where id = v_user;
  insert into notifications (user_id, type, actor_id, event_id, actor_name, entity_name)
  select ep.user_id, 'event_cancelled', v_user, e.id, v_actor, e.name
    from events e
    join event_participants ep on ep.event_id = e.id
   where e.group_id = p_group_id and e.status = 'scheduled' and e.deleted_at is null
     and e.starts_at > now()
     and ep.status = 'confirmed' and ep.user_id is not null and ep.user_id <> v_user;
  update events set status = 'cancelled'
   where group_id = p_group_id and status = 'scheduled' and deleted_at is null and starts_at > now();
  -- And no series keeps generating new ones into an archived group.
  update event_series set is_active = false
   where group_id = p_group_id and is_active and deleted_at is null;

  -- archived_with_community = false: this one was retired on its own and stays retired.
  update groups set archived_at = now(), archived_with_community = false where id = p_group_id;
end; $$;
revoke execute on function archive_group(uuid) from public, anon, authenticated;
grant execute on function archive_group(uuid) to authenticated;

------------------------------------------------------------------------------
-- 4. my_groups: the card fields, and archived groups for the admin who asks
------------------------------------------------------------------------------
-- New OUT columns cannot be `create or replace`d in, and the new argument would otherwise leave
-- 0102's one-argument overload behind to shadow it.
drop function if exists my_groups(uuid);
create function my_groups(p_user uuid default auth.uid(), p_include_archived boolean default false)
returns table (
  group_id       uuid,
  name           text,
  community_id   uuid,
  community_name text,
  member_count   integer,
  is_managing    boolean,
  description    text,
  thumbnail_path text,
  is_private     boolean,
  archived_at    timestamptz
)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, c.id, c.name,
         (select count(*)::int from group_members gm2 where gm2.group_id = g.id),
         -- NULL, not false, for someone else: "we are not telling you" rather than "they do not
         -- manage it". The client renders no badge either way.
         case when p_user = auth.uid() then is_group_admin(g.id, auth.uid()) else null end,
         g.description, g.thumbnail_path, g.is_private, g.archived_at
  from group_members gm
  join groups g      on g.id = gm.group_id
  join communities c on c.id = g.community_id
  where gm.user_id = p_user
    and (
      g.archived_at is null
      -- Archived groups: only your own list, only on request, only where you administer them —
      -- members never learn an archived group exists (UX-GRP-03).
      or (p_include_archived and p_user = auth.uid() and is_group_admin(g.id, auth.uid()))
    )
    and (
      p_user = auth.uid()
      or (
        g.is_private = false
        and exists (
          select 1 from community_members cm
          where cm.community_id = g.community_id and cm.user_id = auth.uid()
        )
        and not exists (
          select 1 from blocks b
          where (b.blocker_id = auth.uid() and b.blocked_id = p_user)
             or (b.blocker_id = p_user and b.blocked_id = auth.uid())
        )
      )
    )
  order by c.name, g.name;
$$;
revoke execute on function my_groups(uuid, boolean) from public, anon;
grant execute on function my_groups(uuid, boolean) to authenticated;
