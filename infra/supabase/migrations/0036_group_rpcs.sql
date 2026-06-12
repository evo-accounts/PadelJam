-- 0036_group_rpcs.sql

create or replace function create_group(
  p_community_id uuid, p_name text, p_description text default null,
  p_is_private boolean default false, p_thumbnail_path text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_group uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_community_admin(p_community_id) then raise exception 'forbidden' using errcode='P0001'; end if;
  if coalesce(btrim(p_name),'') = '' then raise exception 'name_required' using errcode='P0001'; end if;
  -- groups_per_community cap enforced by existing enforce_group_cap BEFORE INSERT trigger
  -- (0015+0017, archived-aware). Let it raise on overflow (avoids a TOCTOU pre-check).
  insert into groups (community_id, created_by, name, description, is_private, thumbnail_path, is_general)
    values (p_community_id, v_user, p_name, p_description, coalesce(p_is_private,false), p_thumbnail_path, false)
    returning id into v_group;
  insert into group_members (group_id, user_id) values (v_group, v_user)
    on conflict (group_id, user_id) do nothing;            -- GR-05: creator is sole initial member
  insert into group_seasons (group_id, season_number) values (v_group, 1);  -- GR-20/30
  return v_group;
end; $$;

create or replace function can_create_group(p_community_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_community_admin(p_community_id)
     and (community_limit(p_community_id,'groups_per_community') is null
          or (select count(*) from groups where community_id = p_community_id and archived_at is null)
             < community_limit(p_community_id,'groups_per_community'));
$$;

create or replace function join_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_cid uuid; v_private boolean;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select community_id, is_private into v_cid, v_private from groups where id = p_group_id;
  if v_cid is null then raise exception 'group_not_found' using errcode='P0001'; end if;
  if v_private then raise exception 'group_private_join_forbidden' using errcode='P0001'; end if;  -- GR-06/08
  insert into community_members (community_id, user_id, role)                -- GR-09
    values (v_cid, v_user, 'member') on conflict (community_id, user_id) do nothing;
  insert into group_members (group_id, user_id) values (p_group_id, v_user)
    on conflict (group_id, user_id) do nothing;
end; $$;

create or replace function invite_to_group(p_group_id uuid, p_invitee_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_group_admin(p_group_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if; -- GR-17
  insert into group_invitations (group_id, inviter_id, invitee_id)
    values (p_group_id, v_user, p_invitee_id) on conflict (group_id, invitee_id) do nothing;
end; $$;

create or replace function accept_group_invitation(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_cid uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from group_invitations
                 where group_id=p_group_id and invitee_id=v_user and status='pending') then
    raise exception 'invitation_not_found' using errcode='P0001';
  end if;
  select community_id into v_cid from groups where id = p_group_id;
  insert into community_members (community_id, user_id, role)               -- GR-10
    values (v_cid, v_user, 'member') on conflict (community_id, user_id) do nothing;
  insert into group_members (group_id, user_id) values (p_group_id, v_user)
    on conflict (group_id, user_id) do nothing;
  update group_invitations set status='accepted', responded_at=now()
    where group_id=p_group_id and invitee_id=v_user and status='pending';
end; $$;

create or replace function leave_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_cid uuid; v_role text; v_admin_count int; v_owner_count int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from group_members where group_id=p_group_id and user_id=v_user) then
    raise exception 'not_a_member' using errcode='P0001';
  end if;
  select community_id into v_cid from groups where id = p_group_id;
  select role into v_role from community_members where community_id=v_cid and user_id=v_user;
  if v_role = 'owner' then                                                   -- GR-24
    select count(*) into v_owner_count from community_members where community_id=v_cid and role='owner';
    if v_owner_count <= 1 then raise exception 'sole_owner_must_transfer' using errcode='P0001'; end if;
  end if;
  if v_role in ('owner','admin') then                                       -- GR-36/40
    select count(*) into v_admin_count
      from group_members gm
      join community_members cm on cm.community_id=v_cid and cm.user_id=gm.user_id and cm.role in ('owner','admin')
      where gm.group_id=p_group_id and gm.user_id <> v_user;                -- exclude the leaver
    if v_admin_count = 0 then raise exception 'sole_admin_must_add_another' using errcode='P0001'; end if;
  end if;
  delete from group_members where group_id=p_group_id and user_id=v_user;   -- GR-15/16: data never deleted
end; $$;

create or replace function start_new_season(p_group_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_next int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_group_admin(p_group_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('group_season:'||p_group_id::text, 0));
  update group_seasons set ended_at = now() where group_id=p_group_id and ended_at is null;
  select coalesce(max(season_number),0)+1 into v_next from group_seasons where group_id=p_group_id;
  insert into group_seasons (group_id, season_number) values (p_group_id, v_next);
  return v_next;
end; $$;

create or replace function archive_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_group_admin(p_group_id, auth.uid()) then raise exception 'forbidden' using errcode='P0001'; end if;
  update groups set archived_at = now() where id = p_group_id and archived_at is null;
end; $$;

create or replace function unarchive_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_group_admin(p_group_id, auth.uid()) then raise exception 'forbidden' using errcode='P0001'; end if;
  if exists (select 1 from groups g where g.id=p_group_id and g.archived_at is not null)
     and not (community_limit(group_community_id(p_group_id),'groups_per_community') is null
              or (select count(*) from groups where community_id=group_community_id(p_group_id) and archived_at is null)
                 < community_limit(group_community_id(p_group_id),'groups_per_community')) then
    raise exception 'groups_per_community' using errcode='P0001';
  end if;
  update groups set archived_at = null where id = p_group_id;
end; $$;

grant execute on function create_group, can_create_group, join_group, invite_to_group,
  accept_group_invitation, leave_group, start_new_season, archive_group, unarchive_group
  to authenticated;
