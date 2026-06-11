-- Shared: add a user to a community + its general group, idempotently.
create or replace function add_member_to_community(p_community uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_general uuid;
begin
  insert into community_members (community_id, user_id, role)
    values (p_community, p_user, 'member')
    on conflict (community_id, user_id) do nothing;
  select id into v_general from groups
    where community_id = p_community and is_general = true and archived_at is null limit 1;
  if v_general is not null then
    insert into group_members (group_id, user_id) values (v_general, p_user)
      on conflict (group_id, user_id) do nothing;
  end if;
end; $$;

-- Join entrypoint. Returns 'joined' | 'requested'. Raises on missing ack / invite / cap.
create or replace function join_community(p_community_id uuid, p_ack boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare v_privacy text; v_rules boolean; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select privacy, cancellation_rules_enabled into v_privacy, v_rules
    from communities where id = p_community_id;
  if v_privacy is null then raise exception 'community_not_found' using errcode='P0001'; end if;
  if v_rules and not p_ack then
    raise exception 'rules_acknowledgement_required' using errcode='P0001';
  end if;

  if v_privacy = 'public' then
    perform add_member_to_community(p_community_id, v_user);  -- member cap trigger may raise P0001
    return 'joined';
  elsif v_privacy = 'request_to_join' then
    insert into community_join_requests (community_id, user_id, rules_acknowledged)
      values (p_community_id, v_user, p_ack)
      on conflict (community_id, user_id) do update set rules_acknowledged = excluded.rules_acknowledged;
    return 'requested';
  else -- private
    if not exists (select 1 from community_invitations
                   where community_id = p_community_id and invitee_id = v_user and status = 'pending') then
      raise exception 'invite_required' using errcode='P0001';
    end if;
    perform add_member_to_community(p_community_id, v_user);
    update community_invitations set status='accepted', accepted_at=now()
      where community_id = p_community_id and invitee_id = v_user and status='pending';
    return 'joined';
  end if;
end; $$;

create or replace function accept_join_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_cid uuid; v_uid uuid; v_user uuid := auth.uid();
begin
  select community_id, user_id into v_cid, v_uid from community_join_requests where id = p_request_id;
  if v_cid is null then raise exception 'request_not_found' using errcode='P0001'; end if;
  if not (is_community_admin(v_cid)
          or (is_community_member(v_cid)
              and coalesce((select approve_join_requests from community_permissions where community_id=v_cid),false)))
  then raise exception 'forbidden' using errcode='P0001'; end if;
  update community_join_requests set status='accepted', responded_at=now(), responded_by=v_user
    where id = p_request_id;
  perform add_member_to_community(v_cid, v_uid);
end; $$;

create or replace function decline_join_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_cid uuid; v_user uuid := auth.uid();
begin
  select community_id into v_cid from community_join_requests where id = p_request_id;
  if v_cid is null then raise exception 'request_not_found' using errcode='P0001'; end if;
  if not (is_community_admin(v_cid)
          or (is_community_member(v_cid)
              and coalesce((select approve_join_requests from community_permissions where community_id=v_cid),false)))
  then raise exception 'forbidden' using errcode='P0001'; end if;
  update community_join_requests set status='declined', responded_at=now(), responded_by=v_user
    where id = p_request_id;
end; $$;

create or replace function invite_to_community(p_community_id uuid, p_invitee_ids uuid[], p_group_ids uuid[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not (is_community_admin(p_community_id)
          or (is_community_member(p_community_id)
              and coalesce((select invite_members from community_permissions where community_id=p_community_id),false)))
  then raise exception 'forbidden' using errcode='P0001'; end if;
  foreach v_uid in array p_invitee_ids loop
    insert into community_invitations (community_id, inviter_id, invitee_id, group_ids)
      values (p_community_id, auth.uid(), v_uid, coalesce(p_group_ids,'{}'))
      on conflict (community_id, invitee_id) do nothing;
  end loop;
end; $$;

create or replace function accept_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_cid uuid; v_user uuid := auth.uid(); v_groups uuid[]; v_g uuid;
begin
  select community_id, group_ids into v_cid, v_groups
    from community_invitations where id = p_invitation_id and invitee_id = v_user and status='pending';
  if v_cid is null then raise exception 'invitation_not_found' using errcode='P0001'; end if;
  perform add_member_to_community(v_cid, v_user);
  foreach v_g in array coalesce(v_groups,'{}') loop
    insert into group_members (group_id, user_id) values (v_g, v_user) on conflict do nothing;
  end loop;
  update community_invitations set status='accepted', accepted_at=now() where id = p_invitation_id;
end; $$;

create or replace function remove_member(p_community_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_community_admin(p_community_id) then raise exception 'forbidden' using errcode='P0001'; end if;
  delete from group_members gm using groups g
    where gm.group_id = g.id and g.community_id = p_community_id and gm.user_id = p_user_id;
  delete from community_members where community_id = p_community_id and user_id = p_user_id;
end; $$;

create or replace function leave_community(p_community_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_role text;
begin
  select role into v_role from community_members where community_id=p_community_id and user_id=v_user;
  if v_role is null then raise exception 'not_a_member' using errcode='P0001'; end if;
  if v_role = 'owner' then raise exception 'transfer_ownership_first' using errcode='P0001'; end if;
  delete from group_members gm using groups g
    where gm.group_id = g.id and g.community_id = p_community_id and gm.user_id = v_user;
  delete from community_members where community_id = p_community_id and user_id = v_user;
end; $$;

create or replace function archive_community(p_community_id uuid, p_archive boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not is_community_admin(p_community_id) then raise exception 'forbidden' using errcode='P0001'; end if;
  if p_archive then
    update communities set archived_at = now() where id = p_community_id;
    update groups set archived_at = now() where community_id = p_community_id and archived_at is null;
  else
    update communities set archived_at = null where id = p_community_id;
    update groups set archived_at = null where community_id = p_community_id;
  end if;
  select count(*) into v_count from groups where community_id = p_community_id;
  return v_count;
end; $$;

create or replace function transfer_ownership(p_community_id uuid, p_new_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if not exists (select 1 from community_members where community_id=p_community_id and user_id=v_user and role='owner')
  then raise exception 'forbidden' using errcode='P0001'; end if;
  if not exists (select 1 from community_members where community_id=p_community_id and user_id=p_new_owner)
  then raise exception 'new_owner_not_member' using errcode='P0001'; end if;
  update community_members set role='admin'  where community_id=p_community_id and user_id=v_user;
  update community_members set role='owner'  where community_id=p_community_id and user_id=p_new_owner;
end; $$;

-- Server-side "create posts" gate (mirrors the two-check rule).
create or replace function can_create_post(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_community_admin(c)
      or (is_community_member(c)
          and coalesce((select create_posts from community_permissions where community_id=c), false));
$$;

create policy "posts: create" on community_posts for insert
  with check (author_id = auth.uid() and can_create_post(community_id));
