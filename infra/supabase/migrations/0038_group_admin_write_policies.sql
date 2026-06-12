-- 0038_group_admin_write_policies.sql
-- Tighten direct-write RLS on groups/group_members to is_group_admin (community owner/admin AND,
-- for PRIVATE groups, also a member) instead of the weaker is_community_admin from the foundation
-- (0009). Without this, a community owner/admin who is NOT a member of a private group could edit
-- that group's settings (including flipping is_private to public) and remove its members — violating
-- GR-17/GR-35 ("managing a private group requires the admin also be a group member"). The group RPCs
-- already enforce is_group_admin; these direct-write paths (useUpdateGroup, useRemoveGroupMember)
-- must match. is_group_admin is defined in 0035.
--
-- Note: groups: insert stays on is_community_admin — you cannot be a member of a group that does not
-- yet exist, and create_group adds the creator as the first member.

drop policy if exists "groups: update" on groups;
create policy "groups: update" on groups for update
  using (is_group_admin(id, auth.uid()))
  with check (is_group_admin(id, auth.uid()));

drop policy if exists "group_members: delete" on group_members;
create policy "group_members: delete" on group_members for delete
  using (user_id = auth.uid() or is_group_admin(group_id, auth.uid()));
