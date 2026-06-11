create table community_join_requests (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted','declined')),
  rules_acknowledged boolean not null default false,
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  responded_by uuid references auth.users(id),
  unique (community_id, user_id)
);
create index cjr_pending_idx on community_join_requests(community_id) where status = 'pending';

create table community_invitations (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  inviter_id   uuid not null references auth.users(id) on delete cascade,
  invitee_id   uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  group_ids    uuid[] not null default '{}',
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  unique (community_id, invitee_id)
);
create index ci_invitee_pending_idx on community_invitations(invitee_id) where status = 'pending';

create table community_reviews (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  body         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (community_id, user_id)
);

create table community_posts (
  id              uuid primary key default gen_random_uuid(),
  community_id    uuid not null references communities(id) on delete cascade,
  author_id       uuid not null references auth.users(id) on delete cascade,
  kind            text not null default 'user' check (kind in ('user','result')),
  body            text,
  image_path      text,
  result_event_id uuid,  -- FK to events added in the Events plan (events table absent now)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint community_posts_content_ck
    check (coalesce(length(btrim(body)), 0) > 0 or image_path is not null or result_event_id is not null)
);
create index community_posts_feed_idx on community_posts(community_id, created_at desc);

create table post_likes (
  post_id    uuid not null references community_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references community_posts(id) on delete cascade,
  author_id  uuid not null references auth.users(id) on delete cascade,
  body       text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);
create index post_comments_post_idx on post_comments(post_id, created_at);

create table user_default_community (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  community_id uuid not null references communities(id) on delete cascade,
  updated_at   timestamptz not null default now()
);

alter table community_join_requests enable row level security;
alter table community_invitations  enable row level security;
alter table community_reviews      enable row level security;
alter table community_posts        enable row level security;
alter table post_likes             enable row level security;
alter table post_comments          enable row level security;
alter table user_default_community enable row level security;
