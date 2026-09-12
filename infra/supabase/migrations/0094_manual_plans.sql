-- UX-GLOB-10: paid features are granted on request in the MVP. These two RPCs are the ONLY
-- client-reachable writers of subscriptions / community_subscriptions (RLS stays select-only,
-- see 0011). provider = 'manual' marks the rows so a future billing integration can tell them
-- apart from real Stripe/RevenueCat rows.

-- "My plan" read: account_plan(u uuid) (0014) takes an explicit user id (used server-side and by
-- account_has_feature); the client needs a zero-arg wrapper it can call as itself.
create or replace function account_plan_of_caller() returns text
language sql stable security definer set search_path = public as $$
  select account_plan(auth.uid());
$$;
revoke execute on function account_plan_of_caller() from public, anon, authenticated;
grant execute on function account_plan_of_caller() to authenticated;

-- community_plan(uuid) (0014) already carries the default-privilege grant from 0030; confirm it
-- explicitly so a future privilege sweep (see fix/internal-rpc-privileges) doesn't strand clients.
grant execute on function community_plan(uuid) to authenticated;

-- Internal helper: plan_limits is keyed by (plan_id, limit_key) (0010); community_limit(c, key)
-- (0014) resolves the limit for a community's CURRENT plan, but the downgrade guard below needs
-- the limit for a CANDIDATE plan the community isn't on yet. Not used by any RLS policy, so it
-- stays fully internal (no client grant).
create or replace function community_limit_for_plan(p_plan text, p_key text) returns integer
language sql stable security definer set search_path = public as $$
  select value from plan_limits where plan_id = p_plan and limit_key = p_key;
$$;
revoke execute on function community_limit_for_plan(text, text) from public, anon, authenticated;

create or replace function set_account_plan(p_plan text) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_plan not in ('free', 'jammer_plus') then raise exception 'invalid_plan' using errcode='P0001'; end if;
  if p_plan = 'free' then
    delete from subscriptions where user_id = v_user and provider = 'manual';
  else
    insert into subscriptions (user_id, dimension, plan_id, status, provider)
    values (v_user, 'account', 'jammer_plus', 'active', 'manual')
    on conflict (user_id) do update set plan_id = 'jammer_plus', status = 'active', provider = 'manual', updated_at = now();
  end if;
  return account_plan(v_user);
end; $$;
revoke execute on function set_account_plan(text) from public, anon, authenticated;
grant execute on function set_account_plan(text) to authenticated;

create or replace function set_community_plan(p_community_id uuid, p_plan text) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_members int; v_groups int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_plan not in ('starter', 'community_pro') then raise exception 'invalid_plan' using errcode='P0001'; end if;
  if not exists (select 1 from community_members where community_id = p_community_id and user_id = v_user and role = 'owner') then
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
