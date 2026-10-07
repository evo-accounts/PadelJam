-- Closes the ways any signed-in user could get into a community or group they were never let into
-- — up to making themselves an admin of somebody else's private community. Found while triaging
-- Supabase's SECURITY DEFINER warnings, each reproduced in a throwaway copy of the schema
-- (begin … rollback), and fixed together because they are one problem: membership could be WRITTEN
-- by the person it benefits, or through a row they could rewrite.
--
-- THE RULE THIS FILE ENFORCES. Every way into a community or group already exists as a SECURITY
-- DEFINER function — join_community, join_group, accept_invitation, accept_group_invitation,
-- accept_join_request, cancel_join_request, leave_community, remove_member, create_group,
-- create_community_with_personal_tenant — and those run as the tables' owner, so no policy or grant
-- below applies to them. The app writes the tables directly in exactly two places, both checked:
-- an admin changing a member's role (packages/api useMakeAdmin / useRemoveAdmin), and a group admin
-- editing a group (useUpdateGroup: name, description, is_private, thumbnail_path; the web create
-- form's thumbnail update). Everything else that the API roles could write directly goes.
--
-- 1. community_members — anyone could join any community, and promote themselves (HIGH).
--    "community_members: insert self" (0007) checked `user_id = auth.uid() OR admin`, and
--    "community_members: update" (0009) the same on both sides, with INSERT and UPDATE granted on
--    every column. So: insert your own row into <any community>, then set your role to 'admin'.
--    Reproduced against a PRIVATE community. Community ids are readable to every signed-in user.
--    Now: no INSERT; UPDATE only by an admin of the community and only of `role`; no direct DELETE
--    either — leave_community and remove_member also drop the person's group memberships, while a
--    raw DELETE left them behind (still in the private groups, and able to come back through an
--    event in one of them). 0098's last-admin trigger still guards every path that remains.
--
-- 2. community_invitations — an invitee could rewrite their own invitation (HIGH).
--    "ci: respond" (0024) let the invitee UPDATE every column, community_id and group_ids included,
--    and accept_invitation then joined whatever the row now named. "ci: create" let anyone who had
--    made a community INSERT invitations with any group_ids. Inviting, accepting and declining are
--    invite_to_community, accept_invitation and decline_invitation, so both policies go and the API
--    roles lose INSERT, UPDATE and DELETE. "ci: read" stays.
--
-- 3. invite_to_community / accept_invitation — groups the inviter could not offer (HIGH, MAJOR).
--    invite_to_community stored p_group_ids unchecked and accept_invitation added the invitee to
--    every group listed: another community's private group, or — for any member with invite rights
--    — a private group of the same community that they are not in. invite_to_community now refuses
--    a group that is not a live group of the community, or that is private and the inviter could
--    not invite into (may_invite_to_group, the rule invite_to_group already uses). accept_invitation
--    applies the same filter with the invitation's inviter, so a row written before this file
--    cannot be cashed in either. The mobile invite sheet lists only groups the inviter can see, and
--    the web invite page sends none, so nobody legitimate is refused.
--
-- 4. join_group — the community's own gate was skipped (MEDIUM).
--    It checked only groups.is_private, then record_community_entry made the caller a member of the
--    COMMUNITY: a public group inside a request-to-join or private community was a side door. GR-07
--    says a public group is joined directly by a COMMUNITY MEMBER; GR-09 ("joining a group makes you
--    a member of its community") is for communities anyone may enter. So join_group now needs a
--    public community or an existing membership, and — per UX-COMM-24 — neither the group nor the
--    community may be archived. The refusal is the existing 'forbidden', which every client words as
--    "not allowed". (Explore and search can still list such a group to a community's founder after
--    they leave — tenant_memberships is never cleaned up — and their Join now answers 'forbidden'
--    instead of letting them back in. Fixing those lists is a separate change.)
--
-- 5. groups — a group could be moved into another community (MAJOR).
--    "groups: update" checks is_group_admin(id, …), which reads the row as it was, and UPDATE was
--    granted on every column. So an admin of their own community could set community_id on one of
--    its groups to any other community — then accept a pending invitation to that group, and
--    accept_group_invitation made them a member of the community the group now named. Reproduced
--    with a single account. Group admins now update only name, description, is_private and
--    thumbnail_path; nobody inserts a group except through create_group, and nobody hard-deletes
--    one — archive_group is how a group goes away.
--
-- 6. community_join_requests — approvers could rewrite whose request it was (MINOR).
--    "cjr: manage" let an approver UPDATE every column, so they could point a request at someone
--    who never asked and accept it; "cjr: create" let anyone INSERT a request for any community with
--    any status. The app only reads this table, so both policies go and the API roles lose INSERT,
--    UPDATE and DELETE. accept_join_request and decline_join_request now act on PENDING requests
--    only — before, an admin could accept a request its owner had already cancelled. A stale one
--    answers 'request_not_found', which the apps word as "This request is no longer available."
--
-- NOT HERE (separate changes): the community_posts update policy letting an author move a post into
-- another community, the explore/search lists above, and the SECURITY DEFINER grant clean-up (0136).

-- 1. community_members --------------------------------------------------------------------------
drop policy if exists "community_members: insert self" on community_members;
drop policy if exists "community_members: delete" on community_members;
drop policy if exists "community_members: update" on community_members;
create policy "community_members: update" on community_members for update
  using (is_community_admin(community_id))
  with check (is_community_admin(community_id));
-- 0030's default privileges gave the API roles every privilege. Table-level UPDATE must go before a
-- column-level grant means anything: a table grant covers every column.
revoke insert, update, delete on community_members from anon, authenticated;
grant update (role) on community_members to authenticated;

-- 2. community_invitations ----------------------------------------------------------------------
drop policy if exists "ci: create" on community_invitations;
drop policy if exists "ci: respond" on community_invitations;
revoke insert, update, delete on community_invitations from anon, authenticated;

-- 5. groups -------------------------------------------------------------------------------------
drop policy if exists "groups: insert" on groups;
-- DELETE too. "groups: delete" (0009) let a community admin hard-delete a group, which nothing in
-- either app does — groups are archived (archive_group), and a hard delete would skip the archive
-- rules and cascade into the group's events and results.
drop policy if exists "groups: delete" on groups;
revoke insert, update, delete on groups from anon, authenticated;
grant update (name, description, is_private, thumbnail_path) on groups to authenticated;

-- 6. community_join_requests --------------------------------------------------------------------
drop policy if exists "cjr: create" on community_join_requests;
drop policy if exists "cjr: manage" on community_join_requests;
revoke insert, update, delete on community_join_requests from anon, authenticated;

-- 3. invite_to_community / accept_invitation ----------------------------------------------------
-- 0099's body (the re-invite-after-decline upsert), with one check added before anything is written.
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
  -- Every group named must be a live group of THIS community, and a private one only if the
  -- inviter may invite into it — the same rule invite_to_group applies (may_invite_to_group).
  if exists (
    select 1 from unnest(coalesce(p_group_ids, '{}')) as g(id)
     where not exists (select 1 from groups gr
                        where gr.id = g.id and gr.community_id = p_community_id and gr.archived_at is null
                          and (not gr.is_private or may_invite_to_group(gr.id, auth.uid())))
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

-- 0099's body, with the group loop narrowed by the same rule, judged for the invitation's inviter.
-- Filtered rather than refused: a stale group in an otherwise good invitation should not stop
-- someone joining the community they were invited to.
create or replace function accept_invitation(p_invitation_id uuid, p_ack boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare v_cid uuid; v_user uuid := auth.uid(); v_groups uuid[]; v_inviter uuid;
begin
  select community_id, group_ids, inviter_id into v_cid, v_groups, v_inviter
    from community_invitations where id = p_invitation_id and invitee_id = v_user and status='pending';
  if v_cid is null then raise exception 'invitation_not_found' using errcode='P0001'; end if;
  if rules_ack_required(v_cid, p_ack) then
    raise exception 'rules_acknowledgement_required' using errcode='P0001';
  end if;
  perform add_member_to_community(v_cid, v_user, p_ack);
  insert into group_members (group_id, user_id)
    select gr.id, v_user from groups gr
     where gr.id = any(coalesce(v_groups, '{}')) and gr.community_id = v_cid and gr.archived_at is null
       and (not gr.is_private or may_invite_to_group(gr.id, v_inviter))
    on conflict do nothing;
  update community_invitations set status='accepted', accepted_at=now() where id = p_invitation_id;
end; $$;

-- 4. join_group ---------------------------------------------------------------------------------
-- 0099's body, with the archive checks and the community gate added after the group lookup.
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

-- 6. accept_join_request / decline_join_request -------------------------------------------------
-- 0099's bodies, acting on a PENDING request only. `for update` so two admins tapping at once
-- cannot both act on the same request.
create or replace function accept_join_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_cid uuid; v_uid uuid; v_ack boolean; v_user uuid := auth.uid();
begin
  select community_id, user_id, rules_acknowledged into v_cid, v_uid, v_ack
    from community_join_requests where id = p_request_id and status = 'pending' for update;
  if v_cid is null then raise exception 'request_not_found' using errcode='P0001'; end if;
  if not may_approve_requests(v_cid) then raise exception 'forbidden' using errcode='P0001'; end if;
  update community_join_requests set status='accepted', responded_at=now(), responded_by=v_user
    where id = p_request_id;
  perform add_member_to_community(v_cid, v_uid, coalesce(v_ack, false));
end; $$;

create or replace function decline_join_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_cid uuid; v_user uuid := auth.uid();
begin
  select community_id into v_cid
    from community_join_requests where id = p_request_id and status = 'pending' for update;
  if v_cid is null then raise exception 'request_not_found' using errcode='P0001'; end if;
  if not may_approve_requests(v_cid) then raise exception 'forbidden' using errcode='P0001'; end if;
  update community_join_requests set status='declined', responded_at=now(), responded_by=v_user
    where id = p_request_id;
end; $$;

-- CREATE OR REPLACE keeps each function's ACL, so the existing grants (authenticated only) stand;
-- restated because they are the only thing between these bodies and 0030's default privileges if
-- this file ever runs where the earlier migrations did not.
revoke execute on function invite_to_community(uuid, uuid[], uuid[]) from public, anon;
grant execute on function invite_to_community(uuid, uuid[], uuid[]) to authenticated;
revoke execute on function accept_invitation(uuid, boolean) from public, anon;
grant execute on function accept_invitation(uuid, boolean) to authenticated;
revoke execute on function join_group(uuid, boolean) from public, anon;
grant execute on function join_group(uuid, boolean) to authenticated;
revoke execute on function accept_join_request(uuid) from public, anon;
grant execute on function accept_join_request(uuid) to authenticated;
revoke execute on function decline_join_request(uuid) from public, anon;
grant execute on function decline_join_request(uuid) to authenticated;

-- Self-check, in the spirit of 0094/0097/0101/0132–0134. Catalog state only: proving the old exploits
-- fail needs several users and communities, which is what the REST test
-- (infra/supabase/tests/community-membership-writes.test.mjs) does on a scratch stack — a hosted
-- paste must not create and tear down communities. The editor runs the whole paste as one
-- transaction, so if this raises, nothing above it lands.
do $$
declare v_t text;
begin
  -- No INSERT/UPDATE/DELETE path for anon anywhere here; for authenticated only the two column sets.
  foreach v_t in array array['community_members', 'community_invitations', 'community_join_requests', 'groups'] loop
    -- Each table is named in the message so a failing paste says which one.
    if has_table_privilege('anon', 'public.' || v_t, 'insert')
       or has_table_privilege('anon', 'public.' || v_t, 'update')
       or has_table_privilege('anon', 'public.' || v_t, 'delete')
       or has_table_privilege('authenticated', 'public.' || v_t, 'insert')
       or has_table_privilege('authenticated', 'public.' || v_t, 'update') then
      raise exception 'an API role can still insert or update %', v_t;
    end if;
    if not has_table_privilege('authenticated', 'public.' || v_t, 'select') then
      raise exception 'authenticated can no longer read %', v_t;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.community_members', 'delete')
     or has_table_privilege('authenticated', 'public.community_invitations', 'delete')
     or has_table_privilege('authenticated', 'public.community_join_requests', 'delete')
     or has_table_privilege('authenticated', 'public.groups', 'delete') then
    raise exception 'authenticated can still delete membership, invitation, request or group rows directly';
  end if;

  -- community_members: role only. groups: the four columns useUpdateGroup sends, nothing else.
  if not has_column_privilege('authenticated', 'public.community_members', 'role', 'update') then
    raise exception 'admins can no longer change a role — Make admin / Remove admin would break';
  end if;
  if has_any_column_privilege('authenticated', 'public.community_members', 'update')
     and (has_column_privilege('authenticated', 'public.community_members', 'community_id', 'update')
          or has_column_privilege('authenticated', 'public.community_members', 'user_id', 'update')
          or has_column_privilege('authenticated', 'public.community_members', 'rules_accepted_at', 'update')) then
    raise exception 'authenticated can still update community_members beyond role';
  end if;
  if has_column_privilege('authenticated', 'public.groups', 'community_id', 'update')
     or has_column_privilege('authenticated', 'public.groups', 'is_general', 'update')
     or has_column_privilege('authenticated', 'public.groups', 'archived_at', 'update') then
    raise exception 'authenticated can still move, re-flag or unarchive a group directly';
  end if;
  if not (has_column_privilege('authenticated', 'public.groups', 'name', 'update')
          and has_column_privilege('authenticated', 'public.groups', 'description', 'update')
          and has_column_privilege('authenticated', 'public.groups', 'is_private', 'update')
          and has_column_privilege('authenticated', 'public.groups', 'thumbnail_path', 'update')) then
    raise exception 'group admins can no longer edit a group — Edit group would break';
  end if;

  -- The policies that allowed writing your own way in are gone; the admin-only role update remains.
  if exists (select 1 from pg_policy
              where polrelid in ('public.community_members'::regclass, 'public.community_invitations'::regclass,
                                 'public.community_join_requests'::regclass, 'public.groups'::regclass)
                and polcmd in ('a', 'd', '*')) then
    raise exception 'an INSERT, DELETE or ALL policy survives on a membership table';
  end if;
  if exists (select 1 from pg_policy
              where polrelid in ('public.community_invitations'::regclass, 'public.community_join_requests'::regclass)
                and polcmd = 'w') then
    raise exception 'an UPDATE policy survives on invitations or join requests';
  end if;
  if exists (select 1 from pg_policy
              where polrelid = 'public.community_members'::regclass and polcmd = 'w'
                and (pg_get_expr(polqual, polrelid) ~ 'auth\.uid\(\)'
                     or coalesce(pg_get_expr(polwithcheck, polrelid), '') ~ 'auth\.uid\(\)')) then
    raise exception 'the community_members UPDATE policy still lets a member update their own row';
  end if;

  -- The new checks are in the bodies that run.
  if (select prosrc from pg_proc where oid = 'public.invite_to_community(uuid,uuid[],uuid[])'::regprocedure)
       !~ 'may_invite_to_group\(gr\.id, auth\.uid\(\)\)'
     or (select prosrc from pg_proc where oid = 'public.accept_invitation(uuid,boolean)'::regprocedure)
       !~ 'may_invite_to_group\(gr\.id, v_inviter\)'
     or (select prosrc from pg_proc where oid = 'public.join_group(uuid,boolean)'::regprocedure)
       !~ 'c\.privacy = ''public'''
     or (select prosrc from pg_proc where oid = 'public.accept_join_request(uuid)'::regprocedure)
       !~ 'status = ''pending'' for update'
     or (select prosrc from pg_proc where oid = 'public.decline_join_request(uuid)'::regprocedure)
       !~ 'status = ''pending'' for update' then
    raise exception 'a membership check is missing from one of the five functions';
  end if;
  if has_function_privilege('anon', 'public.invite_to_community(uuid,uuid[],uuid[])', 'execute')
     or has_function_privilege('anon', 'public.accept_invitation(uuid,boolean)', 'execute')
     or has_function_privilege('anon', 'public.join_group(uuid,boolean)', 'execute')
     or has_function_privilege('anon', 'public.accept_join_request(uuid)', 'execute')
     or has_function_privilege('anon', 'public.decline_join_request(uuid)', 'execute') then
    raise exception 'anon can execute a membership function';
  end if;
end $$;
