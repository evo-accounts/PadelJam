-- Plans
insert into plans (dimension, plan_id, name, price_cents, currency, sort_order, is_default, mvp) values
  ('account','free','Jammer',0,'EUR',0,true,true),
  ('account','jammer_plus','Jammer+',499,'EUR',1,false,true),
  ('community','starter','Starter',0,'EUR',0,true,true),
  ('community','basic','Basic',999,'EUR',1,false,true),
  ('community','community_pro','Community Pro',2499,'EUR',2,false,true),
  ('community','club','Club',7999,'EUR',3,false,false);

-- Account features (mvp)
insert into plan_features (dimension, plan_id, feature_key, mvp) values
  ('account','jammer_plus','unlimited_match_history',true),
  ('account','jammer_plus','advanced_stats',true),
  ('account','jammer_plus','ad_free',true),
  ('account','jammer_plus','custom_icon',true);
-- Account features (next/post-mvp, seeded but inert)
insert into plan_features (dimension, plan_id, feature_key, mvp) values
  ('account','jammer_plus','match_insights',false),
  ('account','jammer_plus','custom_rivalries',false),
  ('account','jammer_plus','exclusive_avatar_items',false),
  ('account','jammer_plus','waiting_list_priority',false),
  ('account','jammer_plus','badges_xp',false),
  ('account','jammer_plus','home_club',false);

-- Community features (mvp): event_management/community_feed/discoverability on ALL tiers
insert into plan_features (dimension, plan_id, feature_key, mvp)
select 'community', p.plan_id, f.k, true
from (values ('starter'),('basic'),('community_pro'),('club')) p(plan_id),
     (values ('event_management'),('community_feed'),('discoverability')) f(k);
-- custom_broadcasts on basic+; priority_support on pro+; jammer_plus_included on basic+
insert into plan_features (dimension, plan_id, feature_key, mvp) values
  ('community','basic','custom_broadcasts',true),
  ('community','community_pro','custom_broadcasts',true),
  ('community','club','custom_broadcasts',true),
  ('community','community_pro','priority_support',true),
  ('community','club','priority_support',true),
  ('community','basic','jammer_plus_included',true),
  ('community','community_pro','jammer_plus_included',true),
  ('community','club','jammer_plus_included',true);
-- Community features (next/post-mvp, inert)
insert into plan_features (dimension, plan_id, feature_key, mvp) values
  ('community','basic','analytics_basic',false),
  ('community','community_pro','analytics_pro',false),
  ('community','community_pro','paid_events',false),
  ('community','community_pro','coach_mode',false),
  ('community','community_pro','custom_url',false),
  ('community','club','multiple_communities',false),
  ('community','club','staff_accounts',false),
  ('community','club','api_access',false),
  ('community','club','tournament_management',false);

-- Community numeric limits (mvp). value NULL = unlimited.
insert into plan_limits (plan_id, limit_key, value, mvp) values
  ('starter','members_per_community',10,true),
  ('basic','members_per_community',50,true),
  ('community_pro','members_per_community',250,true),
  ('club','members_per_community',null,true),
  ('starter','groups_per_community',1,true),
  ('basic','groups_per_community',3,true),
  ('community_pro','groups_per_community',null,true),
  ('club','groups_per_community',null,true),
  ('starter','recurring_events',1,true),
  ('basic','recurring_events',5,true),
  ('community_pro','recurring_events',null,true),
  ('club','recurring_events',null,true),
  ('starter','co_organizers',0,true),
  ('basic','co_organizers',1,true),
  ('community_pro','co_organizers',3,true),
  ('club','co_organizers',null,true);
