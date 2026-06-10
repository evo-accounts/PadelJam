create table communities (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  description text,
  type        text not null check (type in ('club','team','friends')),
  privacy     text not null default 'public' check (privacy in ('public','request_to_join','private')),
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create index communities_tenant_id_idx on communities(tenant_id);

create table community_members (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner','admin','member')),
  created_at   timestamptz not null default now(),
  unique (community_id, user_id)
);

alter table communities enable row level security;
alter table community_members enable row level security;
