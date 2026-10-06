-- Closes four ways for any signed-in user to get into a community or group they were never let
-- into — up to making themselves an admin of somebody else's private community. Found while
-- triaging Supabase's SECURITY DEFINER warnings, reproduced in a throwaway copy of the schema
-- (begin … rollback), and fixed here together because they are one problem: membership could be
-- WRITTEN by the person it benefits.
--
-- 1. community_members — anyone could join any community, and promote themselves (HIGH).
--    "community_members: insert self" (0007) checked `user_id = auth.uid() OR admin`, and
--    "community_members: update" (0009) the same on both sides. `authenticated` holds INSERT and
--    UPDATE on every column. So a signed-in user could
--      insert into community_members (community_id, user_id) values (<any community>, <me>);
--      update community_members set role = 'admin' where user_id = <me>;
--    Reproduced against a PRIVATE community: the outsider joined, then became admin. Community ids
--    are readable to every signed-in user, so every community was exposed.
--    Nothing legitimate writes this table directly except one thing. Every join, invitation,
--    request and creation path is a SECURITY DEFINER function (join_community, join_group,
--    accept_invitation, accept_join_request, accept_group_invitation, record_community_entry,
--    add_member_to_community, create_community_with_personal_tenant), and those run as the
--    table's owner, so neither the policies nor the grants below apply to them. The one direct
--    write is an admin changing another member's role (packages/api useMakeAdmin and
--    useRemoveAdmin, the "raw PostgREST demotion" 0098's last-admin guard was written for). So:
--      * no INSERT policy, and no INSERT privilege for the API roles;
--      * UPDATE only by an admin of the community, and only of the `role` column — not
--        community_id, not user_id, not rules_accepted_at.
--    The DELETE policy stays as it is: leaving is your own row, removing someone is an admin's,
--    and 0098's trigger keeps the last admin in place.
--
-- 2. community_invitations — an invitee could rewrite their own invitation (HIGH).
--    "ci: respond" (0024) let the invitee UPDATE every column of a pending invitation, including
--    community_id and group_ids, and accept_invitation then joined whatever the row now named:
--    create your own community, invite yourself, point the invitation at a private community,
--    accept. "ci: create" let any admin INSERT invitations with any group_ids, which is where the
--    `invite yourself` step came from. The app never writes this table directly — inviting,
--    accepting and declining are invite_to_community, accept_invitation and decline_invitation,
--    all SECURITY DEFINER — so both policies go, and the API roles lose INSERT, UPDATE and DELETE.
--    "ci: read" stays: the invitee and the community's admins still see the invitation.
--
-- 3. accept_invitation / invite_to_community — groups from another community (HIGH, MEDIUM).
--    Even with 2 closed, invite_to_community stored p_group_ids unchecked and accept_invitation
--    added the invitee to every group listed. Anyone can create a community and holds invite
--    rights in it, so: invite yourself into your own community, list another community's private
--    group, accept — and you are in that group. invite_to_community now refuses a group that is
--    not a live group of the community it is inviting into, and accept_invitation only ever adds
--    the groups that are, so an invitation written before this file cannot be cashed in either.
--
-- 4. join_group — the community's own gate was skipped (MEDIUM).
--    join_group checked only groups.is_private, then record_community_entry made the caller a
--    member of the COMMUNITY. A public group inside a request-to-join or private community was
--    therefore a side door: no request, no invitation, full membership. GR-07 says a public group
--    is joined directly by a COMMUNITY MEMBER; GR-09's "joining a group makes you a member of its
--    community" is for communities anyone may enter. So join_group now requires either that the
--    community is public, or that the caller is already in it — and, per UX-COMM-24, that neither
--    the group nor the community is archived. The app never offers Join on such a group (its page
--    shows the no-access state), so no screen changes; the refusal is the existing 'forbidden'
--    code, which every client already words as "not allowed".
--
-- NOT HERE, on purpose (separate changes, lower severity): accept_join_request /
-- decline_join_request not checking status, the community_posts update policy letting an author
-- move a post into another community, and the SECURITY DEFINER grant clean-up itself.

-- 1. community_members --------------------------------------------------------------------------
drop policy if exists "community_members: insert self" on community_members;
drop policy if exists "community_members: update" on community_members;
create policy "community_members: update" on community_members for update
  using (is_community_admin(community_id))
  with check (is_community_admin(community_id));
