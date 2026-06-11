-- Fix infinite recursion between groups and group_members RLS (latent since the foundation):
-- groups: read referenced group_members, and group_members: read referenced groups, forming a cycle
-- that Postgres rejects once either is SELECTed as an authenticated user (the Communities Groups tab
-- and general-group lookups do exactly that). Break the cycle by routing both cross-table membership
-- checks through SECURITY DEFINER helpers (which bypass RLS).

create or replace function is_group_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = g and user_id = auth.uid());
$$;

create or replace function group_community_id(g uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select community_id from groups where id = g;
$$;

-- groups: public groups visible to community members; private groups only to their own members.
drop policy if exists "groups: read" on groups;
create policy "groups: read" on groups for select using (
  (is_private = false and is_community_member(community_id))
  or is_group_member(id)
);

-- group_members: visible to fellow group members and to community admins (via definer helpers).
drop policy if exists "group_members: read" on group_members;
create policy "group_members: read" on group_members for select using (
  is_group_member(group_id) or is_community_admin(group_community_id(group_id))
);

-- Re-express the foundation write policies through the definer helper too (avoids nested groups RLS).
drop policy if exists "group_members: insert self" on group_members;
create policy "group_members: insert self" on group_members for insert
  with check (user_id = auth.uid() or is_community_admin(group_community_id(group_id)));
