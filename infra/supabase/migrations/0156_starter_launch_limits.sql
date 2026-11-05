-- 0156_starter_launch_limits.sql
--
-- Launch limits for the free `starter` plan (founder's D1 option A, PAD-142 / PAD-178):
--
--     limit                   was   now
--     members_per_community   10    250
--     groups_per_community    1     null (unlimited)
--     recurring_events        1     null (unlimited)
--     co_organizers           0     3
--
-- Data only. `plan_limits` is the single store and community_limit() reads it live through
-- community_plan(), so this one write covers every existing Starter community, with or without a
-- community_subscriptions row. No function or trigger changes: null already means "unlimited"
-- everywhere (Community Pro relies on it). Basic and Community Pro are untouched.
--
-- WHAT NO LONGER HOLDS in the older migrations (they cannot be edited):
--   * 0104: "Starter is one admin, no co-organizers", and "upgrades cannot be tripped". Starter is
--     now LOOSER than Basic (50 / 3 / 5 / 1), so Starter -> Basic can be refused with
--     plan_downgrade_over_limit.
--   * Starter and Community Pro now have equal limits, so the downgrade guard cannot refuse a move
--     to Starter from any plan the app can set.
-- The self-checks in 0098 and 0104 assert co_organizers = 0 at their own point in the order,
-- before this runs, so they still pass on a fresh reset.

insert into plan_limits (plan_id, limit_key, value, mvp) values
  ('starter', 'members_per_community', 250,  true),
  ('starter', 'groups_per_community',  null, true),
  ('starter', 'recurring_events',      null, true),
  ('starter', 'co_organizers',         3,    true)
on conflict (plan_id, limit_key) do update set value = excluded.value;

do $$
declare
  r record;
begin
  -- A missing row and a null value both read as unlimited, so check the row exists too.
  for r in
    select * from (values
      ('starter',       'members_per_community', 250),
      ('starter',       'groups_per_community',  null),
      ('starter',       'recurring_events',      null),
      ('starter',       'co_organizers',         3),
      ('basic',         'members_per_community', 50),
      ('basic',         'groups_per_community',  3),
      ('basic',         'recurring_events',      5),
      ('basic',         'co_organizers',         1),
      ('community_pro', 'members_per_community', 250),
      ('community_pro', 'groups_per_community',  null),
      ('community_pro', 'recurring_events',      null),
      ('community_pro', 'co_organizers',         3)
    ) as t(plan_id, limit_key, want)
  loop
    if not exists (
      select 1 from plan_limits p
      where p.plan_id = r.plan_id and p.limit_key = r.limit_key
        and p.value is not distinct from r.want
    ) then
      raise exception '0156 self-check failed: %/% is not %', r.plan_id, r.limit_key, coalesce(r.want::text, 'null');
    end if;
  end loop;
end $$;
