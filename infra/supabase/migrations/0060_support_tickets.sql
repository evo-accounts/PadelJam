create table support_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  title       text not null,
  description text not null,
  status      text not null default 'open' check (status in ('open','responded','closed')),
  created_at  timestamptz not null default now()
);
alter table support_tickets enable row level security;
grant select, insert on support_tickets to authenticated;
create policy "support_tickets: select" on support_tickets for select using (user_id = auth.uid());
create policy "support_tickets: insert" on support_tickets for insert with check (user_id = auth.uid());
