-- Post-review hardening (whole-implementation code review).

-- C1: profiles are created SERVER-SIDE by the complete-account Edge Function (service role) from
-- the identifiers actually persisted on auth.users. Remove the client INSERT path so a client can
-- never write a profile with an email/phone that isn't its own into the globally-readable table.
drop policy if exists "profiles: insert" on profiles;

-- I3: membership management. With RLS on and only select/insert policies, owners/admins could not
-- remove members and users could not leave. Add self-leave + admin-manage for update/delete.
create policy "community_members: update" on community_members for update
  using (user_id = auth.uid() or is_community_admin(community_id))
  with check (user_id = auth.uid() or is_community_admin(community_id));
create policy "community_members: delete" on community_members for delete
  using (user_id = auth.uid() or is_community_admin(community_id));

create policy "group_members: delete" on group_members for delete
  using (
    user_id = auth.uid()
    or is_community_admin((select community_id from groups where id = group_members.group_id))
  );

-- I4: replace the broad `for all` groups write policy with explicit write verbs so the
-- public-discovery read path (groups: read) is never entangled with admin writes.
drop policy if exists "groups: write" on groups;
create policy "groups: insert" on groups for insert
  with check (is_community_admin(community_id));
create policy "groups: update" on groups for update
  using (is_community_admin(community_id)) with check (is_community_admin(community_id));
create policy "groups: delete" on groups for delete
  using (is_community_admin(community_id));
