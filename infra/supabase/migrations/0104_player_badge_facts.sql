-- 0104_player_badge_facts.sql
--
-- One read that returns every NUMBER the badge catalogue needs. It returns no verdicts.
--
-- WHY COUNTERS AND NOT VERDICTS. The catalogue is ~70 badges, ~35 of them tiered, and its
-- thresholds are a product decision that will move. If this function decided "unlocked", every
-- future tweak to a threshold would be another hand-pasted migration against the hosted database.
-- Returning the raw counts keeps the catalogue in TypeScript, where changing it is a code change.
-- That was the explicit condition for doing badges without a `badges` table at all.
--
-- SECURITY DEFINER IS MANDATORY, AND CARRIES TWO OBLIGATIONS.
--
-- Mandatory because almost every source table gates on the VIEWER, not the subject:
-- `group_event_results` RLS requires group-season membership (0044), and `event_matches`,
-- `match_players` and `event_participants` all gate on `event_is_visible`, which asks whether the
-- CALLER is the organizer, a participant, an invitee, or a member of the event's public group.
-- Under invoker rights "matches played" would be "matches played that you can see", i.e. a
-- different number for every viewer. That is not a counter.
--
-- Obligation 1: definer bypasses the `profiles` read policy too, and that policy is where the
-- BLOCK rule lives (0055 — symmetric, either direction). So the block predicate is re-applied by
-- hand below, exactly as `get_player_profile` and `player_recent_results` do. Without it a blocked
-- viewer gets a full statistical profile of someone they cannot otherwise see.
--
-- Obligation 2: `event_is_visible` is deliberately NOT applied to the counters. It is right for
-- `player_recent_results`, which renders the CONTENT of individual matches — opponents, scores,
-- courts. An aggregate about `p_user` filtered per viewer would make a badge appear and disappear
-- depending on who is looking at the profile. `community_member_count` (0100) is the precedent for
-- an unfiltered aggregate over rows the caller cannot enumerate, and `get_player_profile` already
-- returns `played_matches` and `best_position` unfiltered.
--
-- "MATCHES PLAYED" HAS TWO MEANINGS AND BOTH ARE RETURNED.
-- `packages/api/src/profile/queries.ts` already documents the split: `group_event_results` counts
-- finished RANKED GROUP events, while a count over `event_matches` counts matches the engine has a
-- score for. A standalone americano contributes to one and not the other. The profile stat card
-- shows the first. A badge that says "100 matches" means the second. Emitting one number under one
-- name would guarantee a badge that contradicts the figure printed beside it.
--
-- PLACEMENT does NOT call `standings()` per event. `standings` (0045) is plain SQL with a single
-- `rank() over (order by ...)`; the same CTEs with `partition by event_id` added produce every
-- placement the player has ever had in one pass. The scoring branch is copied verbatim from it —
-- if it drifts, a badge will disagree with the event results screen.

