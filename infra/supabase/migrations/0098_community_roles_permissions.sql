-- UX-COMM audit (docs/audit/2026-09-14-ux-community.md), pull request 1 of the plan.
--
-- Three changes that only work together, which is why they share one migration:
--
--   1. TWO ROLES. 'owner' is removed: every owner becomes an admin, the CHECK drops the value,
--      and transfer_ownership goes. The audit is explicit — "There is no protected role and no
--      ownership to transfer" (UX-COMM-20).
--
--   2. THE CO-ORGANIZER CAP HAS TO CHANGE FIRST. enforce_member_caps (0015, revised 0017) raises
--      when a row with role 'admin' is written and the community already holds `co_organizers`
--      admins. Starter's limit is 0 (0013). Owners escaped it only because their role was not
--      literally 'admin'. Backfilling them would therefore raise on every starter community, and
--      afterwards create_community_with_personal_tenant could not insert its own creator. The
--      cap's MEANING changes here: a co-organizer is an admin BEYOND THE FIRST, so one admin is
--      always allowed and the tiers keep the extra-organizer counts they were sold as.
--
--   3. A LAST-ADMIN GUARD THAT ACTUALLY EXISTS. The owner role was quietly doing this job:
--      leave_community refused 'owner', and nothing else needed a guard because an owner could
--      not be demoted or removed by anyone but themselves. With the role gone, four paths can
--      orphan a community — leave_community, remove_member, a raw PostgREST demotion under the
--      "community_members: update" policy (0009), and soft_delete_account (0059/0085/0087). RLS
--      cannot express "…and at least one admin survives", so the guard is a BEFORE UPDATE OR
--      DELETE trigger, which is the one place all four paths pass through.
--
-- Also here, because they all read the role: five member permissions (the audit's matrix), the
-- one-community cap lifted, the Jammer+ derivation narrowed to the creator, and set_community_plan
-- opened to any admin.
--
-- NOT here, deliberately: the three ownerless communities on hosted are left exactly as they are.
-- They backfill to zero rows (there is no owner row to update), and the new guard tolerates a
-- community that already has no admin — it only refuses to remove the LAST one.

------------------------------------------------------------------------------
-- 1. The co-organizer cap counts admins beyond the first
------------------------------------------------------------------------------
-- Identical to 0017's version except for the final comparison: `>` instead of `>=`, so a
-- community may always hold one admin regardless of tier. Starter (limit 0) gets exactly the
-- creator; Basic (1) gets the creator plus one co-organizer; and so on.
create or replace function enforce_member_caps() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_limit int; v_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended('cmember_cap:' || NEW.community_id::text, 0));

  if TG_OP = 'INSERT'
     or (TG_OP = 'UPDATE' and NEW.community_id is distinct from OLD.community_id) then
    v_limit := community_limit(NEW.community_id, 'members_per_community');
    if v_limit is not null then
      select count(*) into v_count from community_members where community_id = NEW.community_id;
      if v_count >= v_limit then
        raise exception 'members_per_community limit reached (%)', v_limit using errcode = 'P0001';
      end if;
    end if;
  end if;

  if NEW.role = 'admin' and (TG_OP = 'INSERT' or OLD.role is distinct from 'admin'
     or NEW.community_id is distinct from OLD.community_id) then
    v_limit := community_limit(NEW.community_id, 'co_organizers');
    if v_limit is not null then
      select count(*) into v_count from community_members
        where community_id = NEW.community_id and role = 'admin';
      -- v_count is the admin count BEFORE this row lands, so it is also the co-organizer count
      -- after it lands (admins-after minus the first). Refuse only once that exceeds the limit.
      if v_count > v_limit then
        raise exception 'co_organizers limit reached (%)', v_limit using errcode = 'P0001';
      end if;
    end if;
  end if;

  return NEW;
end; $$;
revoke execute on function enforce_member_caps() from public, anon, authenticated;

