-- Per-user notification channel preferences (delivery wiring is the Phase 2 notifications system).
create table user_settings (
  user_id uuid primary key references profiles(id) on delete cascade,
  notifications_push     boolean not null default true,
  notifications_whatsapp boolean not null default false,
  notifications_email    boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table user_settings enable row level security;
grant select, insert, update on user_settings to authenticated;
create policy "user_settings: select" on user_settings for select using (user_id = auth.uid());
create policy "user_settings: insert" on user_settings for insert with check (user_id = auth.uid());
create policy "user_settings: update" on user_settings for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
