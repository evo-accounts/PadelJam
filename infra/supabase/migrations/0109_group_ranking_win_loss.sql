-- 0109_group_ranking_win_loss.sql
--
-- UX Audit — Groups, plan PR 3 (docs/audit/2026-09-25-ux-groups-plan.md, decision 3).
--
-- The group page's ranking preview shows Points / Win / Lost (UX-GRP-04); the full ranking shows
-- Points / Events played (UX-GRP-06); both sort. group_event_results held only a placement and its
-- points — the wins and losses were computed by standings() at finish time and thrown away.
--
-- 1. `wins` / `losses` on group_event_results: MATCHES won and lost in that event (standings()'s
--    own counts; draws are neither). Filled by a BEFORE INSERT trigger from standings(), not by
--    rewriting finish_event (0093) and set_event_ranking (0048), which both insert these rows and
--    are long enough that a copied body is the bigger risk. standings() is individual-only today
--    (0045); a team row finds no participant and records 0/0 rather than failing the finish.
--    Existing rows are backfilled the same way.
--
-- 2. group_ranking(season, since): the aggregation the client did in JavaScript (sum of points,
--    distinct events), server-side, plus wins, losses, whether each player is still in the group
--    (decision 2: departed players stay, greyscale), and when the season's results last changed
--    ("Last update {DATE}", UX-GRP-04/06). Visibility is the group_event_results read policy
--    (0044): group members, or community members of a public group. Blocks are symmetric.
--    `since` filters by the event's start, as the client did; points are never re-weighted.
--
-- HOSTED: paste after 0108. The backfill recomputes standings for every recorded event once.
-- Probe afterwards:
--   select to_regprocedure('group_ranking(uuid,timestamptz)') is not null
--      and exists (select 1 from information_schema.columns
--                  where table_name='group_event_results' and column_name='wins') as has_0109;

------------------------------------------------------------------------------
-- 1. Wins and losses per event result
------------------------------------------------------------------------------
alter table group_event_results
  add column wins   integer not null default 0,
  add column losses integer not null default 0;

create or replace function fill_group_result_win_loss() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select s.wins, s.losses into new.wins, new.losses
    from standings(new.event_id) s
    join event_participants p on p.id = s.entity_id
   where p.event_id = new.event_id and p.user_id = new.user_id
   limit 1;
  new.wins := coalesce(new.wins, 0);
  new.losses := coalesce(new.losses, 0);
  return new;
end; $$;
revoke execute on function fill_group_result_win_loss() from public, anon, authenticated;

create trigger trg_group_result_win_loss before insert on group_event_results
  for each row execute function fill_group_result_win_loss();

-- Backfill: one standings() call per event, not per row.
update group_event_results r
   set wins = s.wins, losses = s.losses
  from (select distinct event_id from group_event_results) ev
  cross join lateral standings(ev.event_id) s
  join event_participants p on p.id = s.entity_id and p.event_id = ev.event_id
 where r.event_id = ev.event_id and r.user_id = p.user_id;

------------------------------------------------------------------------------
-- 2. The ranking, server-side
------------------------------------------------------------------------------
create or replace function group_ranking(p_season_id uuid, p_since timestamptz default null)
returns table (
  rank          integer,
  user_id       uuid,
  full_name     text,
  avatar_url    text,
  points        integer,
  wins          integer,
  losses        integer,
  events_played integer,
  is_member     boolean,
  last_updated  timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_group uuid; v_cid uuid; v_private boolean;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select g.id, g.community_id, g.is_private into v_group, v_cid, v_private
    from group_seasons s join groups g on g.id = s.group_id where s.id = p_season_id;
  if v_group is null then raise exception 'group_not_found' using errcode='P0001'; end if;
  if not (is_group_member(v_group) or (not v_private and is_community_member(v_cid))) then
    raise exception 'forbidden' using errcode='P0001';
  end if;
  return query
    with res as (
      select r.user_id, r.event_id, r.ranking_points, r.wins, r.losses, r.created_at
        from group_event_results r
        join events e on e.id = r.event_id
       where r.group_season_id = p_season_id
         and (p_since is null or e.starts_at >= p_since)
    ),
    agg as (
      select res.user_id,
             sum(res.ranking_points)::int  as points,
             sum(res.wins)::int            as wins,
             sum(res.losses)::int          as losses,
             count(distinct res.event_id)::int as events_played
        from res group by res.user_id
    )
    select (rank() over (order by a.points desc))::int,
           a.user_id, p.full_name, p.avatar_url, a.points, a.wins, a.losses, a.events_played,
           exists (select 1 from group_members gm where gm.group_id = v_group and gm.user_id = a.user_id),
           (select max(r2.created_at) from group_event_results r2 where r2.group_season_id = p_season_id)
      from agg a
      join profiles p on p.id = a.user_id
     where not exists (select 1 from blocks b
                       where (b.blocker_id = v_user and b.blocked_id = a.user_id)
                          or (b.blocker_id = a.user_id and b.blocked_id = v_user))
     order by a.points desc, a.events_played desc, p.full_name;
end; $$;
revoke execute on function group_ranking(uuid, timestamptz) from public, anon, authenticated;
grant execute on function group_ranking(uuid, timestamptz) to authenticated;
