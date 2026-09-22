-- UX Audit — Profile & Settings: everything the rebuilt profile screens read.
--
-- One migration rather than five, because the hosted database is updated by pasting SQL into the
-- dashboard by hand. Run the whole file as ONE script: two functions are DROPPED and recreated
-- below, and a partial run leaves the app without them.
--
-- Note `get_player_profile` is deliberately absent. It already returns every field the header, the
-- identity block, the counts and the three Preferences cards need.

------------------------------------------------------------------------------
-- 1. Blocked users — the list, and the collapsed profile
------------------------------------------------------------------------------
-- UX-SET-06 needs a list of who you blocked; UX-PROF-03 needs that person's photo and name to
-- render the collapsed profile with its Unblock action.
--
-- Neither can read `profiles` directly. The `profiles: read` policy (0055) hides a row when a block
-- exists in EITHER direction, so a blocker cannot see the person they blocked any more than the
-- other way round. Widening that policy was the alternative and was rejected: it is the same policy
-- every membership and roster embed resolves under, so loosening it for one screen loosens all of
-- them. A definer function scoped to `blocker_id = auth.uid()` exposes exactly the two columns the
-- two surfaces render, and nothing else.
create or replace function list_my_blocks(
  p_search text default null,
  p_limit  int  default 20,
  p_offset int  default 0
)
returns table (id uuid, full_name text, avatar_url text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url, b.created_at
  from blocks b
  join profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
    and (p_search is null or p.full_name ilike '%' || p_search || '%')
  order by b.created_at desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;
revoke execute on function list_my_blocks(text, int, int) from public, anon;
grant  execute on function list_my_blocks(text, int, int) to authenticated;

------------------------------------------------------------------------------
-- 2. explore_players stops surfacing people who blocked you
------------------------------------------------------------------------------
-- A real hole, not a new requirement. `explore_players` (0052) is `security definer`, so it never
-- consults the `profiles: read` policy, and it carried no block predicate of its own — a blocked
-- player still appeared in the Explore rails, /explore/players and the /search People tab, and
-- tapping through landed on the "unavailable" state.
--
-- This is the ONLY listing path where that was true: list_followers, list_following and
-- useSearchProfiles (a plain `profiles` read) already filter both directions. UX-PROF-03's "a user
-- who blocked you does not appear in search results or listings" is met once this is closed.
--
-- Body is 0052's, unchanged except for the final predicate.
create or replace function explore_players(p_limit int default 10, p_offset int default 0)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  dominant_hand text,
  court_side text,
  shared_count int
)
language sql stable security definer set search_path = public as $$
  with candidates as (
    select cm.user_id as uid, count(*)::int as shared
    from community_members cm
    where cm.community_id in (
        select community_id from community_members where user_id = auth.uid()
      )
      and cm.user_id <> auth.uid()
    group by cm.user_id
    union all
    select gm.user_id as uid, count(*)::int as shared
    from group_members gm
    where gm.group_id in (
        select group_id from group_members where user_id = auth.uid()
      )
      and gm.user_id <> auth.uid()
    group by gm.user_id
  ),
  agg as (
    select uid, sum(shared)::int as shared_count
    from candidates
    group by uid
  )
  select p.id, p.full_name, p.avatar_url, p.dominant_hand, p.court_side, a.shared_count
  from agg a
  join profiles p on p.id = a.uid
  where not exists (
    select 1 from blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
       or (b.blocker_id = p.id and b.blocked_id = auth.uid())
  )
  order by a.shared_count desc, p.created_at desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;
grant execute on function explore_players(int, int) to authenticated;

------------------------------------------------------------------------------
-- 3. Follower lists carry the relationship
------------------------------------------------------------------------------
-- UX-PROF-05 puts a follow control on every row, and it must show the VIEWER's relationship with
-- that person — "Unfollow" for someone you already follow — including while browsing somebody
-- else's followers. The flags are therefore computed against auth.uid(), never against p_user.
--
-- DROP and recreate, not `create or replace`: adding OUT columns changes the result type, which
-- Postgres refuses to replace in place ("cannot change return type of existing function"). The
-- grants go with the old function, so they are re-issued.
drop function if exists list_followers(uuid, text, int, int);
drop function if exists list_following(uuid, text, int, int);

create function list_following(
  p_user   uuid,
  p_search text default null,
  p_limit  int  default 20,
  p_offset int  default 0
)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  is_following   boolean,
  is_followed_by boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url,
         exists (select 1 from follows f2 where f2.follower_id = auth.uid() and f2.followee_id = p.id),
         exists (select 1 from follows f2 where f2.follower_id = p.id and f2.followee_id = auth.uid())
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

create function list_followers(
  p_user   uuid,
  p_search text default null,
  p_limit  int  default 20,
  p_offset int  default 0
)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  is_following   boolean,
  is_followed_by boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url,
         exists (select 1 from follows f2 where f2.follower_id = auth.uid() and f2.followee_id = p.id),
         exists (select 1 from follows f2 where f2.follower_id = p.id and f2.followee_id = auth.uid())
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

grant execute on function list_following(uuid, text, int, int) to authenticated;
grant execute on function list_followers(uuid, text, int, int) to authenticated;

