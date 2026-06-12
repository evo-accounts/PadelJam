-- 0034_group_seasons_invitations.sql
create table group_seasons (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references groups(id) on delete cascade,
  season_number int  not null,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,                 -- null = current/open season
  created_at    timestamptz not null default now(),
  unique (group_id, season_number)
);
create index group_seasons_group_idx on group_seasons(group_id);
create unique index group_seasons_one_open_idx on group_seasons(group_id) where ended_at is null;

create table group_invitations (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups(id) on delete cascade,
  inviter_id   uuid not null references profiles(id) on delete cascade,
  invitee_id   uuid not null references profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (group_id, invitee_id)
);
create index group_invitations_invitee_pending_idx
  on group_invitations(invitee_id) where status = 'pending';

alter table group_seasons     enable row level security;
alter table group_invitations enable row level security;

grant select, insert, update, delete on group_seasons     to authenticated;
grant select, insert, update, delete on group_invitations to authenticated;
grant select on group_seasons     to anon;
grant select on group_invitations to anon;
