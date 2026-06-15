-- 0061_notifications.sql
-- In-app notifications: trigger-fed, own-row RLS, realtime. (Phase 2A)

create table notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,   -- recipient
  type         text not null check (type in (
                 'event_invite','group_invite','community_invite',
                 'community_request_accepted','follow','follow_joined_event')),
  actor_id     uuid references profiles(id) on delete set null,
  event_id     uuid references events(id)      on delete cascade,
  group_id     uuid references groups(id)      on delete cascade,
  community_id uuid references communities(id) on delete cascade,
  ref_id       uuid,                                                       -- source invite/request row (Join CTA)
  actor_name   text,
  entity_name  text,
  read_at      timestamptz,
  cta_done     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index notifications_user_created_idx on notifications(user_id, created_at desc);
create index notifications_user_unread_idx  on notifications(user_id) where read_at is null;

alter table notifications enable row level security;

-- Own-row only. No INSERT policy for authenticated: rows come only from the
-- SECURITY DEFINER trigger functions below (which bypass RLS).
create policy "notifications: read own" on notifications for select
  using (user_id = auth.uid());
create policy "notifications: update own" on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications: delete own" on notifications for delete
  using (user_id = auth.uid());

alter publication supabase_realtime add table notifications;
