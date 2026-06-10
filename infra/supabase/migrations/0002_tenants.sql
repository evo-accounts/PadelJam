create type tenant_role as enum
  ('member','coach','staff','community_owner','club_owner','super_admin');

create table tenants (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('club','community','studio','gym','organization')),
  name        text not null,
  country     text not null check (country in ('PT','BR')),
  is_personal boolean not null default false,
  owner_id    uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create table tenant_memberships (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  tenant_id  uuid not null references tenants(id) on delete cascade,
  role       tenant_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (user_id, tenant_id)
);

alter table tenants enable row level security;
alter table tenant_memberships enable row level security;