create or replace function player_badge_facts(p_user uuid)
returns table (
  -- Play
  matches_scored            int,
  matches_won               int,
  ranked_events_finished    int,   -- the profile stat card's "played matches"
  best_placement            int,
  event_wins                int,
  longest_win_streak        int,
  longest_week_streak       int,
  -- People
  distinct_partners         int,
  max_wins_with_partner     int,
  following_count           int,
  followers_count           int,
  -- Places
  events_attended           int,
  events_organised          int,
  communities_joined        int,
  communities_created       int,
  largest_community_created int,
  groups_joined             int,
  -- Time
  signup_rank               int,
  account_age_days          int
)
language sql stable security definer set search_path = public as $$
  with
  -- The block rule, applied by hand because definer bypassed the policy that normally carries it.
  -- Every CTE below is empty when this is true, so a blocked viewer gets zeros rather than facts.
  blocked as (
    select exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p_user)
         or (b.blocker_id = p_user     and b.blocked_id = auth.uid())
    ) as yes
  ),
  -- Every scored match this player was in, with whether they won it and when it happened.
  played as (
    select mm.id,
           mm.event_id,
           mp.side,
           mp.participant_id,
           coalesce(mm.submitted_at, e.starts_at) as at,
           case
             when (mp.side = 'a' and mm.side_a_score > mm.side_b_score)
               or (mp.side = 'b' and mm.side_b_score > mm.side_a_score)
             then 1 else 0
           end as won
    from match_players mp
    join event_participants ep on ep.id = mp.participant_id and ep.user_id = p_user
    join event_matches mm      on mm.id = mp.match_id
    join events e              on e.id = mm.event_id
    where mm.status = 'played'
      and mm.side_a_score is not null
      and mm.side_b_score is not null
      and e.deleted_at is null
      and not (select yes from blocked)
  ),
  -- Longest run of consecutive wins, ordered by time. Gaps and islands: subtracting a per-value
  -- row number from the global one gives a constant per run.
  win_runs as (
    select count(*) as len
    from (
      select won,
             row_number() over (order by at)
               - row_number() over (partition by won order by at) as grp
      from played
    ) s
    where won = 1
    group by won, grp
  ),
  -- Longest run of consecutive CALENDAR WEEKS containing at least one match. Truncated in UTC on
  -- purpose: the alternative is the database session's timezone, which would make a player's
  -- streak depend on which server answered.
  weeks as (
    select distinct date_trunc('week', (at at time zone 'UTC'))::date as wk from played
  ),
  week_runs as (
    select count(*) as len
    from (
      select wk, (wk - (row_number() over (order by wk) * interval '1 week'))::date as grp
      from weeks
    ) s
    group by grp
  ),
  -- Partners: anyone else on the SAME side of the SAME match. Guests have no user_id and are
  -- skipped — they are not a person you can be credited with playing alongside.
  partners as (
    select pep.user_id as partner_id, p.won
    from played p
    join match_players other on other.match_id = p.id
                            and other.side = p.side
                            and other.participant_id <> p.participant_id
    join event_participants pep on pep.id = other.participant_id
    where pep.user_id is not null and pep.user_id <> p_user
  ),
  -- Placement in every event, from `standings`' own logic with the window partitioned by event.
  agg as (
    select p.event_id, p.participant_id,
           coalesce(sum(coalesce(
             case when p.side = 'a' then mm.side_a_score else mm.side_b_score end, 0)), 0)::int as total_points,
           count(*) filter (where p.won = 1)::int as wins,
           count(*) filter (where mm.side_a_score = mm.side_b_score)::int as draws
    from played p
    join event_matches mm on mm.id = p.id
    group by p.event_id, p.participant_id
  ),
  -- Every participant of those events, so the rank is against the whole field and not just us.
  field as (
    select mm.event_id, mp.participant_id,
           coalesce(sum(coalesce(
             case when mp.side = 'a' then mm.side_a_score else mm.side_b_score end, 0)), 0)::int as total_points,
           count(*) filter (where (mp.side = 'a' and mm.side_a_score > mm.side_b_score)
                               or (mp.side = 'b' and mm.side_b_score > mm.side_a_score))::int as wins,
           count(*) filter (where mm.side_a_score = mm.side_b_score)::int as draws
    from event_matches mm
    join match_players mp on mp.match_id = mm.id
    where mm.event_id in (select event_id from agg)
      and mm.status = 'played'
      and mm.side_a_score is not null
      and mm.side_b_score is not null
    group by mm.event_id, mp.participant_id
  ),
  ranked as (
    select f.event_id, f.participant_id,
           rank() over (
             partition by f.event_id
             order by case ev.scoring_mode
                        when 'points' then f.total_points
                        else 3 * f.wins + f.draws
                      end desc
           )::int as place
    from field f
    join events ev on ev.id = f.event_id
  ),
  mine as (
    select r.place from ranked r join agg a on a.participant_id = r.participant_id and a.event_id = r.event_id
  )
  select
    (select count(*)::int from played),
    (select coalesce(sum(won), 0)::int from played),
    (select count(*)::int from group_event_results r where r.user_id = p_user and not (select yes from blocked)),
    (select min(r.final_placement)::int from group_event_results r where r.user_id = p_user and not (select yes from blocked)),
    (select count(*)::int from mine where place = 1),
    (select coalesce(max(len), 0)::int from win_runs),
    (select coalesce(max(len), 0)::int from week_runs),
    (select count(distinct partner_id)::int from partners),
    (select coalesce(max(c), 0)::int from (select count(*) as c from partners where won = 1 group by partner_id) s),
    (select count(*)::int from follows f where f.follower_id = p_user and not (select yes from blocked)),
    (select count(*)::int from follows f where f.followee_id = p_user and not (select yes from blocked)),
    (select count(*)::int
       from event_participants ep join events e on e.id = ep.event_id
      where ep.user_id = p_user and ep.status = 'confirmed'
        and e.status = 'completed' and e.deleted_at is null
        and not (select yes from blocked)),
    -- `events.organizer_id`, not a created_by — an event records who RUNS it, and 0044's
    -- `is_event_organizer` uses the same column.
    (select count(*)::int from events e
      where e.organizer_id = p_user and e.deleted_at is null and not (select yes from blocked)),
    (select count(*)::int
       from community_members cm join communities c on c.id = cm.community_id
      where cm.user_id = p_user and c.archived_at is null and not (select yes from blocked)),
    (select count(*)::int from communities c
      where c.created_by = p_user and c.archived_at is null and not (select yes from blocked)),
    (select coalesce(max(n), 0)::int from (
       select count(cm.user_id) as n
         from communities c left join community_members cm on cm.community_id = c.id
        where c.created_by = p_user and c.archived_at is null and not (select yes from blocked)
        group by c.id) s),
    -- A community's auto-created general group is not a group the player chose to join.
    (select count(*)::int
       from group_members gm join groups g on g.id = gm.group_id
      where gm.user_id = p_user and g.archived_at is null and not g.is_general
        and not (select yes from blocked)),
    -- Founding Jammer. Safe to compute on read: `soft_delete_account` bans rather than deletes and
    -- a hard delete is impossible (NOT NULL / RESTRICT foreign keys), so this ordering never shifts.
    --
    -- The block guard is a CASE here, not a WHERE, and that difference is a real bug that the
    -- test caught. `count(*) + 1` over a WHERE that excludes every row is `0 + 1` = 1 — the
    -- RAREST rank there is. A blocked viewer would have seen the subject as the very first user
    -- ever to sign up, which is the one value that unlocks Founding Jammer. Every other counter
    -- degrades safely to zero under a WHERE; this one degrades to a maximum.
    (select case when (select yes from blocked) then 0 else (
       select count(*) + 1 from profiles other
        where other.created_at < (select created_at from profiles where id = p_user)
     ) end)::int,
    -- Same reason it is a CASE: this one had no guard at all, so account age leaked past a block.
    (select case when (select yes from blocked) then 0 else (
       select (now()::date - p.created_at::date) from profiles p where p.id = p_user
     ) end)::int;
$$;

-- 0030 set `alter default privileges ... grant execute on functions to anon, authenticated`, so a
-- bare `create or replace` re-grants to anon unless this pair is re-issued (0094).
revoke execute on function player_badge_facts(uuid) from public, anon;
grant  execute on function player_badge_facts(uuid) to authenticated;
