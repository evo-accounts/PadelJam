-- 0125_team_standings.sql
-- UX Audit — Manage Event, plan PR "0125 — team standings" (docs/audit/2026-09-29-ux-manage-event-plan.md):
-- decisions D10, D11; audit UX-MEVT-27; Requirements/in-progress-event.md IP-19. Stacked on 0122.
--
--   D11  standings(event) ranks TEAMS on a team event: one row per event_teams pair, is_team true,
--        entity_id = event_teams.id (what the clients' `teamNumberById` already expects). The team
--        result comes from the match data grouped by event_teams: one appearance per (match, side)
--        on which a player of the team played, so a pair that plays together counts every match
--        ONCE. The spec's pairs are fixed (IN-PROGRESS §Round count), but the round engine does not
--        keep them together yet (0122's "known and left for later"); a split pair still gets a
--        defined result — every match either partner played, once per side — rather than an error.
--        A player of a team event who is in no team (not reachable after start_event, but the
--        match rows can outlive a team) keeps an individual row so no result disappears.
--        Classic / Mixed are unchanged.
--
--        The return contract is EXTENDED, never changed: the seven existing columns keep their
--        names, order and meaning; seven are appended —
--          team_number                       the pair's number (null on an individual row)
--          participant_a_id / participant_b_id  the pair's players (individual row: a = entity_id)
--          user_a_id / user_b_id             their accounts (null for a guest)
--          name_a / name_b                   display names (profile name, else guest name)
--        standings() is SECURITY DEFINER and granted to anon, so the identity columns (user ids and
--        names) are filled only for a caller who can see the event (event_is_visible — the same
--        rule as event_participants' RLS) and a profile name only when neither has blocked the
--        other (the profiles read policy). Participant ids, like entity_id, are always returned —
--        they are what the internal callers join on. A new column set needs DROP + CREATE.
--
--   D11/D10  Group results: finish_event (0121 body) and set_event_ranking (0048 body) insert one
--        group_event_results row PER PLAYER from a new internal helper, _event_player_results —
--        on a team event both players of a pair get the pair's placement and placement_points.
--        Guests (user_id null) are skipped as before, and nobody is re-ranked around them: the
--        account holders keep their real placement (D10), including the partner of a guest.
--        fill_group_result_win_loss (0109) reads the same helper, so a partner's wins / losses are
--        the TEAM's (it recorded 0/0 for any team row before).
--
--   event_result_summary (0075 body): a team row's name is "A & B" (it joined the row's entity_id
--        to event_participants, which would drop every team row).
--
-- Not changed: generate_next_round's Mexicano seeding (0122) left-joins standings on the
-- participant id; on a team event it now finds no individual rank and falls back to join order —
-- the round engine ignores team pairs anyway (see above). player_badge_facts (0105) copies the
-- individual ranking by design; its only placement fact is "won an event", which a pair that
-- plays together wins jointly under either ranking. No backfill: group results already recorded
-- for completed team events keep their individual placements until set_event_ranking re-runs them.
--
-- HOSTED: paste after 0122 (0123 / 0124 do not touch these functions). Probe afterwards:
--   select exists (select 1 from information_schema.routines r
--                   join information_schema.parameters p on p.specific_name = r.specific_name
--                  where r.routine_name = 'standings' and p.parameter_name = 'team_number') as has_0125;

begin;

-- ---------------------------------------------------------------------------------------------
-- D11: standings — team rows on a team event
-- ---------------------------------------------------------------------------------------------
drop function if exists standings(uuid);

create function standings(p_event_id uuid)
returns table (
  entity_id uuid, is_team boolean, points int, wins int, draws int, losses int, rank int,
  team_number int, participant_a_id uuid, participant_b_id uuid,
  user_a_id uuid, user_b_id uuid, name_a text, name_b text
)
language sql stable security definer set search_path = public as $$
  with ev as (
    select e.scoring_mode, e.specification = 'team' as team_event
    from events e where e.id = p_event_id
  ),
  viewer as (select auth.uid() as uid, event_is_visible(p_event_id, auth.uid()) as can_see),
  sides as (
    select m.id as match_id, mp.side, mp.participant_id,
           case mp.side when 'a' then m.side_a_score else m.side_b_score end as own,
           case mp.side when 'a' then m.side_b_score else m.side_a_score end as opp
    from event_matches m join match_players mp on mp.match_id = m.id
    where m.event_id = p_event_id and m.status = 'played'
  ),
  -- NEW: each player's pair, on a team event only.
  team_of as (
    select t.id as team_id, x.pid
    from event_teams t
    cross join lateral (values (t.player_a_id), (t.player_b_id)) as x(pid)
    where t.event_id = p_event_id and x.pid is not null
      and coalesce((select team_event from ev), false)
  ),
  -- NEW: one appearance per entity per match side — the two players of a pair on the same side of
  -- a match are ONE appearance of the team.
  appearances as (
    select distinct coalesce(tf.team_id, s.participant_id) as entity, (tf.team_id is not null) as team_row,
           s.match_id, s.side, s.own, s.opp
    from sides s left join team_of tf on tf.pid = s.participant_id
  ),
  agg as (
    select a.entity, a.team_row,
      coalesce(sum(coalesce(a.own, 0)), 0)::int as total_points,
      count(*) filter (where a.own > a.opp)::int as n_wins,
      count(*) filter (where a.own = a.opp)::int as n_draws,
      count(*) filter (where a.own < a.opp)::int as n_losses
    from appearances a group by a.entity, a.team_row
  ),
  scored as (
    select g.*,
      case (select scoring_mode from ev) when 'points' then g.total_points else 3 * g.n_wins + g.n_draws end as pts
    from agg g
  )
  select s.entity, s.team_row, s.pts, s.n_wins, s.n_draws, s.n_losses,
    rank() over (order by s.pts desc)::int,
    t.team_number,
    pa.id,
    pb.id,
    case when v.can_see then pa.user_id end,
    case when v.can_see then pb.user_id end,
    case when v.can_see then coalesce(
      case when not exists (select 1 from blocks b
                             where (b.blocker_id = v.uid and b.blocked_id = pa.user_id)
                                or (b.blocker_id = pa.user_id and b.blocked_id = v.uid))
           then pra.full_name end,
      pa.guest_name) end,
    case when v.can_see then coalesce(
      case when not exists (select 1 from blocks b
                             where (b.blocker_id = v.uid and b.blocked_id = pb.user_id)
                                or (b.blocker_id = pb.user_id and b.blocked_id = v.uid))
           then prb.full_name end,
      pb.guest_name) end
  from scored s
  cross join viewer v
  left join event_teams t on s.team_row and t.id = s.entity
  left join event_participants pa on pa.id = case when s.team_row then t.player_a_id else s.entity end
  left join event_participants pb on s.team_row and pb.id = t.player_b_id
  left join profiles pra on pra.id = pa.user_id
  left join profiles prb on prb.id = pb.user_id;
$$;
grant execute on function standings(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------------------------
-- D11/D10: one row per PLAYER for the group ranking — a pair's placement goes to both players
-- ---------------------------------------------------------------------------------------------
create or replace function _event_player_results(p_event_id uuid)
returns table (participant_id uuid, user_id uuid, placement int, wins int, losses int)
language sql stable security definer set search_path = public as $$
  select p.id, p.user_id, s.rank, s.wins, s.losses
  from standings(p_event_id) s
  join event_participants p on p.id in (s.participant_a_id, s.participant_b_id)
  where p.event_id = p_event_id;
$$;
revoke execute on function _event_player_results(uuid) from public, anon, authenticated;

-- 0109 body; reads the per-player helper instead of joining standings' entity_id.
create or replace function fill_group_result_win_loss() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select r.wins, r.losses into new.wins, new.losses
    from _event_player_results(new.event_id) r
   where r.user_id = new.user_id
   limit 1;
  new.wins := coalesce(new.wins, 0);
  new.losses := coalesce(new.losses, 0);
  return new;
end; $$;
revoke execute on function fill_group_result_win_loss() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- finish_event (0121 body) — group results per player
-- ---------------------------------------------------------------------------------------------
create or replace function finish_event(p_event_id uuid, p_finish_message text default null, p_counts_override boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_ev events%rowtype;
  v_early boolean;
  v_counts boolean;
  v_season uuid;
  v_actor text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event:finish:'||p_event_id::text, 0));
  -- NEW (B6): read the status under the lock, so of two concurrent finishes only one publishes.
  select * into v_ev from events where id = p_event_id;
  if v_ev.deleted_at is not null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.status <> 'in_progress' then raise exception 'event_not_in_progress' using errcode='P0001'; end if;

  v_early := exists (
    select 1 from event_matches m where m.event_id = p_event_id and m.status = 'pending');

  if v_ev.is_private or v_ev.group_id is null then
    v_counts := false;
  else
    v_counts := coalesce(p_counts_override, v_ev.counts_for_ranking);
  end if;

  update events set
    status = 'completed',
    published_at = coalesce(published_at, now()),
    finish_message = p_finish_message,
    finished_early = v_early,
    counts_for_ranking = v_counts
  where id = p_event_id;

  if v_counts then
    select id into v_season from group_seasons
      where group_id = v_ev.group_id and ended_at is null;
    if v_season is not null then
      delete from group_event_results where event_id = p_event_id;
      -- NEW (0125, D11/D10): one row per player; both players of a pair get the pair's placement.
      insert into group_event_results (group_season_id, event_id, user_id, final_placement, ranking_points)
      select v_season, p_event_id, r.user_id, r.placement, placement_points(r.placement)
      from _event_player_results(p_event_id) r
      where r.user_id is not null;
    end if;
  end if;

  -- Every confirmed player with an account, the organizer included when they played. The event was
  -- in progress, so this runs once (the 0093 "not completed yet" guard is implied by B6).
  select full_name into v_actor from profiles where id = v_user;
  insert into notifications (user_id, type, actor_id, event_id, actor_name, entity_name)
  select ep.user_id, 'results_published', v_user, p_event_id, v_actor, v_ev.name
  from event_participants ep
  where ep.event_id = p_event_id and ep.status = 'confirmed' and ep.user_id is not null
    and not notif_blocked(ep.user_id, v_user);
end; $$;

-- ---------------------------------------------------------------------------------------------
-- set_event_ranking (0048 body) — the same per-player insert
-- ---------------------------------------------------------------------------------------------
create or replace function set_event_ranking(p_event_id uuid, p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_ev events%rowtype;
  v_season uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;

  update events set counts_for_ranking = p_enabled where id = p_event_id;

  if not p_enabled then
    delete from group_event_results where event_id = p_event_id;
    return;
  end if;

  -- Enabling: re-run the finish ranking insert. Only valid once completed.
  if v_ev.status <> 'completed' then raise exception 'event_not_completed' using errcode='P0001'; end if;
  if v_ev.is_private or v_ev.group_id is null then raise exception 'not_rankable' using errcode='P0001'; end if;

  select id into v_season from group_seasons
    where group_id = v_ev.group_id and ended_at is null;
  if v_season is null then return; end if;

  delete from group_event_results where event_id = p_event_id;
  -- NEW (0125): one row per player, as finish_event.
  insert into group_event_results (group_season_id, event_id, user_id, final_placement, ranking_points)
  select v_season, p_event_id, r.user_id, r.placement, placement_points(r.placement)
  from _event_player_results(p_event_id) r
  where r.user_id is not null;
end; $$;

-- ---------------------------------------------------------------------------------------------
-- event_result_summary (0075 body) — a team row is named after both players
-- ---------------------------------------------------------------------------------------------
create or replace function event_result_summary(p_event_id uuid)
returns table (rank int, name text, points int)
language sql stable security definer set search_path = public as $$
  select s.rank,
         case when s.is_team
              then coalesce(nullif(concat_ws(' & ', coalesce(pra.full_name, pa.guest_name),
                                                   coalesce(prb.full_name, pb.guest_name)), ''), '—')
              else coalesce(pra.full_name, pa.guest_name, '—') end as name,
         s.points
  from standings(p_event_id) s
  left join event_participants pa on pa.id = s.participant_a_id
  left join event_participants pb on pb.id = s.participant_b_id
  left join profiles pra on pra.id = pa.user_id
  left join profiles prb on prb.id = pb.user_id
  where event_group_community(p_event_id) is not null
    and is_community_member(event_group_community(p_event_id))
  order by s.rank asc, name asc;
$$;

-- ---------------------------------------------------------------------------------------------
-- Self-check
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if not has_function_privilege('anon', 'public.standings(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.standings(uuid)', 'EXECUTE') then
    raise exception '0125: standings lost its grants'; end if;
  if has_function_privilege('authenticated', 'public._event_player_results(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public._event_player_results(uuid)', 'EXECUTE') then
    raise exception '0125: _event_player_results is callable by clients'; end if;
end $$;

commit;
