create table subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  dimension          plan_dimension not null default 'account' check (dimension = 'account'),
  plan_id            text not null,
  status             subscription_status not null default 'active',
  provider           subscription_provider not null default 'manual',
  provider_ref       text,
  trial_ends_at      timestamptz,
  current_period_end timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id),
  foreign key (dimension, plan_id) references plans(dimension, plan_id)
);

create table community_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  community_id       uuid not null references communities(id) on delete cascade,
  dimension          plan_dimension not null default 'community' check (dimension = 'community'),
  plan_id            text not null,
  status             subscription_status not null default 'active',
  provider           subscription_provider not null default 'manual',
  provider_ref       text,
  current_period_end timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (community_id),
  foreign key (dimension, plan_id) references plans(dimension, plan_id)
);

alter table subscriptions enable row level security;
alter table community_subscriptions enable row level security;

-- Read your own account subscription; read a community's subscription if you can see the community.
-- No client INSERT/UPDATE policies: written by seed/admin/service-role only (billing webhooks become
-- the sole writer in spec 09), mirroring the profiles server-only decision.
create policy "subscriptions: read own" on subscriptions for select using (user_id = auth.uid());
create policy "community_subscriptions: read" on community_subscriptions for select using (
  community_id in (
    select id from communities where tenant_id in (select auth_tenant_ids()) or privacy = 'public'
  )
);
