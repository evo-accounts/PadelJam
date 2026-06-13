-- 0040_events_core.sql
-- Core events tables: event_series, events, event_courts.
-- RLS enabled but NO policies yet (deny-all until 0044, once helpers exist).
create table event_series (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  organizer_id uuid not null references profiles(id),
  day_of_week integer not null check (day_of_week between 1 and 7),
  start_time time not null,
  duration_minutes integer not null check (duration_minutes > 0),
  invite_lead_days integer not null check (invite_lead_days in (3,5,7)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete set null,
  series_id uuid references event_series(id) on delete set null,
  organizer_id uuid not null references profiles(id),
  event_type text not null check (event_type in ('americano','mexicano','up_and_down')),
  specification text not null check (specification in ('classic','mixed','team')),
  scoring_mode text not null check (scoring_mode in ('points','time','classic')),
  scoring_value integer check (scoring_value is null or scoring_value > 0),
  venue_id uuid references venues(id) on delete set null,
  manual_location_name text,
  manual_location_address text,
  has_location boolean not null default false,
  num_courts integer not null check (num_courts > 0),
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0),
  allow_standby boolean not null default false,
  standby_spots integer check (standby_spots is null or standby_spots >= 0),
  is_private boolean not null default false,
  entrance_fee_enabled boolean not null default false,
  entrance_fee_amount numeric(10,2) check (entrance_fee_amount is null or entrance_fee_amount >= 0),
  entrance_fee_method text check (entrance_fee_method is null or entrance_fee_method in ('cash','at_club','mba')),
  entrance_fee_mba_number text,
  players_submit_results boolean not null default false,
  organizer_role text not null check (organizer_role in ('organizing_only','organizing_and_playing')),
  name text not null,
  description text,
  thumbnail_path text,
  status text not null default 'scheduled' check (status in ('scheduled','in_progress','completed','cancelled')),
  counts_for_ranking boolean not null default true,
  finished_early boolean not null default false,
  finish_message text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint events_standalone_private check (group_id is not null or is_private = true),
  constraint events_venue_xor_manual check (venue_id is null or manual_location_name is null),
  constraint events_fee_complete check (entrance_fee_enabled = false or (entrance_fee_amount is not null and entrance_fee_method is not null))
);
create trigger trg_events_updated_at before update on events for each row execute function set_updated_at();
create index events_group_idx on events(group_id);
create index events_organizer_idx on events(organizer_id);
create index events_status_idx on events(status);
create index event_series_group_idx on event_series(group_id);
create table event_courts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  court_id uuid not null references courts(id) on delete cascade,
  unique (event_id, court_id)
);
alter table event_series enable row level security;
alter table events enable row level security;
alter table event_courts enable row level security;
grant select,insert,update,delete on event_series to authenticated;
grant select,insert,update,delete on events to authenticated;
grant select,insert,update,delete on event_courts to authenticated;
grant select on event_series, events, event_courts to anon;
