-- tenants & memberships
create policy "tenants: read own"     on tenants            for select using (id in (select auth_tenant_ids()));
create policy "memberships: read own" on tenant_memberships for select using (user_id = auth.uid());

-- communities: tenant-scoped read OR public (discovery); manage by community admin
create policy "communities: read" on communities for select
  using (tenant_id in (select auth_tenant_ids()) or privacy = 'public');
create policy "communities: insert" on communities for insert
  with check (tenant_id in (select auth_tenant_ids()));
create policy "communities: update" on communities for update
  using (is_community_admin(id)) with check (is_community_admin(id));

-- community_members: visible if you can see the parent community; self-manageable
create policy "community_members: read" on community_members for select using (
  community_id in (
    select id from communities where tenant_id in (select auth_tenant_ids()) or privacy = 'public'
  )
);
create policy "community_members: insert self" on community_members for insert
  with check (user_id = auth.uid() or is_community_admin(community_id));

-- groups: visible if parent community visible AND (public group OR you're a member); manage by community admin
create policy "groups: read" on groups for select using (
  community_id in (
    select id from communities where tenant_id in (select auth_tenant_ids()) or privacy = 'public'
  )
  and (is_private = false or exists (
    select 1 from group_members gm where gm.group_id = groups.id and gm.user_id = auth.uid()
  ))
);
create policy "groups: write" on groups for all
  using (is_community_admin(community_id)) with check (is_community_admin(community_id));

-- group_members: visible with the group; self-join
create policy "group_members: read" on group_members for select using (
  group_id in (select id from groups)
);
create policy "group_members: insert self" on group_members for insert
  with check (user_id = auth.uid() or is_community_admin(
    (select community_id from groups where id = group_id)
  ));