------------------------------------------------------------------------------
-- 2. Backfill owner -> admin, then drop the value from the CHECK
------------------------------------------------------------------------------
-- The cap trigger cannot trip on the statement above's new semantics (an existing community can
-- hold at most `limit` admins, and limit is never > limit), but the backfill must not depend on
-- that reasoning holding for every row on hosted. Disable the trigger for the statement instead:
-- the promotion is a data migration, not a member action, and nothing it writes is subject to a
-- plan the community has not already been granted.
alter table community_members disable trigger trg_member_caps;
update community_members set role = 'admin' where role = 'owner';
alter table community_members enable trigger trg_member_caps;

alter table community_members drop constraint community_members_role_check;
alter table community_members add constraint community_members_role_check
  check (role in ('admin', 'member'));

------------------------------------------------------------------------------
-- 3. The role helpers stop naming 'owner'
------------------------------------------------------------------------------
-- Both appear in RLS policies, which evaluate as the CALLING role, so both keep a client grant
-- (0094 carves them out for exactly this reason). anon holds SELECT on the public schema (0030)
-- and several read policies reach these helpers, so the anon grant is restated rather than
-- dropped — this migration is not the place to change who can read what.
create or replace function is_community_admin(c uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from community_members
    where community_id = c and user_id = auth.uid() and role = 'admin'
  );
$$;
revoke execute on function is_community_admin(uuid) from public, anon, authenticated;
grant execute on function is_community_admin(uuid) to anon, authenticated;

create or replace function is_group_admin(g uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from groups gr
    join community_members cm
      on cm.community_id = gr.community_id and cm.user_id = u and cm.role = 'admin'
    where gr.id = g
      and (gr.is_private = false
           or exists (select 1 from group_members gm where gm.group_id = g and gm.user_id = u))
  );
$$;
revoke execute on function is_group_admin(uuid, uuid) from public, anon, authenticated;
grant execute on function is_group_admin(uuid, uuid) to anon, authenticated;

-- Community admins eligible to be added to a group (0068). `in ('owner','admin')` would still be
-- correct after the backfill, but a literal the CHECK now rejects reads as a live branch.
create or replace function add_group_admins(p_group_id uuid, p_user_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_comm uuid;
begin
  if not is_group_admin(p_group_id, v_uid) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select community_id into v_comm from groups where id = p_group_id;
  insert into group_members (group_id, user_id)
    select p_group_id, u from unnest(p_user_ids) u
    where exists (
      select 1 from community_members cm
      where cm.community_id = v_comm and cm.user_id = u and cm.role = 'admin')
  on conflict do nothing;
end; $$;
revoke execute on function add_group_admins(uuid, uuid[]) from public, anon, authenticated;
grant execute on function add_group_admins(uuid, uuid[]) to authenticated;

-- GR-24 ("the sole community owner cannot leave a group") has no subject any more. GR-36/40 —
-- the sole community-admin among a group's members cannot leave it — already covers the case
-- the owner branch was standing in for, so the branch goes rather than being re-pointed at
-- 'admin', which would have made the two checks the same check raising two different codes.
create or replace function leave_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_cid uuid; v_role text; v_admin_count int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from group_members where group_id=p_group_id and user_id=v_user) then
    raise exception 'not_a_member' using errcode='P0001';
  end if;
  select community_id into v_cid from groups where id = p_group_id;
  select role into v_role from community_members where community_id=v_cid and user_id=v_user;
  if v_role = 'admin' then                                                  -- GR-36/40
    select count(*) into v_admin_count
      from group_members gm
      join community_members cm on cm.community_id=v_cid and cm.user_id=gm.user_id and cm.role = 'admin'
      where gm.group_id=p_group_id and gm.user_id <> v_user;                -- exclude the leaver
    if v_admin_count = 0 then raise exception 'sole_admin_must_add_another' using errcode='P0001'; end if;
  end if;
  delete from group_members where group_id=p_group_id and user_id=v_user;   -- GR-15/16: data never deleted
end; $$;
revoke execute on function leave_group(uuid) from public, anon, authenticated;
grant execute on function leave_group(uuid) to authenticated;

------------------------------------------------------------------------------
-- 4. transfer_ownership is gone
------------------------------------------------------------------------------
drop function if exists transfer_ownership(uuid, uuid);

