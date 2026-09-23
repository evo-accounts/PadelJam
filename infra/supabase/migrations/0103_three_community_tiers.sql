-- 0103_three_community_tiers.sql
--
-- Make the middle community tier settable from the app.
--
-- The tier's database name is 'basic'. `plans`, `plan_features` and `plan_limits` have carried its
-- rows since 0013 — nothing about the data model is new here. The ONLY thing standing between a
-- community and the Basic tier is the `IN` list in `set_community_plan`, because there is no CHECK
-- constraint on `community_subscriptions.plan_id` and its composite FK to `plans` already admits
-- 'basic'.
--
-- WHAT ELSE CHANGES, AND WHY IT HAD TO
--
-- The downgrade guard was not merely hard-coded to Starter's limits — it sat INSIDE the
-- `if p_plan = 'starter'` branch, so no limit check ran for any other target at all. That was
-- invisible while the only other target was Community Pro, whose limits are looser than everything
-- below it. It stops being invisible the moment Basic is settable: Basic allows 3 groups where
-- Community Pro allows unlimited, so pro -> basic is a real downgrade that can strand a community
-- over a limit it has already exceeded.
--
-- So the guard moves OUT of the branch and reads `p_plan`'s own limits. It now runs on every call,
-- including upgrades, which is safe by construction: moving to a looser limit can never trip a
-- check against that looser limit. Running it unconditionally also avoids needing a plan-ranking
-- helper to decide what counts as a "downgrade" — no such helper exists, and inventing one to
-- decide whether to run a check that is free to run anyway would be the worse trade.
--
-- WHAT DELIBERATELY DOES NOT CHANGE
--
-- The guard still checks `members_per_community` and `groups_per_community` only. Two other seeded
-- limits tighten on a pro -> basic move — `co_organizers` (3 -> 1) and `recurring_events`
-- (unlimited -> 5) — and are not checked here.
--
-- That is a deliberate omission, not an oversight. Adding them would newly REFUSE downgrades that
-- succeed today: Starter's `co_organizers` is 0, so any community with a second admin would stop
-- being able to return to Starter at all. `infra/supabase/tests/plans.test.mjs` contains a test
-- that does exactly that on purpose, and its comment shows the author knew the limit was not
-- enforced on downgrade. Widening the guard is a product decision about existing communities, so it
-- is left to one — see the note in the audit plan. The cap triggers are BEFORE INSERT only and will
-- not retro-evict, so a community that is over those two limits simply stays over them.
--
-- The if/else stays two-way. Starter means NO subscription row — `community_plan` coalesces a
-- missing row to 'starter' — and every paid tier means exactly one row. A third case would be
-- redundant; the fix is to stop hard-coding 'community_pro' and write `p_plan`.
--
-- 'club' is still not settable from the app, unchanged from 0095/0098.
--
-- SIDE EFFECTS OF MAKING BASIC SETTABLE (intended, decided with the product owner)
--
-- `plan_features` gives Basic both `jammer_plus_included` and `custom_broadcasts`. The first means
-- the community's CREATOR — `communities.created_by`, one user, narrowed there by 0098 and NOT the
-- membership — derives `account_plan = 'jammer_plus'` on their next read. The second unlocks event
-- blasts (0072). Neither needs code here; `account_plan` and `community_has_feature` are already
-- plan-agnostic and read straight from the seeded rows.
--
-- Based on 0098's body (any admin), NOT 0095's (owner only) — 0095's copy is superseded and the
-- `owner` role no longer exists.

create or replace function set_community_plan(p_community_id uuid, p_plan text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_user     uuid := auth.uid();
  v_members  int;
  v_groups   int;
  v_max_members int;
  v_max_groups  int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_plan not in ('starter', 'basic', 'community_pro') then
    raise exception 'invalid_plan' using errcode='P0001';
  end if;
  if not is_community_admin(p_community_id) then
    raise exception 'forbidden' using errcode='P0001';
  end if;

  -- Against the TARGET plan's limits, on every call. `community_limit_for_plan` returns NULL for
  -- "unlimited", which coalesces to a ceiling no community can reach.
  v_max_members := coalesce(community_limit_for_plan(p_plan, 'members_per_community'), 2147483647);
  v_max_groups  := coalesce(community_limit_for_plan(p_plan, 'groups_per_community'),  2147483647);

  select count(*) into v_members from community_members where community_id = p_community_id;
  select count(*) into v_groups  from groups
    where community_id = p_community_id and archived_at is null;

  if v_members > v_max_members or v_groups > v_max_groups then
    raise exception 'plan_downgrade_over_limit' using errcode='P0001';
  end if;

  if p_plan = 'starter' then
    -- Starter is the absence of a row. Only the manual row is dropped: a real billed subscription
    -- is not something this function may delete.
    delete from community_subscriptions where community_id = p_community_id and provider = 'manual';
  else
    insert into community_subscriptions (community_id, dimension, plan_id, status, provider)
    values (p_community_id, 'community', p_plan, 'active', 'manual')
    on conflict (community_id) do update
      set plan_id = p_plan, status = 'active', provider = 'manual', updated_at = now();
  end if;

  return community_plan(p_community_id);
end; $$;

-- 0030 set `alter default privileges ... grant execute on functions to anon, authenticated`, so a
-- `create or replace` re-grants to anon unless this pair is re-issued (0094).
revoke execute on function set_community_plan(uuid, text) from public, anon, authenticated;
grant  execute on function set_community_plan(uuid, text) to authenticated;

------------------------------------------------------------------------------
-- Self-check: the seeded rows this migration relies on must be present.
------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from plans where dimension = 'community' and plan_id = 'basic') then
    raise exception '0103: plans is missing the community/basic row';
  end if;
  if coalesce(community_limit_for_plan('basic', 'groups_per_community'), -1) <> 3 then
    raise exception '0103: basic groups_per_community is not 3';
  end if;
  if coalesce(community_limit_for_plan('basic', 'members_per_community'), -1) <> 50 then
    raise exception '0103: basic members_per_community is not 50';
  end if;
  if not exists (
    select 1 from plan_features
    where dimension = 'community' and plan_id = 'basic' and feature_key = 'jammer_plus_included'
  ) then
    raise exception '0103: basic is missing jammer_plus_included — the bundling is intended';
  end if;
end $$;
