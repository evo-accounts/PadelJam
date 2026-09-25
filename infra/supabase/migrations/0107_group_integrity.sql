-- 0107_group_integrity.sql
--
-- UX Audit — Groups, plan PR 1 (docs/audit/2026-09-25-ux-groups-plan.md, bugs B1–B5).
-- Server fixes the Groups screens need before they are rebuilt. No UI depends on the new
-- functions yet except remove_group_member, which useRemoveGroupMember switches to.
--
--   B1  "group_members: insert self" (0029) let any signed-in user insert themselves into ANY
--       group, private ones included, skipping join_group's private check. The policy goes:
--       membership is written only by the definer RPCs (join_group, accept_group_invitation,
--       create_group, add_group_admins, record_community_entry's callers).
--   B2  "group_members: delete" (0038) let a member delete their own row, skipping
--       leave_group's sole-admin guard. It goes too: leaving is leave_group, removing someone
--       is the new remove_group_member. 0108 records departures in both, which a direct
--       DELETE could not do.
--   B3  The general group was created with NO season (only create_group and start_new_season
--       insert one), and finish_event records results only into an open season — so a general
--       group's events never reached any ranking. Community creation now opens season 1, and
--       every season-less group gets one, dated from the group's creation, with the results of
--       its already-finished ranking events written in.
--   B4  invite_to_group asked only is_group_admin, so the "+ Invite members" row every member
--       sees answered `forbidden` even when the community's invite_members toggle is on
--       (UX-COMM-17, GR-14). A group member may now invite when the toggle allows it.
--   B5  There was no way to decline, and re-inviting someone whose invitation had been used
--       (they accepted, then left) hit `on conflict do nothing` silently. Invitations gain a
--       'declined' status and decline_group_invitation; a new invite replaces a spent row, so
--       the notification trigger (AFTER INSERT) fires again.
--
-- Also (decision 1): leave_group's sole-admin guard now applies to PRIVATE groups only. A
-- community admin manages every public group without being in it, so a public group can never
-- be left unmanaged and blocking the leave protected nothing. leave_group_preflight exposes the
-- same question so the client can ask it BEFORE the confirm sheet (UX-GRP-15).
--
-- And (decision 7): new communities name their general group "<name> Group". Existing names
-- are left alone.
--
-- HOSTED: paste as one script. The backfill in §6 is idempotent (it only touches groups with no
-- season at all). Probe afterwards:
--   select to_regprocedure('leave_group_preflight(uuid)') is not null
--      and to_regprocedure('decline_group_invitation(uuid)') is not null
--      and not exists (select 1 from groups g where not exists
--                        (select 1 from group_seasons s where s.group_id = g.id))
--      and not exists (select 1 from pg_policy where polname in
--                        ('group_members: insert self', 'group_members: delete')) as has_0107;

------------------------------------------------------------------------------
-- 1. B1/B2: no direct membership writes
------------------------------------------------------------------------------
drop policy if exists "group_members: insert self" on group_members;
drop policy if exists "group_members: delete" on group_members;
-- Responding to an invitation is accept_group_invitation / decline_group_invitation. A direct
-- UPDATE could mark an invitation 'accepted' without joining, which nothing should be able to do.
drop policy if exists "group_invitations: respond" on group_invitations;

------------------------------------------------------------------------------
-- 2. Leaving, and its pre-check
------------------------------------------------------------------------------
-- True when u is the last community admin inside private group g — the one case where leaving
-- would leave the group with nobody able to manage it (decision 1; GR-36/40).
create or replace function group_leave_blocked(g uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select gr.is_private
     and exists (select 1 from community_members cm
                 where cm.community_id = gr.community_id and cm.user_id = u and cm.role = 'admin')
     and not exists (select 1 from group_members gm
                     join community_members cm
                       on cm.community_id = gr.community_id and cm.user_id = gm.user_id and cm.role = 'admin'
                     where gm.group_id = g and gm.user_id <> u)
  from groups gr where gr.id = g;
$$;
revoke execute on function group_leave_blocked(uuid, uuid) from public, anon, authenticated;

create or replace function leave_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from group_members where group_id=p_group_id and user_id=v_user) then
    raise exception 'not_a_member' using errcode='P0001';
  end if;
  if coalesce(group_leave_blocked(p_group_id, v_user), false) then
    raise exception 'sole_admin_must_add_another' using errcode='P0001';
  end if;
  delete from group_members where group_id=p_group_id and user_id=v_user;   -- results are kept
end; $$;
revoke execute on function leave_group(uuid) from public, anon, authenticated;
grant execute on function leave_group(uuid) to authenticated;

-- 'ok' | 'sole_admin' | 'not_a_member' — the same checks leave_group makes, without leaving.
create or replace function leave_group_preflight(p_group_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from group_members where group_id=p_group_id and user_id=v_user) then
    return 'not_a_member';
  end if;
  if coalesce(group_leave_blocked(p_group_id, v_user), false) then return 'sole_admin'; end if;
  return 'ok';
end; $$;
revoke execute on function leave_group_preflight(uuid) from public, anon, authenticated;
grant execute on function leave_group_preflight(uuid) to authenticated;

------------------------------------------------------------------------------
-- 3. Removing someone from a group (this group only — they stay in the community)
------------------------------------------------------------------------------
create or replace function remove_group_member(p_group_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_group_admin(p_group_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if p_user_id = v_user then raise exception 'use_leave_group' using errcode='P0001'; end if;
  if not exists (select 1 from group_members where group_id=p_group_id and user_id=p_user_id) then
    raise exception 'not_a_member' using errcode='P0001';
  end if;
  delete from group_members where group_id=p_group_id and user_id=p_user_id;
end; $$;
revoke execute on function remove_group_member(uuid, uuid) from public, anon, authenticated;
grant execute on function remove_group_member(uuid, uuid) to authenticated;

------------------------------------------------------------------------------
-- 4. B4/B5: inviting
------------------------------------------------------------------------------
alter table group_invitations drop constraint if exists group_invitations_status_check;
alter table group_invitations add constraint group_invitations_status_check
  check (status in ('pending','accepted','declined'));

-- Who may invite into g: its admins, and — when the community's invite_members toggle is on —
-- its members. Being a member matters for private groups (you cannot invite into what you cannot
-- see) and keeps a public group's invites coming from people inside it.
create or replace function may_invite_to_group(g uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_group_admin(g, u)
      or (exists (select 1 from group_members where group_id = g and user_id = u)
          and coalesce((select cp.invite_members from community_permissions cp
                        join groups gr on gr.community_id = cp.community_id
                        where gr.id = g), false));
$$;
revoke execute on function may_invite_to_group(uuid, uuid) from public, anon, authenticated;
grant execute on function may_invite_to_group(uuid, uuid) to authenticated;

create or replace function invite_to_group(p_group_id uuid, p_invitee_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not may_invite_to_group(p_group_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  -- Already in: nothing to do.
  if exists (select 1 from group_members where group_id=p_group_id and user_id=p_invitee_id) then
    return;
  end if;
  -- A spent invitation (accepted then left, or declined) is replaced, not kept: the unique key
  -- would otherwise swallow the new one, and the notification fires on INSERT only.
  delete from group_invitations
    where group_id=p_group_id and invitee_id=p_invitee_id and status <> 'pending';
  insert into group_invitations (group_id, inviter_id, invitee_id)
    values (p_group_id, v_user, p_invitee_id) on conflict (group_id, invitee_id) do nothing;
end; $$;
revoke execute on function invite_to_group(uuid, uuid) from public, anon, authenticated;
grant execute on function invite_to_group(uuid, uuid) to authenticated;

create or replace function decline_group_invitation(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update group_invitations set status='declined', responded_at=now()
    where group_id=p_group_id and invitee_id=v_user and status='pending';
  if not found then raise exception 'invitation_not_found' using errcode='P0001'; end if;
end; $$;
revoke execute on function decline_group_invitation(uuid) from public, anon, authenticated;
grant execute on function decline_group_invitation(uuid) to authenticated;

------------------------------------------------------------------------------
-- 5. B3 + decision 7: community creation opens the general group's first season
------------------------------------------------------------------------------
-- 0099's body with two changes at the end: the general group is "<name> Group", and it gets
-- season 1 the way create_group's groups always have.
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
  -- General group named "<name> Group" (UX-GRP-01); Starter stays implicit (no community_subscriptions row).
  insert into groups (community_id, created_by, name, is_general)
    values (v_community, v_user, p_name || ' Group', true) returning id into v_group;
  insert into group_members (group_id, user_id) values (v_group, v_user);
  insert into group_seasons (group_id, season_number) values (v_group, 1);   -- B3

  return v_community;
end;
$$;
revoke execute on function create_community_with_personal_tenant(text, text, text, text, text, text, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function create_community_with_personal_tenant(text, text, text, text, text, text, text, text, boolean, text)
  to authenticated;

------------------------------------------------------------------------------
-- 6. B3 backfill: every season-less group gets season 1, and its finished events their results
------------------------------------------------------------------------------
-- Dated from the group's creation so every event it ever held falls inside the season. Only
-- groups with NO season at all are touched, so re-running this is a no-op.
with opened as (
  insert into group_seasons (group_id, season_number, started_at)
    select g.id, 1, g.created_at from groups g
    where not exists (select 1 from group_seasons s where s.group_id = g.id)
    returning id, group_id
)
-- The same write finish_event makes (0093), for each completed ranking event those groups held.
insert into group_event_results (group_season_id, event_id, user_id, final_placement, ranking_points)
select o.id, e.id, p.user_id, s.rank, placement_points(s.rank)
from opened o
join events e on e.group_id = o.group_id and e.status = 'completed' and e.counts_for_ranking
cross join lateral standings(e.id) s
join event_participants p on p.id = s.entity_id
where p.user_id is not null
on conflict (event_id, user_id) do nothing;