------------------------------------------------------------------------------
-- 5. The last-admin guard
------------------------------------------------------------------------------
-- One BEFORE UPDATE OR DELETE trigger covers all four ways an admin row can leave: leave_community,
-- remove_member, a direct PostgREST demotion under "community_members: update" (0009), and
-- soft_delete_account. SECURITY DEFINER so the survivor count sees every row, not the caller's
-- RLS-visible subset; the advisory lock key is the one enforce_member_caps already uses, so two
-- admins leaving at the same moment serialize and cannot both observe the other surviving.
--
-- The rule is "do not orphan a community", not "a community must always have an admin":
--   * another admin survives            -> allowed
--   * no admin survives and no member   -> allowed (nothing is left to administer; the last
--                                          person out may always leave, and an account deletion
--                                          is never blocked by a community only that account is in)
--   * no admin survives, members remain -> refused; someone must be promoted first (UX-COMM-20/23)
-- A community that ALREADY has no admin (hosted has three) is untouched: OLD.role is 'member'
-- there, so the guard never engages.
create or replace function enforce_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_row community_members; v_leaving boolean;
begin
  v_row := case when TG_OP = 'DELETE' then OLD else NEW end;

  if TG_OP = 'DELETE' then
    v_leaving := OLD.role = 'admin';
  else
    v_leaving := OLD.role = 'admin'
      and (NEW.role is distinct from 'admin' or NEW.community_id is distinct from OLD.community_id);
  end if;
  if not v_leaving then return v_row; end if;

  -- The community itself is being torn down (a cascade from `delete from communities`, or from
  -- the tenant above it). There is nothing left to orphan, and refusing here would make a
  -- community with members undeletable.
  if not exists (select 1 from communities where id = OLD.community_id) then return v_row; end if;

  perform pg_advisory_xact_lock(hashtextextended('cmember_cap:' || OLD.community_id::text, 0));

  if exists (select 1 from community_members
             where community_id = OLD.community_id and id <> OLD.id and role = 'admin') then
    return v_row;                                   -- another admin survives
  end if;
  if exists (select 1 from community_members
             where community_id = OLD.community_id and id <> OLD.id) then
    raise exception 'last_admin_must_promote_first' using errcode = 'P0001';
  end if;
  return v_row;                                     -- nobody left behind
end; $$;
revoke execute on function enforce_last_admin() from public, anon, authenticated;

drop trigger if exists trg_last_admin on community_members;
create trigger trg_last_admin before update or delete on community_members
  for each row execute function enforce_last_admin();

