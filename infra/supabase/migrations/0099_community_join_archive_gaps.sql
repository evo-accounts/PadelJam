-- UX-COMM audit (docs/audit/2026-09-14-ux-community.md), pull request 2 of the plan.
--
-- Four audit behaviours had NO server support at all, and they are all on the same seam — the
-- moment a person enters or leaves a community, and what an admin can see afterwards:
--
--   1. CANCELLING A PENDING REQUEST (UX-COMM-04). "Request to join" becomes "Requested", and
--      "tapping again cancels". community_join_requests.status admitted only pending/accepted/
--      declined (0021) and the requester had neither UPDATE nor DELETE (0024). A 'cancelled'
--      status is added rather than deleting the row: the row is the only record that the request
--      happened, the unique (community_id, user_id) key keeps meaning "one live request per
--      person", and the admin queue's history stays intact. Cancelling therefore has to make
--      re-requesting work, which 0028's `on conflict do update set rules_acknowledged` did not —
--      it left whatever status the row already held.
--
--   2. DECLINING AN INVITATION (UX-COMM-04). community_invitations.status admitted only
--      pending/accepted (0021) and there was no decline RPC. Both are added, and re-inviting
--      someone who declined now works (0028's `on conflict do nothing` made a decline permanent
--      for the inviter as well as the invitee).
--
--      The same section fixes a bug in join_community's private branch: it consumed a pending
--      invitation but ignored its group_ids, so accepting an invitation BY JOINING silently
--      dropped the group selection that accept_invitation would have honoured. The branch now
--      delegates to accept_invitation instead of half-repeating it.
--
--   3. RULES ACCEPTANCE, CAPTURED ONCE, ON ENTRY (UX-COMM-05). join_community took p_ack, checked
--      it, and then threw it away for public and private joins; only the request path persisted
--      it, onto community_join_requests.rules_acknowledged, which nothing ever read. Acceptance
--      now lands on the MEMBERSHIP row (community_members.rules_accepted_at), which is the one row
--      every join path creates. A timestamp is enough: the audit says acceptance is given once on
--      entry and that later edits to the rules do not re-prompt existing members, so there is no
--      version to track.
--
--   4. ARCHIVED CONTENT IS ADMIN-ONLY (UX-COMM-24). "Archived communities and archived groups are
--      visible to admins only. A member sees neither, with no indication that it exists." Nothing
--      filtered archived_at at any layer: `communities: read` (0024) was any authenticated user
--      and `groups: read` (0029) ignored archive state, so only client query filters and the
--      explore RPCs hid archived rows and a member could read them directly. Now enforced in RLS.
--
-- Plus the two repairs the plan attaches to the same functions (archive_community restoring
-- groups it never archived, and returning the wrong count), and the one pre-existing bug it
-- assigns here (a member holding approve_join_requests could answer requests but not see them).
--
-- Grants follow the 0094 rule throughout: 0030's default privileges grant execute to anon and
-- authenticated on every new function, so `revoke ... from public` alone leaves the door open.
-- Functions that appear in an RLS policy are evaluated as the CALLING role and therefore keep a
-- client grant; the rest are revoked from all three and granted back only to authenticated when a
-- client calls them.

------------------------------------------------------------------------------
-- 1. A pending join request can be cancelled, and then made again
------------------------------------------------------------------------------
alter table community_join_requests drop constraint community_join_requests_status_check;
alter table community_join_requests add constraint community_join_requests_status_check
  check (status in ('pending', 'accepted', 'declined', 'cancelled'));

comment on column community_join_requests.status is
  'pending -> accepted | declined (an admin answered) | cancelled (the requester withdrew, '
  'UX-COMM-04). A cancelled row is re-opened by requesting again; a declined one is not — an '
  'admin''s answer is not undone by the person it was given to.';