-- 0030's default privileges gave the API roles every privilege on the table. Table-level UPDATE
-- must go before a column-level grant means anything: a table grant covers every column.
revoke insert, update on community_members from anon, authenticated;
grant update (role) on community_members to authenticated;

-- 2. community_invitations ----------------------------------------------------------------------
drop policy if exists "ci: create" on community_invitations;
drop policy if exists "ci: respond" on community_invitations;
revoke insert, update, delete on community_invitations from anon, authenticated;

-- 3. invite_to_community / accept_invitation ----------------------------------------------------
-- 0028's body, with one check added before anything is written.
create or replace function invite_to_community(p_community_id uuid, p_invitee_ids uuid[],
                                               p_group_ids uuid[] default '{}'::uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not (is_community_admin(p_community_id)
          or (is_community_member(p_community_id)
              and coalesce((select invite_members from community_permissions where community_id=p_community_id),false)))
  then raise exception 'forbidden' using errcode='P0001'; end if;
  -- Every group named must be a live group of THIS community. The invite screen only lists those
  -- (packages/api useGroups filters archived_at), so this refuses nothing a person can pick.
  if exists (
    select 1 from unnest(coalesce(p_group_ids, '{}')) as g(id)
     where not exists (select 1 from groups gr
                        where gr.id = g.id and gr.community_id = p_community_id and gr.archived_at is null)
  ) then
    raise exception 'forbidden' using errcode='P0001';
  end if;
  foreach v_uid in array p_invitee_ids loop
    insert into community_invitations (community_id, inviter_id, invitee_id, group_ids)
      values (p_community_id, auth.uid(), v_uid, coalesce(p_group_ids,'{}'))
      on conflict (community_id, invitee_id) do update
        set status      = 'pending',
            inviter_id  = excluded.inviter_id,
            group_ids   = excluded.group_ids,
            created_at  = now(),
            declined_at = null
        where community_invitations.status = 'declined';
  end loop;
end; $$;

-- 0099's body, with the group loop narrowed to the invitation's own live groups. Filtered rather
-- than refused: a stale or archived group in an otherwise good invitation should not stop someone
-- joining the community they were invited to.
create or replace function accept_invitation(p_invitation_id uuid, p_ack boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare v_cid uuid; v_user uuid := auth.uid(); v_groups uuid[];
begin
  select community_id, group_ids into v_cid, v_groups
    from community_invitations where id = p_invitation_id and invitee_id = v_user and status='pending';
  if v_cid is null then raise exception 'invitation_not_found' using errcode='P0001'; end if;
  if rules_ack_required(v_cid, p_ack) then
    raise exception 'rules_acknowledgement_required' using errcode='P0001';
  end if;
  perform add_member_to_community(v_cid, v_user, p_ack);
  insert into group_members (group_id, user_id)
    select gr.id, v_user from groups gr
     where gr.id = any(coalesce(v_groups, '{}')) and gr.community_id = v_cid and gr.archived_at is null
    on conflict do nothing;
  update community_invitations set status='accepted', accepted_at=now() where id = p_invitation_id;
end; $$;

-- 4. join_group ---------------------------------------------------------------------------------
-- 0099's body, with the community gate and the archive checks added after the group lookup.
create or replace function join_group(p_group_id uuid, p_ack boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_cid uuid; v_private boolean; v_group_archived timestamptz;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select community_id, is_private, archived_at into v_cid, v_private, v_group_archived
    from groups where id = p_group_id;
  if v_cid is null then raise exception 'group_not_found' using errcode='P0001'; end if;
  if v_private then raise exception 'group_private_join_forbidden' using errcode='P0001'; end if;  -- GR-06/08
  if v_group_archived is not null
     or exists (select 1 from communities c where c.id = v_cid and c.archived_at is not null) then
    raise exception 'forbidden' using errcode='P0001';                                             -- UX-COMM-24
  end if;
  if not is_community_member(v_cid)
     and not exists (select 1 from communities c where c.id = v_cid and c.privacy = 'public') then
    raise exception 'forbidden' using errcode='P0001';                                             -- GR-07
  end if;
  if rules_ack_required(v_cid, p_ack) then
    raise exception 'rules_acknowledgement_required' using errcode='P0001';
  end if;
  perform record_community_entry(v_cid, v_user, p_ack);                      -- GR-09
  insert into group_members (group_id, user_id) values (p_group_id, v_user)
    on conflict (group_id, user_id) do nothing;
end; $$;

-- CREATE OR REPLACE keeps each function's ACL, so 0094/0099's grants stand (authenticated only);
-- restated because they are the only thing between these bodies and 0030's default privileges if
-- this file ever runs where those migrations did not.
revoke execute on function invite_to_community(uuid, uuid[], uuid[]) from public, anon;
grant execute on function invite_to_community(uuid, uuid[], uuid[]) to authenticated;
revoke execute on function accept_invitation(uuid, boolean) from public, anon, authenticated;
grant execute on function accept_invitation(uuid, boolean) to authenticated;
revoke execute on function join_group(uuid, boolean) from public, anon, authenticated;
grant execute on function join_group(uuid, boolean) to authenticated;

-- Self-check, in the spirit of 0094/0097/0101/0132–0134. Catalog state only: proving the old exploits
-- fail needs two users and two communities, which is what the REST test
-- (infra/supabase/tests/community-membership-writes.test.mjs) does on a scratch stack — a hosted
-- paste must not create and tear down communities. The editor runs the whole paste as one
-- transaction, so if this raises, nothing above it lands.
do $$
begin
  -- 1. No way to INSERT a membership row through the API; UPDATE is admin-only, `role` only.
  if exists (select 1 from pg_policy where polrelid = 'public.community_members'::regclass and polcmd in ('a', '*')) then
    raise exception 'community_members still has an INSERT policy';
  end if;
  if has_table_privilege('authenticated', 'public.community_members', 'insert')
     or has_table_privilege('anon', 'public.community_members', 'insert') then
    raise exception 'an API role can still INSERT into community_members';
  end if;
  if has_table_privilege('authenticated', 'public.community_members', 'update')
     or has_column_privilege('authenticated', 'public.community_members', 'community_id', 'update')
     or has_column_privilege('authenticated', 'public.community_members', 'user_id', 'update')
     or has_column_privilege('authenticated', 'public.community_members', 'rules_accepted_at', 'update') then
    raise exception 'authenticated can still UPDATE community_members beyond role';
  end if;
  if not has_column_privilege('authenticated', 'public.community_members', 'role', 'update') then
    raise exception 'admins can no longer change a role — Make admin / Remove admin would break';
  end if;
  if exists (
    select 1 from pg_policy
     where polrelid = 'public.community_members'::regclass and polcmd = 'w'
       and (pg_get_expr(polqual, polrelid) ~ 'auth\.uid\(\)'
            or coalesce(pg_get_expr(polwithcheck, polrelid), '') ~ 'auth\.uid\(\)')
  ) then
    raise exception 'the community_members UPDATE policy still lets a member update their own row';
  end if;

  -- 2. Invitations are written by the SECURITY DEFINER functions only.
  if exists (select 1 from pg_policy where polrelid = 'public.community_invitations'::regclass and polcmd in ('a', 'w', '*')) then
    raise exception 'community_invitations still has an INSERT or UPDATE policy';
  end if;
  if has_table_privilege('authenticated', 'public.community_invitations', 'insert')
     or has_table_privilege('authenticated', 'public.community_invitations', 'update')
     or has_table_privilege('authenticated', 'public.community_invitations', 'delete') then
    raise exception 'authenticated can still write community_invitations directly';
  end if;
  if not has_table_privilege('authenticated', 'public.community_invitations', 'select') then
    raise exception 'invitees can no longer read their invitations';
  end if;

  -- 3 and 4. The new checks are in the bodies that run.
  if (select prosrc from pg_proc where oid = 'public.invite_to_community(uuid,uuid[],uuid[])'::regprocedure)
       !~ 'gr\.community_id = p_community_id'
     or (select prosrc from pg_proc where oid = 'public.accept_invitation(uuid,boolean)'::regprocedure)
       !~ 'gr\.community_id = v_cid'
     or (select prosrc from pg_proc where oid = 'public.join_group(uuid,boolean)'::regprocedure)
       !~ 'c\.privacy = ''public''' then
    raise exception 'a membership check is missing from invite_to_community, accept_invitation or join_group';
  end if;
  if has_function_privilege('anon', 'public.invite_to_community(uuid,uuid[],uuid[])', 'execute')
     or has_function_privilege('anon', 'public.accept_invitation(uuid,boolean)', 'execute')
     or has_function_privilege('anon', 'public.join_group(uuid,boolean)', 'execute') then
    raise exception 'anon can execute a membership function';
  end if;
end $$;
