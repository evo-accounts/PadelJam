-- 0043_events_ranking_bridge.sql
-- Bridges completed events into group season standings. Read policy added in 0044.
create table group_event_results (
  id uuid primary key default gen_random_uuid(),
  group_season_id uuid not null references group_seasons(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  final_placement integer not null,
  ranking_points integer not null,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index group_event_results_season_idx on group_event_results(group_season_id);
alter table group_event_results enable row level security;
grant select,insert,update,delete on group_event_results to authenticated;
grant select on group_event_results to anon;