------------------------------------------------------------------------------
-- 4. my_groups, for a profile that is not your own
------------------------------------------------------------------------------
-- UX-PROF-01 adds a Groups section to ANOTHER player's profile. `my_groups()` (0064, 0068) is the
-- right shape already, but it is hardcoded to auth.uid() and it is `security definer` — so simply
-- parameterising it would hand any caller a named user's complete community and group membership,
-- private groups included, through a function that bypasses row-level security. That is a privacy
-- widening, not a refactor, and it gets an explicit rule:
--
--   * your OWN profile is unchanged — every group, and the is_managing flag;
--   * somebody ELSE's shows only groups in communities you BOTH belong to, never private groups,
--     and never is_managing, which describes a relationship the viewer has no business reading;
--   * a block in either direction returns nothing at all.
--
-- The default keeps the existing zero-argument call sites working: PostgREST resolves `rpc('my_groups')`
-- to this function because every argument has a default.
drop function if exists my_groups();

create function my_groups(p_user uuid default auth.uid())
returns table (
  group_id       uuid,
  name           text,
  community_id   uuid,
  community_name text,
  member_count   integer,
  is_managing    boolean
)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, c.id, c.name,
         (select count(*)::int from group_members gm2 where gm2.group_id = g.id),
         -- NULL, not false, for someone else: "we are not telling you" rather than "they do not
         -- manage it". The client renders no badge either way.
         case when p_user = auth.uid() then is_group_admin(g.id, auth.uid()) else null end
  from group_members gm
  join groups g      on g.id = gm.group_id and g.archived_at is null
  join communities c on c.id = g.community_id
  where gm.user_id = p_user
    and (
      p_user = auth.uid()
      or (
        g.is_private = false
        and exists (
          select 1 from community_members cm
          where cm.community_id = g.community_id and cm.user_id = auth.uid()
        )
        and not exists (
          select 1 from blocks b
          where (b.blocker_id = auth.uid() and b.blocked_id = p_user)
             or (b.blocker_id = p_user and b.blocked_id = auth.uid())
        )
      )
    )
  order by g.name;
$$;
grant execute on function my_groups(uuid) to authenticated;

------------------------------------------------------------------------------
-- 5. Last results
------------------------------------------------------------------------------
-- UX-PROF-01's "Last results" wants both teams, the court and the final score. None of that is in
-- `group_event_results`, which holds only a final_placement and ranking_points per event — it is
-- what `played_matches` and `best_position` count, and it exists only for finished RANKED GROUP
-- events. The match engine has the rest: `event_matches` carries the two scores and the court,
-- `match_players` the sides, `event_participants` the people.
--
-- So this number and the `played_matches` stat legitimately count different things, and neither is
-- wrong: one is "ranked group events you finished", the other "matches with a recorded score".
--
-- `security definer` is required, not preferred: the read policy on the match tables is scoped to
-- event participants, so a visitor reading a stranger's results through normal policies sees
-- nothing at all. Visibility is instead delegated to `event_is_visible`, the same helper every
-- other event surface uses — this screen must not be the one place that widens it.
create or replace function player_recent_results(p_user uuid, p_limit int default 5)
returns table (
  match_id     uuid,
  event_id     uuid,
  event_name   text,
  played_at    timestamptz,
  court_label  text,
  side_a_score integer,
  side_b_score integer,
  player_side  text,
  side_a_names text[],
  side_b_names text[]
)
language sql stable security definer set search_path = public as $$
  with mine as (
    select m.id, m.event_id, m.court_id, m.court_number,
           m.side_a_score, m.side_b_score, m.submitted_at, mp.side
    from match_players mp
    join event_participants ep on ep.id = mp.participant_id and ep.user_id = p_user
    join event_matches m       on m.id = mp.match_id
    where m.status = 'played'
      and m.side_a_score is not null
      and m.side_b_score is not null
      and event_is_visible(m.event_id, auth.uid())
      and not exists (
        select 1 from blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = p_user)
           or (b.blocker_id = p_user and b.blocked_id = auth.uid())
      )
  ),
  names as (
    select mp.match_id, mp.side,
           -- A roster can hold guests, who have a name but no account.
           array_agg(coalesce(p.full_name, ep.guest_name, '—') order by coalesce(p.full_name, ep.guest_name)) as names
    from match_players mp
    join event_participants ep on ep.id = mp.participant_id
    left join profiles p       on p.id = ep.user_id
    where mp.match_id in (select id from mine)
    group by mp.match_id, mp.side
  )
  select mine.id, mine.event_id, e.name,
         coalesce(mine.submitted_at, e.starts_at),
         coalesce(ct.name, 'Court ' || mine.court_number),
         mine.side_a_score, mine.side_b_score, mine.side,
         coalesce(na.names, '{}'), coalesce(nb.names, '{}')
  from mine
  join events e      on e.id = mine.event_id
  left join courts ct on ct.id = mine.court_id
  left join names na on na.match_id = mine.id and na.side = 'a'
  left join names nb on nb.match_id = mine.id and nb.side = 'b'
  order by coalesce(mine.submitted_at, e.starts_at) desc
  limit greatest(p_limit, 0);
$$;
revoke execute on function player_recent_results(uuid, int) from public, anon;
grant  execute on function player_recent_results(uuid, int) to authenticated;
