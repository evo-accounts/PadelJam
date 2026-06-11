create type plan_dimension as enum ('account','community');
create type subscription_provider as enum ('stripe','revenuecat','manual');
create type subscription_status as enum ('trialing','active','past_due','canceled','incomplete');

create table plans (
  dimension   plan_dimension not null,
  plan_id     text not null,
  name        text not null,
  price_cents integer not null default 0,
  currency    text not null default 'EUR',
  sort_order  integer not null default 0,
  is_default  boolean not null default false,
  mvp         boolean not null default false,
  primary key (dimension, plan_id)
);

create table plan_features (
  dimension   plan_dimension not null,
  plan_id     text not null,
  feature_key text not null,
  mvp         boolean not null default false,
  primary key (dimension, plan_id, feature_key),
  foreign key (dimension, plan_id) references plans(dimension, plan_id) on delete cascade
);

-- community-dimension only; pinned dimension column keeps a clean composite FK.
create table plan_limits (
  dimension plan_dimension not null default 'community' check (dimension = 'community'),
  plan_id   text not null,
  limit_key text not null,
  value     integer,                       -- NULL = unlimited
  mvp       boolean not null default false,
  primary key (plan_id, limit_key),
  foreign key (dimension, plan_id) references plans(dimension, plan_id) on delete cascade
);

-- Catalog is public-readable (product config, not user data); writes are migration/seed only.
alter table plans enable row level security;
alter table plan_features enable row level security;
alter table plan_limits enable row level security;
create policy "plans: read all"         on plans         for select using (true);
create policy "plan_features: read all" on plan_features for select using (true);
create policy "plan_limits: read all"   on plan_limits   for select using (true);