-- The requester withdraws their own pending request. Addressed by COMMUNITY, not by request id:
-- the preview sheet knows which community it is showing and (community_id, user_id) is unique, so
-- this saves the client a lookup it would otherwise have to do purely to name the row.
-- Deliberately NOT an RLS policy: an UPDATE policy for the requester would also let them write
-- 'accepted' onto their own row straight through PostgREST.
create or replace function cancel_join_request(p_community_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update community_join_requests
     set status = 'cancelled', responded_at = now(), responded_by = v_user
   where community_id = p_community_id and user_id = v_user and status = 'pending';
  if not found then raise exception 'request_not_found' using errcode = 'P0001'; end if;
end; $$;
revoke execute on function cancel_join_request(uuid) from public, anon, authenticated;
grant execute on function cancel_join_request(uuid) to authenticated;

------------------------------------------------------------------------------
-- 2. An invitation can be declined, and a declined invitee can be invited again
------------------------------------------------------------------------------
alter table community_invitations drop constraint community_invitations_status_check;
alter table community_invitations add constraint community_invitations_status_check
  check (status in ('pending', 'accepted', 'declined'));
alter table community_invitations add column if not exists declined_at timestamptz;

comment on column community_invitations.status is
  'pending -> accepted | declined (UX-COMM-04: Decline sits beside Accept on a private '
  'invitation). Declining dismisses the invitation for the invitee — every list of invitations '
  'reads the partial index on status = ''pending'' — and an admin may invite them again.';

create or replace function decline_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update community_invitations
     set status = 'declined', declined_at = now()
   where id = p_invitation_id and invitee_id = v_user and status = 'pending';
  if not found then raise exception 'invitation_not_found' using errcode = 'P0001'; end if;
end; $$;
revoke execute on function decline_invitation(uuid) from public, anon, authenticated;
grant execute on function decline_invitation(uuid) to authenticated;

-- 0028's `on conflict do nothing` meant a declined invitation could never be replaced: the row
-- stayed 'declined' for ever and every later invite silently did nothing. A declined person may
-- be invited again (with a fresh group selection); an already accepted one is left alone.
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
      on conflict (community_id, invitee_id) do update
        set status      = 'pending',
            inviter_id  = excluded.inviter_id,
            group_ids   = excluded.group_ids,
            created_at  = now(),
            declined_at = null
        where community_invitations.status = 'declined';
  end loop;
end; $$;
revoke execute on function invite_to_community(uuid, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function invite_to_community(uuid, uuid[], uuid[]) to authenticated;

------------------------------------------------------------------------------
-- 3. Rules acceptance is recorded on the membership row
------------------------------------------------------------------------------
alter table community_members add column if not exists rules_accepted_at timestamptz;

comment on column community_members.rules_accepted_at is
  'When this member accepted the community''s cancellation and attendance rules, on entry '
  '(UX-COMM-05). NULL means no acceptance was recorded: the community had no rules at the time, '
  'or the membership predates 0099. Editing the rules does NOT clear it — the audit is explicit '
  'that later edits do not re-prompt existing members, which is also why there is no version here.';

-- The one path that did persist an acknowledgement kept it on the request row, where nothing read
-- it. Move what exists onto the membership it produced, so the column is truthful from the start
-- rather than only for joins after this migration.
update community_members cm
   set rules_accepted_at = coalesce(jr.responded_at, jr.created_at)
  from community_join_requests jr
 where jr.community_id = cm.community_id
   and jr.user_id = cm.user_id
   and jr.status = 'accepted'
   and jr.rules_acknowledged
   and cm.rules_accepted_at is null;

-- "Must this person tick the box before they may enter?" — true only when the community HAS rules,
-- the caller did not acknowledge them, and they are not already a member. The last clause is the
-- audit's "acceptance is given once, on entry": a member re-entering a group they left is not
-- re-prompted. Internal helper (0094): only ever called from SECURITY DEFINER bodies below.
create or replace function rules_ack_required(c uuid, p_ack boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select cancellation_rules_enabled from communities where id = c), false)
     and not coalesce(p_ack, false)
     and not exists (
       select 1 from community_members where community_id = c and user_id = auth.uid());
$$;
revoke execute on function rules_ack_required(uuid, boolean) from public, anon, authenticated;

-- The ONE place a community_members row is born outside create_community_with_personal_tenant, so
-- the one place the stamp is written. `do nothing` on conflict: an existing membership is never
-- re-stamped and never re-prompted.
create or replace function record_community_entry(p_community uuid, p_user uuid, p_ack boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into community_members (community_id, user_id, role, rules_accepted_at)
    values (p_community, p_user, 'member', case when coalesce(p_ack, false) then now() end)
    on conflict (community_id, user_id) do nothing;
end; $$;
revoke execute on function record_community_entry(uuid, uuid, boolean) from public, anon, authenticated;

-- add_member_to_community gains the acknowledgement. The signature changes, so the two-argument
-- version is DROPPED rather than left beside it — `create or replace` with an extra defaulted
-- argument creates a second function and every existing two-argument call then fails as
-- "function is not unique". Dropping also drops 0094's revoke, which is restated below: this is a
-- SECURITY DEFINER writer taking a caller-chosen user id and must never be callable by a client.
drop function if exists add_member_to_community(uuid, uuid);
create or replace function add_member_to_community(p_community uuid, p_user uuid, p_ack boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_general uuid;
begin
  perform record_community_entry(p_community, p_user, p_ack);
  select id into v_general from groups
    where community_id = p_community and is_general = true and archived_at is null limit 1;
  if v_general is not null then
    insert into group_members (group_id, user_id) values (v_general, p_user)
      on conflict (group_id, user_id) do nothing;
  end if;
end; $$;
revoke execute on function add_member_to_community(uuid, uuid, boolean) from public, anon, authenticated;

-- join_community: the acknowledgement now survives the call on all three branches. The private
-- branch delegates to accept_invitation rather than repeating two thirds of it, which is what
-- dropped the invitation's group_ids (0028:39-46 vs 0028:94-106).
create or replace function join_community(p_community_id uuid, p_ack boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare v_privacy text; v_rules boolean; v_user uuid := auth.uid(); v_invitation uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select privacy, cancellation_rules_enabled into v_privacy, v_rules
    from communities where id = p_community_id;
  if v_privacy is null then raise exception 'community_not_found' using errcode='P0001'; end if;
  if v_rules and not p_ack then
    raise exception 'rules_acknowledgement_required' using errcode='P0001';
  end if;

  if v_privacy = 'public' then
    perform add_member_to_community(p_community_id, v_user, p_ack);  -- member cap trigger may raise P0001
    return 'joined';
  elsif v_privacy = 'request_to_join' then
    -- A cancelled request is re-opened, with a fresh created_at so it sorts into the admin queue
    -- as the new request it is. A DECLINED one is not: an admin answered, and the requester
    -- tapping the button again does not overturn it (0028 behaved this way too, by accident).
    insert into community_join_requests (community_id, user_id, rules_acknowledged)
      values (p_community_id, v_user, p_ack)
      on conflict (community_id, user_id) do update
        set rules_acknowledged = excluded.rules_acknowledged,
            status             = 'pending',
            created_at         = now(),
            responded_at       = null,
            responded_by       = null
        where community_join_requests.status in ('pending', 'cancelled');
    return 'requested';
  else -- private
    select id into v_invitation from community_invitations
      where community_id = p_community_id and invitee_id = v_user and status = 'pending';
    if v_invitation is null then raise exception 'invite_required' using errcode='P0001'; end if;
    perform accept_invitation(v_invitation, p_ack);
    return 'joined';
  end if;
end; $$;
revoke execute on function join_community(uuid, boolean) from public, anon, authenticated;
grant execute on function join_community(uuid, boolean) to authenticated;

-- accept_invitation gains the acknowledgement, so a private community's rules are accepted on the
-- invitation screen exactly as they are in the preview (UX-COMM-05 applies to all three privacy
-- settings). The one-argument version is dropped for the same reason as above.
drop function if exists accept_invitation(uuid);
create or replace function accept_invitation(p_invitation_id uuid, p_ack boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare v_cid uuid; v_user uuid := auth.uid(); v_groups uuid[]; v_g uuid;
begin
  select community_id, group_ids into v_cid, v_groups
    from community_invitations where id = p_invitation_id and invitee_id = v_user and status='pending';
  if v_cid is null then raise exception 'invitation_not_found' using errcode='P0001'; end if;
  if rules_ack_required(v_cid, p_ack) then
    raise exception 'rules_acknowledgement_required' using errcode='P0001';
  end if;
  perform add_member_to_community(v_cid, v_user, p_ack);
  foreach v_g in array coalesce(v_groups,'{}') loop
    insert into group_members (group_id, user_id) values (v_g, v_user) on conflict do nothing;
  end loop;
  update community_invitations set status='accepted', accepted_at=now() where id = p_invitation_id;
end; $$;
revoke execute on function accept_invitation(uuid, boolean) from public, anon, authenticated;
grant execute on function accept_invitation(uuid, boolean) to authenticated;

-- accept_join_request finally READS community_join_requests.rules_acknowledged, which is where the
-- requester's acceptance has been recorded since 0021. No gate here: the gate belongs to the
-- moment the requester consented, and an admin must not be blocked from accepting a request that
-- was made before the rules existed (the audit does not re-prompt anyone over an edit).
create or replace function accept_join_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_cid uuid; v_uid uuid; v_ack boolean; v_user uuid := auth.uid();
begin
  select community_id, user_id, rules_acknowledged into v_cid, v_uid, v_ack
    from community_join_requests where id = p_request_id;
  if v_cid is null then raise exception 'request_not_found' using errcode='P0001'; end if;
  if not may_approve_requests(v_cid) then raise exception 'forbidden' using errcode='P0001'; end if;
  update community_join_requests set status='accepted', responded_at=now(), responded_by=v_user
    where id = p_request_id;
  perform add_member_to_community(v_cid, v_uid, coalesce(v_ack, false));
end; $$;
revoke execute on function accept_join_request(uuid) from public, anon, authenticated;
grant execute on function accept_join_request(uuid) to authenticated;

-- The two group paths reach a community membership without going through join_community at all
-- (GR-09/GR-10: joining or being invited into a group makes you a member of its community). They
-- keep their own membership insert — routing them through add_member_to_community would also put
-- them in the general group, which is a different behaviour — but they now ask the same question
-- about the rules and record the same answer. Note the gate only engages for someone who is NOT
-- yet a community member, so joining a second group changes nothing for existing members.
drop function if exists join_group(uuid);
create or replace function join_group(p_group_id uuid, p_ack boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_cid uuid; v_private boolean;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select community_id, is_private into v_cid, v_private from groups where id = p_group_id;
  if v_cid is null then raise exception 'group_not_found' using errcode='P0001'; end if;
  if v_private then raise exception 'group_private_join_forbidden' using errcode='P0001'; end if;  -- GR-06/08
  if rules_ack_required(v_cid, p_ack) then
    raise exception 'rules_acknowledgement_required' using errcode='P0001';
  end if;
  perform record_community_entry(v_cid, v_user, p_ack);                      -- GR-09
  insert into group_members (group_id, user_id) values (p_group_id, v_user)
    on conflict (group_id, user_id) do nothing;
end; $$;
revoke execute on function join_group(uuid, boolean) from public, anon, authenticated;
grant execute on function join_group(uuid, boolean) to authenticated;

drop function if exists accept_group_invitation(uuid);
create or replace function accept_group_invitation(p_group_id uuid, p_ack boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_cid uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from group_invitations
                 where group_id=p_group_id and invitee_id=v_user and status='pending') then
    raise exception 'invitation_not_found' using errcode='P0001';
  end if;
  select community_id into v_cid from groups where id = p_group_id;
  if rules_ack_required(v_cid, p_ack) then
    raise exception 'rules_acknowledgement_required' using errcode='P0001';
  end if;
  perform record_community_entry(v_cid, v_user, p_ack);                      -- GR-10
  insert into group_members (group_id, user_id) values (p_group_id, v_user)
    on conflict (group_id, user_id) do nothing;
  update group_invitations set status='accepted', responded_at=now()
    where group_id=p_group_id and invitee_id=v_user and status='pending';
end; $$;
revoke execute on function accept_group_invitation(uuid, boolean) from public, anon, authenticated;
grant execute on function accept_group_invitation(uuid, boolean) to authenticated;

-- create_community_with_personal_tenant is 0098's body with one line changed: the creator wrote
-- the rules, so their acceptance is the act of creating the community.
create or replace function create_community_with_personal_tenant(
  p_name        text,
  p_type        text,
  p_country     text,
  p_privacy     text default 'public',
  p_description text default null,
  p_location    text default null,
  p_thumbnail_path   text default null,
  p_cover_image_path text default null,
  p_cancellation_rules_enabled boolean default false,
  p_cancellation_rules_text    text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid; v_community uuid; v_group uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not can_create_community() then
    raise exception 'owned_community_cap_reached' using errcode = 'P0001';
  end if;

  insert into tenants (type, name, country, is_personal, owner_id)
    values ('community', p_name, p_country, true, v_user) returning id into v_tenant;
  insert into tenant_memberships (user_id, tenant_id, role)
    values (v_user, v_tenant, 'community_owner');

  insert into communities (tenant_id, created_by, name, description, type, privacy, location,
                           thumbnail_path, cover_image_path,
                           cancellation_rules_enabled, cancellation_rules_text)
    values (v_tenant, v_user, p_name, p_description, p_type, p_privacy, p_location,
            p_thumbnail_path, p_cover_image_path,
            p_cancellation_rules_enabled, p_cancellation_rules_text)
    returning id into v_community;

  -- UX-COMM-17's defaults, spelled out rather than left to the column defaults so the matrix is
  -- readable at the one place a community is born.
  insert into community_permissions (community_id, create_posts, create_events, invite_members,
                                     create_groups, approve_join_requests)
    values (v_community, true, true, true, false, false);
  -- The creator is an admin; the co-organizer cap allows the first one on every tier (0098).
  -- They wrote the rules, so creating the community IS their acceptance — and when there are no
  -- rules there is nothing to accept, which is the column's NULL.
  insert into community_members (community_id, user_id, role, rules_accepted_at)
    values (v_community, v_user, 'admin',
            case when coalesce(p_cancellation_rules_enabled, false) then now() end);
  -- General group named "[name] group" (doc 3.2); Starter stays implicit (no community_subscriptions row).
  insert into groups (community_id, created_by, name, is_general)
    values (v_community, v_user, p_name || ' group', true) returning id into v_group;
  insert into group_members (group_id, user_id) values (v_group, v_user);

  return v_community;
end;
$$;
revoke execute on function create_community_with_personal_tenant(text, text, text, text, text, text, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function create_community_with_personal_tenant(text, text, text, text, text, text, text, text, boolean, text)
  to authenticated;

------------------------------------------------------------------------------
-- 4. Archived communities and groups are visible to admins only
------------------------------------------------------------------------------
-- UX-COMM-24, enforced where it cannot be bypassed. Until now a member could read an archived
-- community or group with a direct PostgREST select — only the client's own `.is('archived_at',
-- null)` filters and the explore RPCs (SECURITY DEFINER, already filtering) hid them.
--
-- Admins keep the read, which is what the Archived section of the switcher and Manage Groups are
-- built on (UX-COMM-09/18): CommunitySwitcher reads every membership's community row and splits it
-- by archived_at, so an admin's archived communities must keep arriving.
--
-- Knock-on, and intended: group_seasons and group_event_results name `groups` inside their own
-- policies (0035, 0044), so a member also stops seeing an archived group's seasons and results.
-- "A member sees neither, with no indication that it exists" is exactly that.
drop policy if exists "communities: read" on communities;
create policy "communities: read" on communities for select using (
  auth.uid() is not null and (archived_at is null or is_community_admin(id))
);

drop policy if exists "groups: read" on groups;
create policy "groups: read" on groups for select using (
  ((is_private = false and is_community_member(community_id)) or is_group_member(id))
  and (archived_at is null or is_community_admin(community_id))
);

------------------------------------------------------------------------------
-- 5. Unarchiving restores only what the archive took, and the count is real
------------------------------------------------------------------------------
-- 0028's unarchive cleared archived_at on EVERY group in the community, resurrecting ones an admin
-- had archived individually beforehand — a group deliberately retired came back the moment the
-- community did. Which groups the archive touched is now a recorded fact rather than an inference:
-- a timestamp comparison would have worked (both writes share one transaction's now()) but reads
-- as a coincidence, not as a rule.
alter table groups add column if not exists archived_with_community boolean not null default false;

comment on column groups.archived_with_community is
  'True only while this group is archived because its COMMUNITY was archived. archive_community '
  'sets it on the groups it actually archives and clears it on the ones it restores, so a group '
  'archived on its own (UX-COMM-18) is never resurrected by unarchiving the community.';

-- And the count: 0028 returned count(*) of all groups, archived or not, in both directions.
-- UX-COMM-24 wants the number in the confirmation — "how many groups will also be archived",
-- "how many groups come back with it" — so it returns the number of rows this call affected.
create or replace function archive_community(p_community_id uuid, p_archive boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not is_community_admin(p_community_id) then raise exception 'forbidden' using errcode='P0001'; end if;
  if p_archive then
    update communities set archived_at = now() where id = p_community_id;
    with touched as (
      update groups set archived_at = now(), archived_with_community = true
       where community_id = p_community_id and archived_at is null
      returning 1)
    select count(*) into v_count from touched;
  else
    update communities set archived_at = null where id = p_community_id;
    with touched as (
      update groups set archived_at = null, archived_with_community = false
       where community_id = p_community_id and archived_with_community
      returning 1)
    select count(*) into v_count from touched;
  end if;
  return v_count;
end; $$;
revoke execute on function archive_community(uuid, boolean) from public, anon, authenticated;
grant execute on function archive_community(uuid, boolean) to authenticated;

-- The two single-group RPCs keep the flag honest. archive_group is 0091's body (the general-group
-- guard) plus the flag; unarchive_group is 0036's plus the flag.
create or replace function archive_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_community uuid; v_general boolean;
begin
  if not is_group_admin(p_group_id, auth.uid()) then raise exception 'forbidden' using errcode='P0001'; end if;
  select community_id, is_general into v_community, v_general from groups where id = p_group_id;
  perform pg_advisory_xact_lock(hashtextextended('community_groups:'||coalesce(v_community::text,''), 0));
  if v_general and not exists (
      select 1 from groups g
      where g.community_id = v_community and g.id <> p_group_id and g.archived_at is null)
  then
    raise exception 'general_group_only_group' using errcode='P0001';
  end if;
  -- archived_with_community = false: this one was retired on its own and stays retired.
  update groups set archived_at = now(), archived_with_community = false
   where id = p_group_id and archived_at is null;
end; $$;
revoke execute on function archive_group(uuid) from public, anon, authenticated;
grant execute on function archive_group(uuid) to authenticated;

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
  update groups set archived_at = null, archived_with_community = false where id = p_group_id;
end; $$;
revoke execute on function unarchive_group(uuid) from public, anon, authenticated;
grant execute on function unarchive_group(uuid) to authenticated;

------------------------------------------------------------------------------
-- 6. The approval permission can see the queue it is allowed to answer
------------------------------------------------------------------------------
-- Pre-existing: accept_join_request and decline_join_request accept a member holding
-- approve_join_requests (0028), but "cjr: read" (0024) is admin-only, so that member could answer
-- requests they had no way of listing. The predicate the two RPCs already share becomes a helper —
-- shaped like 0098's may_create_group / may_create_event — and the read policy asks it too.
-- Policies evaluate as the calling role, so this one keeps a client grant.
create or replace function may_approve_requests(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_community_admin(c)
      or (is_community_member(c)
          and coalesce((select approve_join_requests from community_permissions where community_id=c), false));
$$;
-- anon is granted too, for the same reason 0098 restates it on is_community_admin: anon holds
-- SELECT on this schema, a policy is evaluated as the CALLING role, and a function anon cannot
-- execute turns what used to be an empty result into "permission denied for function". The
-- previous admin-only policy reached is_community_admin, which anon can call; this one must be no
-- harder to evaluate. It tells anon nothing — every branch is false without a session.
revoke execute on function may_approve_requests(uuid) from public, anon, authenticated;
grant execute on function may_approve_requests(uuid) to anon, authenticated;

drop policy if exists "cjr: read" on community_join_requests;
create policy "cjr: read" on community_join_requests for select
  using (user_id = auth.uid() or may_approve_requests(community_id));

drop policy if exists "cjr: manage" on community_join_requests;
create policy "cjr: manage" on community_join_requests for update
  using (may_approve_requests(community_id)) with check (may_approve_requests(community_id));

create or replace function decline_join_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_cid uuid; v_user uuid := auth.uid();
begin
  select community_id into v_cid from community_join_requests where id = p_request_id;
  if v_cid is null then raise exception 'request_not_found' using errcode='P0001'; end if;
  if not may_approve_requests(v_cid) then raise exception 'forbidden' using errcode='P0001'; end if;
  update community_join_requests set status='declined', responded_at=now(), responded_by=v_user
    where id = p_request_id;
end; $$;
revoke execute on function decline_join_request(uuid) from public, anon, authenticated;
grant execute on function decline_join_request(uuid) to authenticated;

------------------------------------------------------------------------------
-- 7. Self-check
------------------------------------------------------------------------------
-- 0094/0097/0098's habit: a partial paste into the hosted SQL editor must not leave half of this
-- applied and silently wrong.
do $$
declare v_txt text; v_n int;
begin
  -- The two new states are admitted, and nothing else crept in.
  select pg_get_constraintdef(oid) into v_txt from pg_constraint
   where conrelid = 'public.community_join_requests'::regclass
     and conname = 'community_join_requests_status_check';
  if v_txt is null or v_txt not like '%cancelled%' then
    raise exception '0099: community_join_requests still rejects cancelled (%)', coalesce(v_txt,'missing');
  end if;
  select pg_get_constraintdef(oid) into v_txt from pg_constraint
   where conrelid = 'public.community_invitations'::regclass
     and conname = 'community_invitations_status_check';
  if v_txt is null or v_txt not like '%declined%' then
    raise exception '0099: community_invitations still rejects declined (%)', coalesce(v_txt,'missing');
  end if;

  -- The two columns this migration is built on.
  if to_regclass('public.community_members') is not null
     and not exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='community_members'
                       and column_name='rules_accepted_at') then
    raise exception '0099: community_members.rules_accepted_at is missing';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='groups'
                   and column_name='archived_with_community') then
    raise exception '0099: groups.archived_with_community is missing';
  end if;

  -- The superseded one-argument signatures are gone: leaving one beside its replacement makes
  -- every existing call ambiguous rather than resolving to the new default.
  select string_agg(format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)), ', ')
    into v_txt
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and ((p.proname = 'add_member_to_community'  and p.pronargs = 2)
       or (p.proname = 'accept_invitation'        and p.pronargs = 1)
       or (p.proname = 'join_group'               and p.pronargs = 1)
       or (p.proname = 'accept_group_invitation'  and p.pronargs = 1));
  if v_txt is not null then
    raise exception '0099: superseded signatures still exist (%)', v_txt;
  end if;

  -- The internal helpers are not reachable through PostgREST (the 0094 rule).
  select string_agg(p.proname, ', ' order by p.proname) into v_txt
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('add_member_to_community', 'record_community_entry', 'rules_ack_required')
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'));
  if v_txt is not null then
    raise exception '0099: internal helpers still callable by anon/authenticated (%)', v_txt;
  end if;

  -- Archived rows are filtered in RLS, not only in the client's queries.
  select pg_get_expr(polqual, polrelid) into v_txt from pg_policy
   where polrelid = 'public.communities'::regclass and polname = 'communities: read';
  if v_txt is null or v_txt not like '%archived_at%' then
    raise exception '0099: "communities: read" does not filter archived rows (%)', coalesce(v_txt,'missing');
  end if;
  select pg_get_expr(polqual, polrelid) into v_txt from pg_policy
   where polrelid = 'public.groups'::regclass and polname = 'groups: read';
  if v_txt is null or v_txt not like '%archived_at%' then
    raise exception '0099: "groups: read" does not filter archived rows (%)', coalesce(v_txt,'missing');
  end if;

  -- No group may claim it was archived with its community while it is not archived at all.
  select count(*) into v_n from groups where archived_with_community and archived_at is null;
  if v_n <> 0 then raise exception '0099: % groups are flagged archived_with_community but active', v_n; end if;
end $$;
