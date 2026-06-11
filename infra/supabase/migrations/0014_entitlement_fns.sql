create or replace function community_plan(c uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select cs.plan_id from community_subscriptions cs
       where cs.community_id = c and cs.status in ('trialing','active')),
    'starter');
$$;

create or replace function community_has_feature(c uuid, key text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from plan_features
    where dimension = 'community' and plan_id = community_plan(c) and feature_key = key);
$$;

-- Effective account plan: a real jammer_plus subscription OR a derived grant from owning a
-- community on a plan with jammer_plus_included. Read-time derivation, no stored row.
create or replace function account_plan(u uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (
      select 1 from subscriptions s
      where s.user_id = u and s.plan_id = 'jammer_plus' and s.status in ('trialing','active')
    ) then 'jammer_plus'
    when exists (
      select 1 from community_members cm
      where cm.user_id = u and cm.role = 'owner'
        and community_has_feature(cm.community_id, 'jammer_plus_included')
    ) then 'jammer_plus'
    else 'free'
  end;
$$;

create or replace function account_has_feature(u uuid, key text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from plan_features
    where dimension = 'account' and plan_id = account_plan(u) and feature_key = key);
$$;

create or replace function community_limit(c uuid, key text) returns integer
language sql stable security definer set search_path = public as $$
  select value from plan_limits where plan_id = community_plan(c) and limit_key = key;
$$;
