-- 0035_group_helpers_rls.sql
-- A user administers a group when they're a community owner/admin AND (for private groups) a member.
create or replace function is_group_admin(g uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from groups gr
    join community_members cm
      on cm.community_id = gr.community_id and cm.user_id = u and cm.role in ('owner','admin')
    where gr.id = g
      and (gr.is_private = false
           or exists (select 1 from group_members gm where gm.group_id = g and gm.user_id = u))
  );
$$;

drop policy if exists "group_seasons: read" on group_seasons;
create policy "group_seasons: read" on group_seasons for select using (
  is_group_member(group_id)
  or exists (select 1 from groups g
             where g.id = group_id and g.is_private = false and is_community_member(g.community_id))
);

drop policy if exists "group_invitations: read" on group_invitations;
create policy "group_invitations: read" on group_invitations for select using (
  invitee_id = auth.uid() or is_group_admin(group_id, auth.uid())
);
drop policy if exists "group_invitations: respond" on group_invitations;
create policy "group_invitations: respond" on group_invitations for update
  using (invitee_id = auth.uid()) with check (invitee_id = auth.uid());
-- No direct INSERT policy: invitations are created only via invite_to_group() (SECURITY DEFINER).
-- group_seasons writes are RPC-only (start_new_season / create_group). No direct write policy.
