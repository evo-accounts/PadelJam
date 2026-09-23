-- 0104_downgrade_guard_all_limits.sql
--
-- Guard ALL FOUR plan limits on a plan change, not just members and groups.
--
-- 0103 lifted the guard out of the `p_plan = 'starter'` branch so it runs for every target, but it
-- still only checked `members_per_community` and `groups_per_community`. The other two seeded
-- limits tighten on a downgrade and were unchecked:
--
--     co_organizers      pro 3  ->  basic 1  ->  starter 0
--     recurring_events   pro ∞  ->  basic 5  ->  starter 1
--
-- THIS CHANGES BEHAVIOUR FOR EXISTING COMMUNITIES, which is why it is its own migration and its
-- own decision rather than a tidy-up folded into 0103. Downgrades that succeed today will start
-- being refused with `plan_downgrade_over_limit` until the community fits. The sharpest edge is
-- Starter's `co_organizers` of 0: a community with a second admin can no longer return to Starter
-- at all until one is demoted. That is the intended reading of the limit — Starter is "one admin,
-- no co-organizers" — but it was not enforced before, so it will look like a regression to anyone
-- who hits it without knowing.
--
-- HOW EACH IS COUNTED, matching the triggers that enforce them on INSERT so the two never disagree:
--
--   co_organizers     `enforce_member_caps` (0098:58-66) compares the admin count BEFORE the new
--                     row against the limit, i.e. co-organizers are admins MINUS the creator, who
--                     holds the first slot. So the count here is `admins - 1`, floored at 0 for a
--                     community whose creator somehow is not an admin row.
--
--   recurring_events  `enforce_recurring_events_cap` (0045:11) counts `event_series` joined to
--                     `groups` on the community, filtered to `is_active` and `deleted_at is null`.
--                     Copied exactly.
--
-- A NULL limit still means unlimited and coalesces to a ceiling nothing reaches. Upgrades remain
-- safe to check unconditionally: a looser target cannot be tripped by a count that already fits a
-- tighter one.

create or replace function set_community_plan(p_community_id uuid, p_plan text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_user       uuid := auth.uid();
  v_members    int;
  v_groups     int;
  v_co_orgs    int;
  v_series     int;
  v_max_members int;
  v_max_groups  int;
  v_max_co_orgs int;
  v_max_series  int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_plan not in ('starter', 'basic', 'community_pro') then
    raise exception 'invalid_plan' using errcode='P0001';
  end if;
  if not is_community_admin(p_community_id) then
    raise exception 'forbidden' using errcode='P0001';
  end if;

  v_max_members := coalesce(community_limit_for_plan(p_plan, 'members_per_community'), 2147483647);
  v_max_groups  := coalesce(community_limit_for_plan(p_plan, 'groups_per_community'),  2147483647);
  v_max_co_orgs := coalesce(community_limit_for_plan(p_plan, 'co_organizers'),         2147483647);
  v_max_series  := coalesce(community_limit_for_plan(p_plan, 'recurring_events'),      2147483647);

  select count(*) into v_members from community_members where community_id = p_community_id;

  select count(*) into v_groups from groups
    where community_id = p_community_id and archived_at is null;

  -- Admins minus the creator's own slot — see the note above.
  select greatest(count(*) - 1, 0) into v_co_orgs from community_members
    where community_id = p_community_id and role = 'admin';

  select count(*) into v_series
    from event_series es join groups g on g.id = es.group_id
   where g.community_id = p_community_id and es.is_active and es.deleted_at is null;

  if v_members  > v_max_members
     or v_groups  > v_max_groups
     or v_co_orgs > v_max_co_orgs
     or v_series  > v_max_series then
    raise exception 'plan_downgrade_over_limit' using errcode='P0001';
  end if;

  if p_plan = 'starter' then
    delete from community_subscriptions where community_id = p_community_id and provider = 'manual';
  else
    insert into community_subscriptions (community_id, dimension, plan_id, status, provider)
    values (p_community_id, 'community', p_plan, 'active', 'manual')
    on conflict (community_id) do update
      set plan_id = p_plan, status = 'active', provider = 'manual', updated_at = now();
  end if;

  return community_plan(p_community_id);
end; $$;

revoke execute on function set_community_plan(uuid, text) from public, anon, authenticated;
grant  execute on function set_community_plan(uuid, text) to authenticated;

------------------------------------------------------------------------------
-- Self-check: the limits this migration newly enforces must actually be seeded,
-- or every downgrade would pass by coalescing a missing row to "unlimited".
------------------------------------------------------------------------------
do $$
begin
  if coalesce(community_limit_for_plan('starter', 'co_organizers'), -1) <> 0 then
    raise exception '0104: starter co_organizers is not 0';
  end if;
  if coalesce(community_limit_for_plan('basic', 'co_organizers'), -1) <> 1 then
    raise exception '0104: basic co_organizers is not 1';
  end if;
  if coalesce(community_limit_for_plan('basic', 'recurring_events'), -1) <> 5 then
    raise exception '0104: basic recurring_events is not 5';
  end if;
end $$;
