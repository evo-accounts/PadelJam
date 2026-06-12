-- 0042_events_engine.sql
-- In-progress engine tables: event_rounds, event_matches, match_players, round_rest.
-- RLS enabled but NO policies yet (deny-all until 0044).
create table event_rounds (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  status text not null default 'pending' check (status in ('pending','active','completed')),
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, round_number)
);
create table event_matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  round_id uuid not null references event_rounds(id) on delete cascade,
  court_id uuid references courts(id) on delete set null,
  court_number integer not null,
  match_number integer not null,
  side_a_score integer check (side_a_score is null or side_a_score >= 0),
  side_b_score integer check (side_b_score is null or side_b_score >= 0),
  status text not null default 'pending' check (status in ('pending','played','not_played')),
  submitted_by uuid references profiles(id),
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);
create index event_matches_round_idx on event_matches(round_id);
create index event_matches_event_idx on event_matches(event_id);
create table match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references event_matches(id) on delete cascade,
  participant_id uuid not null references event_participants(id) on delete cascade,
  side text not null check (side in ('a','b')),
  unique (match_id, participant_id)
);
create index match_players_match_idx on match_players(match_id);
create table round_rest (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references event_rounds(id) on delete cascade,
  participant_id uuid not null references event_participants(id) on delete cascade,
  unique (round_id, participant_id)
);
alter table event_rounds enable row level security;
alter table event_matches enable row level security;
alter table match_players enable row level security;
alter table round_rest enable row level security;
grant select,insert,update,delete on event_rounds to authenticated;
grant select,insert,update,delete on event_matches to authenticated;
grant select,insert,update,delete on match_players to authenticated;
grant select,insert,update,delete on round_rest to authenticated;
grant select on event_rounds, event_matches, match_players, round_rest to anon;
