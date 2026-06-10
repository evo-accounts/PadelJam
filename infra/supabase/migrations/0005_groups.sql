create table groups (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  name         text not null,
  is_general   boolean not null default false,
  is_private   boolean not null default false,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index groups_community_id_idx on groups(community_id);

create table group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

alter table groups enable row level security;
alter table group_members enable row level security;
