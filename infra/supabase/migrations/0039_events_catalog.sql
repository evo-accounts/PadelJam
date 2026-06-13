-- 0039_events_catalog.sql
-- Venues + courts catalog. Public read; writes are service-role only (no end-user write policy).
create table venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  rating numeric(2,1) check (rating is null or (rating between 0 and 5)),
  community_id uuid references communities(id) on delete set null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table courts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0
);
create index courts_venue_idx on courts(venue_id);
alter table venues enable row level security;
alter table courts enable row level security;
-- public read; writes are service-role only (no end-user write policy).
create policy "venues: read" on venues for select using (deleted_at is null);
create policy "courts: read" on courts for select using (true);
grant select on venues to anon, authenticated;
grant select on courts to anon, authenticated;