-- leave_community's 'owner' test is replaced by the trigger. It keeps the membership lookup so a
-- non-member still gets 'not_a_member' rather than a silent no-op.
create or replace function leave_community(p_community_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_role text;
begin
  select role into v_role from community_members where community_id=p_community_id and user_id=v_user;
  if v_role is null then raise exception 'not_a_member' using errcode='P0001'; end if;
  delete from group_members gm using groups g
    where gm.group_id = g.id and g.community_id = p_community_id and gm.user_id = v_user;
  -- trg_last_admin raises 'last_admin_must_promote_first' if this would orphan the community.
  delete from community_members where community_id = p_community_id and user_id = v_user;
end; $$;
revoke execute on function leave_community(uuid) from public, anon, authenticated;
grant execute on function leave_community(uuid) to authenticated;

-- remove_member had no guard at all; it now inherits the trigger's. Restated verbatim otherwise.
create or replace function remove_member(p_community_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_community_admin(p_community_id) then raise exception 'forbidden' using errcode='P0001'; end if;
  delete from group_members gm using groups g
    where gm.group_id = g.id and g.community_id = p_community_id and gm.user_id = p_user_id;
  -- trg_last_admin raises 'last_admin_must_promote_first' if this would orphan the community.
  delete from community_members where community_id = p_community_id and user_id = p_user_id;
end; $$;
revoke execute on function remove_member(uuid, uuid) from public, anon, authenticated;
grant execute on function remove_member(uuid, uuid) to authenticated;

------------------------------------------------------------------------------
-- 6. Five member permissions
------------------------------------------------------------------------------
-- 0012's header recorded the opposite decision — "Admin-only actions (create groups / create
-- events) are NEVER columns here". The audit reverses it: UX-COMM-17 lists five member toggles,
-- with create events on by default and create groups off. That comment is amended in place rather
-- than deleted, so the reversal is legible from either file.
alter table community_permissions add column if not exists create_groups boolean not null default false;
alter table community_permissions add column if not exists create_events boolean not null default true;
alter table community_permissions alter column invite_members set default true;
alter table community_permissions alter column approve_join_requests set default false;
alter table community_permissions alter column create_posts set default true;

-- Existing rows are reset to the audit's matrix, following 0020's precedent for create_posts.
-- This is a baseline reset before launch, not a merge: the matrix is what every community is
-- defined to start from, and the only rows that exist are seed and audit fixtures.
update community_permissions set
  create_posts          = true,
  create_events         = true,
  invite_members        = true,
  create_groups         = false,
  approve_join_requests = false;

comment on table community_permissions is
  'Member capability toggles (UX-COMM-17). Five of them: create_posts, create_events and '
  'invite_members default ON; create_groups and approve_join_requests default OFF. 0012 excluded '
  'create_groups/create_events on the grounds that they were admin-only and enforced by role; '
  '0098 reversed that with the product owner on 2026-09-14 because the audit makes both '
  'member-grantable. Admins are never constrained by this table.';

------------------------------------------------------------------------------
-- 7. The two new toggles are enforced, not just stored
------------------------------------------------------------------------------
-- Permission-only predicates, shaped like can_create_post (0028): admin, or a member the
-- community has granted the toggle. Kept separate from can_create_group/can_create_event so the
-- RLS policy and the RPC can ask the permission question without the plan-cap question, which
-- belongs to the cap triggers.
create or replace function may_create_group(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_community_admin(c)
      or (is_community_member(c)
          and coalesce((select create_groups from community_permissions where community_id=c), false));
$$;
revoke execute on function may_create_group(uuid) from public, anon, authenticated;
grant execute on function may_create_group(uuid) to authenticated;

create or replace function may_create_event(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_community_admin(c)
      or (is_community_member(c)
          and coalesce((select create_events from community_permissions where community_id=c), false));
$$;
revoke execute on function may_create_event(uuid) from public, anon, authenticated;
grant execute on function may_create_event(uuid) to authenticated;

-- groups: insert (0009) was admin-only. It is the direct-PostgREST path; create_group below is
-- the RPC path. Both now ask may_create_group.
drop policy if exists "groups: insert" on groups;
create policy "groups: insert" on groups for insert
  with check (may_create_group(community_id));

create or replace function can_create_group(p_community_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select may_create_group(p_community_id)
     and (community_limit(p_community_id,'groups_per_community') is null
          or (select count(*) from groups where community_id = p_community_id and archived_at is null)
             < community_limit(p_community_id,'groups_per_community'));
$$;
revoke execute on function can_create_group(uuid) from public, anon, authenticated;
grant execute on function can_create_group(uuid) to authenticated;

create or replace function create_group(
  p_community_id uuid, p_name text, p_description text default null,
  p_is_private boolean default false, p_thumbnail_path text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_group uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not may_create_group(p_community_id) then raise exception 'forbidden' using errcode='P0001'; end if;
  if coalesce(btrim(p_name),'') = '' then raise exception 'name_required' using errcode='P0001'; end if;
  -- groups_per_community cap enforced by existing enforce_group_cap BEFORE INSERT trigger
  -- (0015+0017, archived-aware). Let it raise on overflow (avoids a TOCTOU pre-check).
  insert into groups (community_id, created_by, name, description, is_private, thumbnail_path, is_general)
    values (p_community_id, v_user, p_name, p_description, coalesce(p_is_private,false), p_thumbnail_path, false)
    returning id into v_group;
  insert into group_members (group_id, user_id) values (v_group, v_user)
    on conflict (group_id, user_id) do nothing;            -- GR-05: creator is sole initial member
  insert into group_seasons (group_id, season_number) values (v_group, 1);  -- GR-20/30
  return v_group;
end; $$;
revoke execute on function create_group(uuid, text, text, boolean, text) from public, anon, authenticated;
grant execute on function create_group(uuid, text, text, boolean, text) to authenticated;

create or replace function can_create_event(p_group_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_group_id is null then auth.uid() is not null
    else may_create_event((select community_id from groups where id = p_group_id)) end;
$$;
revoke execute on function can_create_event(uuid) from public, anon, authenticated;
grant execute on function can_create_event(uuid) to authenticated;

-- create_event as 0067 left it, with the group gate widened from is_community_admin to
-- may_create_event. Everything else is verbatim.
create or replace function create_event(p_payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_group uuid := nullif(p_payload->>'group_id','')::uuid;
  v_private boolean := coalesce((p_payload->>'is_private')::boolean, false);
  v_spec text := p_payload->>'specification';
  v_org_role text := p_payload->>'organizer_role';
  v_recurring boolean := (p_payload->'series') is not null and (p_payload->'series') <> 'null'::jsonb;
  v_event uuid; v_series uuid; v_cid uuid; v_inv jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if v_group is not null then
    select community_id into v_cid from groups where id = v_group and archived_at is null;
    if v_cid is null then raise exception 'group_not_found' using errcode='P0001'; end if;
    if not may_create_event(v_cid) then raise exception 'forbidden' using errcode='P0001'; end if;
    if (select is_private from groups where id = v_group) and not is_group_member(v_group) then
      raise exception 'forbidden' using errcode='P0001'; end if;
  end if;
  if v_group is null then v_private := true; end if;
  if coalesce(btrim(p_payload->>'name'),'') = '' then raise exception 'name_required' using errcode='P0001'; end if;
  if (p_payload->>'event_type') not in ('americano','mexicano','up_and_down')
     or v_spec not in ('classic','mixed','team')
     or (p_payload->>'scoring_mode') not in ('points','time','classic')
     or v_org_role not in ('organizing_only','organizing_and_playing') then
    raise exception 'invalid_event_config' using errcode='P0001'; end if;

  if v_recurring then
    if v_group is null then raise exception 'series_requires_group' using errcode='P0001'; end if;
    insert into event_series (group_id, organizer_id, day_of_week, start_time, duration_minutes, invite_lead_days)
    values (v_group, v_user, (p_payload->'series'->>'day_of_week')::int,
            (p_payload->'series'->>'start_time')::time, (p_payload->'series'->>'duration_minutes')::int,
            (p_payload->'series'->>'invite_lead_days')::int)
    returning id into v_series;
  end if;

  insert into events (group_id, series_id, organizer_id, event_type, specification, scoring_mode,
    scoring_value, venue_id, manual_location_name, manual_location_address, has_location, num_courts,
    starts_at, duration_minutes, allow_standby, standby_spots, is_private, entrance_fee_enabled,
    entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number, players_submit_results,
    organizer_role, name, description, thumbnail_path, location_point, location_text, counts_for_ranking)
  values (v_group, v_series, v_user, p_payload->>'event_type', v_spec, p_payload->>'scoring_mode',
    nullif(p_payload->>'scoring_value','')::int, nullif(p_payload->>'venue_id','')::uuid,
    p_payload->>'manual_location_name', p_payload->>'manual_location_address',
    coalesce((p_payload->>'has_location')::boolean,false), (p_payload->>'num_courts')::int,
    (p_payload->>'starts_at')::timestamptz, (p_payload->>'duration_minutes')::int,
    coalesce((p_payload->>'allow_standby')::boolean,false), nullif(p_payload->>'standby_spots','')::int,
    v_private, coalesce((p_payload->>'entrance_fee_enabled')::boolean,false),
    nullif(p_payload->>'entrance_fee_amount','')::numeric, nullif(p_payload->>'entrance_fee_method',''),
    p_payload->>'entrance_fee_mba_number', coalesce((p_payload->>'players_submit_results')::boolean,false),
    v_org_role, p_payload->>'name', p_payload->>'description', p_payload->>'thumbnail_path',
    case
        when p_payload->>'location_lat' is not null and p_payload->>'location_lng' is not null
        then st_setsrid(st_makepoint((p_payload->>'location_lng')::float8, (p_payload->>'location_lat')::float8), 4326)::geography
      end,
    nullif(p_payload->>'location_text',''),
    (v_group is not null and v_private = false))
  returning id into v_event;

  if jsonb_typeof(p_payload->'court_ids') = 'array' then
    insert into event_courts (event_id, court_id)
    select v_event, (c)::uuid from jsonb_array_elements_text(p_payload->'court_ids') c on conflict do nothing;
  end if;

  if v_org_role = 'organizing_and_playing' then
    insert into event_participants (event_id, user_id, status, confirmed_at, joined_at)
    values (v_event, v_user, 'confirmed', now(), now());
  end if;

  if v_group is not null and v_private = false then
    insert into event_invitations (event_id, invitee_id, invited_by)
    select v_event, gm.user_id, v_user from group_members gm
    where gm.group_id = v_group and gm.user_id <> v_user;
  else
    if jsonb_typeof(p_payload->'invitees') = 'array' then
      for v_inv in select * from jsonb_array_elements(p_payload->'invitees') loop
        insert into event_invitations (event_id, invitee_id, invitee_name, invitee_email, invitee_phone, invited_by)
        values (v_event, nullif(v_inv->>'invitee_id','')::uuid, v_inv->>'name', v_inv->>'email', v_inv->>'phone', v_user);
      end loop;
    end if;
  end if;
  return v_event;
end; $$;
revoke execute on function create_event(jsonb) from public, anon, authenticated;
grant execute on function create_event(jsonb) to authenticated;

-- duplicate_event as 0051 left it, with the same substitution on its M2 re-check.
create or replace function duplicate_event(p_event_id uuid, p_overrides jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_src events%rowtype;
  v_new uuid;
  v_cid uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  select * into v_src from events where id = p_event_id;
  if v_src.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;

  -- M2: re-apply create_event's gate for group events.
  if v_src.group_id is not null then
    select community_id into v_cid from groups where id = v_src.group_id and archived_at is null;
    if v_cid is null then raise exception 'group_not_found' using errcode='P0001'; end if;
    if not may_create_event(v_cid) then raise exception 'forbidden' using errcode='P0001'; end if;
  end if;

  insert into events (group_id, series_id, organizer_id, event_type, specification, scoring_mode,
    scoring_value, venue_id, manual_location_name, manual_location_address, has_location, num_courts,
    starts_at, duration_minutes, allow_standby, standby_spots, is_private, entrance_fee_enabled,
    entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number, players_submit_results,
    organizer_role, name, description, thumbnail_path, counts_for_ranking, status,
    finished_early, finish_message, published_at)
  values (v_src.group_id, v_src.series_id, v_user, v_src.event_type, v_src.specification, v_src.scoring_mode,
    v_src.scoring_value, v_src.venue_id, v_src.manual_location_name, v_src.manual_location_address,
    v_src.has_location, v_src.num_courts,
    coalesce(nullif(p_overrides->>'starts_at','')::timestamptz, now()),
    v_src.duration_minutes, v_src.allow_standby, v_src.standby_spots, v_src.is_private, v_src.entrance_fee_enabled,
    v_src.entrance_fee_amount, v_src.entrance_fee_method, v_src.entrance_fee_mba_number, v_src.players_submit_results,
    v_src.organizer_role, coalesce(p_overrides->>'name', v_src.name), v_src.description,
    coalesce(p_overrides->>'thumbnail_path', v_src.thumbnail_path), v_src.counts_for_ranking, 'scheduled',
    false, null, null)
  returning id into v_new;

  -- JM-39: copy invitations only (reset to pending); do NOT copy participants/waiting-list.
  insert into event_invitations (event_id, invitee_id, invitee_name, invitee_email, invitee_phone, status, invited_by)
  select v_new, invitee_id, invitee_name, invitee_email, invitee_phone, 'pending', v_user
  from event_invitations where event_id = p_event_id;

  return v_new;
end; $$;
revoke execute on function duplicate_event(uuid, jsonb) from public, anon, authenticated;
grant execute on function duplicate_event(uuid, jsonb) to authenticated;

------------------------------------------------------------------------------
-- 8. The join-request queue follows the admin role, not the owner role
------------------------------------------------------------------------------
-- 0062 and 0063 scope the community half of the partner-requests inbox to `role = 'owner'`. After
-- the backfill that predicate matches nothing, and the pending-request count on Home would have
-- silently gone to zero. (A member holding approve_join_requests still cannot see the queue —
-- that is the pre-existing read-policy bug the plan assigns to pull request 2.)
create or replace function partner_request_summary() returns integer
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from partner_requests pr
      where pr.target_id = auth.uid() and pr.status = 'pending')
  + (select count(*) from community_join_requests jr
      where jr.status = 'pending'
        and exists (select 1 from community_members cm
                     where cm.community_id = jr.community_id
                       and cm.user_id = auth.uid() and cm.role = 'admin'));
$$;
revoke execute on function partner_request_summary() from public, anon, authenticated;
grant execute on function partner_request_summary() to authenticated;

create or replace function incoming_partner_requests()
returns table (
  kind             text,
  request_id       uuid,
  entity_id        uuid,
  entity_name      text,
  requester_id     uuid,
  requester_name   text,
  requester_avatar text,
  created_at       timestamptz
)
language sql stable security definer set search_path = public as $$
  select 'event'::text, pr.id, e.id, e.name, p.id, p.full_name, p.avatar_url, pr.created_at
  from partner_requests pr
  join events e   on e.id = pr.event_id
  join profiles p on p.id = pr.requester_id
  where pr.target_id = auth.uid() and pr.status = 'pending'
  union all
  select 'community'::text, jr.id, c.id, c.name, p.id, p.full_name, p.avatar_url, jr.created_at
  from community_join_requests jr
  join communities c on c.id = jr.community_id
  join profiles p    on p.id = jr.user_id
  where jr.status = 'pending'
    and exists (select 1 from community_members cm
                 where cm.community_id = jr.community_id
                   and cm.user_id = auth.uid() and cm.role = 'admin')
  order by created_at desc;
$$;
revoke execute on function incoming_partner_requests() from public, anon, authenticated;
grant execute on function incoming_partner_requests() to authenticated;

------------------------------------------------------------------------------
-- 9. Creating a community: admin creator, full permission matrix, no cap
------------------------------------------------------------------------------
-- UX-COMM-09: "New community" is always available and plan limits do not apply during the MVP.
-- The zero-argument signature is kept so packages/api's query and the generated types survive.
create or replace function can_create_community() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null;
$$;
revoke execute on function can_create_community() from public, anon, authenticated;
grant execute on function can_create_community() to authenticated;

-- 0023's body with three changes: the creator's row is 'admin', the permissions row is written
-- with the whole matrix rather than create_posts alone, and the owned-community cap is gone.
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
  -- The creator is an admin; the co-organizer cap allows the first one on every tier (section 1).
  insert into community_members (community_id, user_id, role) values (v_community, v_user, 'admin');
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
-- 10. Jammer+ derivation narrows to the creator
------------------------------------------------------------------------------
-- 0014 granted the derived plan to the community OWNER. Translating that to "every admin" would
-- widen a paid entitlement as a side effect of a role change, which nobody asked for. It narrows
-- to communities.created_by instead — a recorded fact since 0018, populated on every row, and
-- independent of when the backfill runs. Internal helper (0094): no client grant.
create or replace function account_plan(u uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (
      select 1 from subscriptions s
      where s.user_id = u and s.plan_id = 'jammer_plus' and s.status in ('trialing','active')
    ) then 'jammer_plus'
    when exists (
      select 1 from communities c
      where c.created_by = u
        and community_has_feature(c.id, 'jammer_plus_included')
    ) then 'jammer_plus'
    else 'free'
  end;
$$;
revoke execute on function account_plan(uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- 11. Any admin can set the community plan
------------------------------------------------------------------------------
-- 0095's body, with the owner test replaced by is_community_admin. UX-COMM-15 puts every admin
-- action behind one settings sheet, and the plan is one of them.
create or replace function set_community_plan(p_community_id uuid, p_plan text) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_members int; v_groups int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_plan not in ('starter', 'community_pro') then raise exception 'invalid_plan' using errcode='P0001'; end if;
  if not is_community_admin(p_community_id) then
    raise exception 'forbidden' using errcode='P0001';
  end if;
  if p_plan = 'starter' then
    select count(*) into v_members from community_members where community_id = p_community_id;
    select count(*) into v_groups from groups where community_id = p_community_id and archived_at is null;
    if v_members > coalesce(community_limit_for_plan('starter', 'members_per_community'), 2147483647)
       or v_groups > coalesce(community_limit_for_plan('starter', 'groups_per_community'), 2147483647) then
      raise exception 'plan_downgrade_over_limit' using errcode='P0001';
    end if;
    delete from community_subscriptions where community_id = p_community_id and provider = 'manual';
  else
    insert into community_subscriptions (community_id, dimension, plan_id, status, provider)
    values (p_community_id, 'community', 'community_pro', 'active', 'manual')
    on conflict (community_id) do update set plan_id = 'community_pro', status = 'active', provider = 'manual', updated_at = now();
  end if;
  return community_plan(p_community_id);
end; $$;
revoke execute on function set_community_plan(uuid, text) from public, anon, authenticated;
grant execute on function set_community_plan(uuid, text) to authenticated;

------------------------------------------------------------------------------
-- 12. Self-check
------------------------------------------------------------------------------
-- In the spirit of 0094/0097: a partial paste into the hosted SQL editor must not leave half of
-- this applied and silently wrong.
do $$
declare v_n int; v_txt text;
begin
  -- The backfill left no owner rows, and the constraint no longer admits the value.
  select count(*) into v_n from community_members where role = 'owner';
  if v_n <> 0 then raise exception '0098: % community_members rows still hold role=owner', v_n; end if;
  select pg_get_constraintdef(oid) into v_txt from pg_constraint
   where conrelid = 'public.community_members'::regclass and conname = 'community_members_role_check';
  if v_txt is null or v_txt like '%owner%' then
    raise exception '0098: community_members_role_check still admits owner (%)', coalesce(v_txt, 'missing');
  end if;

  -- transfer_ownership is gone.
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'transfer_ownership') then
    raise exception '0098: transfer_ownership still exists';
  end if;

  -- The last-admin guard is attached and enabled.
  if not exists (select 1 from pg_trigger
                 where tgrelid = 'public.community_members'::regclass
                   and tgname = 'trg_last_admin' and tgenabled <> 'D') then
    raise exception '0098: trg_last_admin is missing or disabled';
  end if;
  -- ...and so is the cap trigger the backfill disabled mid-migration.
  if not exists (select 1 from pg_trigger
                 where tgrelid = 'public.community_members'::regclass
                   and tgname = 'trg_member_caps' and tgenabled <> 'D') then
    raise exception '0098: trg_member_caps was left disabled';
  end if;

  -- Five columns, with the audit's defaults.
  select string_agg(a.attname || '=' || coalesce(pg_get_expr(d.adbin, d.adrelid), 'none'), ', ' order by a.attname)
    into v_txt
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.community_permissions'::regclass and a.attnum > 0 and not a.attisdropped
     and a.attname in ('create_posts','create_events','invite_members','create_groups','approve_join_requests');
  if v_txt is distinct from 'approve_join_requests=false, create_events=true, create_groups=false, create_posts=true, invite_members=true' then
    raise exception '0098: community_permissions defaults are wrong (%)', coalesce(v_txt, 'columns missing');
  end if;
  select count(*) into v_n from community_permissions
   where not (create_posts and create_events and invite_members)
      or create_groups or approve_join_requests;
  if v_n <> 0 then raise exception '0098: % community_permissions rows were not backfilled', v_n; end if;

  -- The cap allows one admin on every tier (starter's co_organizers limit is 0).
  if coalesce((select value from plan_limits where plan_id='starter' and limit_key='co_organizers'), -1) <> 0 then
    raise exception '0098: starter co_organizers is no longer 0 — re-check the beyond-the-first reading';
  end if;
end $$;
