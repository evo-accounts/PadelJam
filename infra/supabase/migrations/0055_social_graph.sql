-- Social graph for the Profile module: follows, blocks, reports + block-aware visibility.
create table follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_no_self check (follower_id <> followee_id)
);
create index follows_followee_idx on follows(followee_id);

create table blocks (
  id         uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on blocks(blocked_id);

create table reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references profiles(id) on delete cascade,
  reported_user_id uuid not null references profiles(id) on delete cascade,
  reason           text not null check (reason in ('harassment','inappropriate','spam','fake','other')),
  description      text,
  status           text not null default 'open' check (status in ('open','reviewed')),
  created_at       timestamptz not null default now(),
  constraint reports_no_self check (reporter_id <> reported_user_id)
);

alter table follows enable row level security;
alter table blocks  enable row level security;
alter table reports enable row level security;
grant select, insert, delete on follows to authenticated;
grant select, insert, delete on blocks  to authenticated;
grant select, insert on reports to authenticated;

create policy "follows: read"   on follows for select using (auth.role() = 'authenticated');
create policy "follows: insert" on follows for insert with check (follower_id = auth.uid());
create policy "follows: delete" on follows for delete using (follower_id = auth.uid());

create policy "blocks: all" on blocks for all
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy "reports: read"   on reports for select using (reporter_id = auth.uid());
create policy "reports: insert" on reports for insert with check (reporter_id = auth.uid());

drop policy "profiles: read" on profiles;
create policy "profiles: read" on profiles for select using (
  auth.role() = 'authenticated'
  and not exists (
    select 1 from blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = profiles.id)
       or (b.blocker_id = profiles.id and b.blocked_id = auth.uid())
  )
);

create or replace function get_player_profile(p_target uuid)
returns table (
  id uuid, full_name text, avatar_url text, dominant_hand text, court_side text, location_text text,
  played_matches bigint, best_position int, followers_count bigint, following_count bigint,
  is_following boolean, is_followed_by boolean
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.full_name, p.avatar_url, p.dominant_hand, p.court_side, p.location_text,
    (select count(*) from group_event_results r where r.user_id = p.id),
    (select min(r.final_placement) from group_event_results r where r.user_id = p.id),
    (select count(*) from follows f where f.followee_id = p.id),
    (select count(*) from follows f where f.follower_id = p.id),
    exists (select 1 from follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    exists (select 1 from follows f where f.follower_id = p.id and f.followee_id = auth.uid())
  from profiles p
  where p.id = p_target
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p_target)
         or (b.blocker_id = p_target and b.blocked_id = auth.uid())
    );
$$;

create or replace function list_following(p_user uuid, p_search text default null, p_limit int default 20, p_offset int default 0)
returns table (id uuid, full_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url
  from follows f
  join profiles p on p.id = f.followee_id
  where f.follower_id = p_user
    and (p_search is null or p.full_name ilike '%' || p_search || '%')
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  order by p.full_name
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

create or replace function list_followers(p_user uuid, p_search text default null, p_limit int default 20, p_offset int default 0)
returns table (id uuid, full_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url
  from follows f
  join profiles p on p.id = f.follower_id
  where f.followee_id = p_user
    and (p_search is null or p.full_name ilike '%' || p_search || '%')
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  order by p.full_name
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

create or replace function block_user(p_target uuid)
returns void
language sql volatile security definer set search_path = public as $$
  insert into blocks (blocker_id, blocked_id) values (auth.uid(), p_target)
    on conflict (blocker_id, blocked_id) do nothing;
  delete from follows
   where (follower_id = auth.uid() and followee_id = p_target)
      or (follower_id = p_target and followee_id = auth.uid());
$$;

create or replace function unblock_user(p_target uuid)
returns void
language sql volatile security definer set search_path = public as $$
  delete from blocks where blocker_id = auth.uid() and blocked_id = p_target;
$$;

grant execute on function get_player_profile(uuid) to authenticated;
grant execute on function list_following(uuid, text, int, int) to authenticated;
grant execute on function list_followers(uuid, text, int, int) to authenticated;
grant execute on function block_user(uuid) to authenticated;
grant execute on function unblock_user(uuid) to authenticated;
