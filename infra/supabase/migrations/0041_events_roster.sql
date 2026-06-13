-- 0041_events_roster.sql
-- Roster tables: event_participants, event_invitations, event_teams, partner_requests.
-- RLS enabled but NO policies yet (deny-all until 0044).
create table event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  guest_name text,
  guest_gender text check (guest_gender is null or guest_gender in ('male','female')),
  status text not null default 'confirmed' check (status in ('invited','interested','confirmed','waiting_list')),
  is_standby boolean not null default false,
  waiting_list_position integer,
  has_paid boolean not null default false,
  paid_at timestamptz,
  invited_by uuid references profiles(id),
  confirmed_at timestamptz,
  joined_at timestamptz not null default now(),
  unique (event_id, user_id),
  constraint ep_user_or_guest check (user_id is not null or guest_name is not null),
  constraint ep_waiting_pos check (status <> 'waiting_list' or waiting_list_position is not null)
);
create index event_participants_event_idx on event_participants(event_id);
create table event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  invitee_id uuid references profiles(id),
  invitee_name text, invitee_email text, invitee_phone text,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  invited_by uuid not null references profiles(id),
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint ei_user_or_contact check (invitee_id is not null or (invitee_name is not null and (invitee_email is not null or invitee_phone is not null)))
);
create index event_invitations_event_idx on event_invitations(event_id);
create index event_invitations_invitee_idx on event_invitations(invitee_id) where status='pending';
create table event_teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  team_number integer not null,
  player_a_id uuid references event_participants(id) on delete set null,
  player_b_id uuid references event_participants(id) on delete set null,
  team_name text,
  is_confirmed boolean not null default false,
  unique (event_id, team_number),
  constraint et_distinct check (player_a_id is null or player_a_id <> player_b_id)
);
create table partner_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  requester_id uuid not null references profiles(id),
  target_id uuid not null references profiles(id),
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint pr_distinct check (requester_id <> target_id),
  unique (event_id, requester_id, target_id)
);
alter table event_participants enable row level security;
alter table event_invitations enable row level security;
alter table event_teams enable row level security;
alter table partner_requests enable row level security;
grant select,insert,update,delete on event_participants to authenticated;
grant select,insert,update,delete on event_invitations to authenticated;
grant select,insert,update,delete on event_teams to authenticated;
grant select,insert,update,delete on partner_requests to authenticated;
grant select on event_participants, event_invitations, event_teams, partner_requests to anon;
