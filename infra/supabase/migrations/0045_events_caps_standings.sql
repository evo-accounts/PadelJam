-- 0045_events_caps_standings.sql
-- Recurring-events plan cap, placement scoring table, and live standings function.
create or replace function enforce_recurring_events_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cid uuid; v_limit int; v_count int;
begin
  select community_id into v_cid from groups where id = NEW.group_id;
  perform pg_advisory_xact_lock(hashtextextended('recurring_cap:'||v_cid::text, 0));
  v_limit := community_limit(v_cid, 'recurring_events');
  if v_limit is null then return NEW; end if;
  select count(*) into v_count from event_series es join groups g on g.id = es.group_id
    where g.community_id = v_cid and es.is_active and es.deleted_at is null;
  if v_count >= v_limit then
    raise exception 'recurring_events limit reached (%)', v_limit using errcode='P0001';
  end if;
  return NEW;
end; $$;
create trigger trg_recurring_events_cap before insert on event_series
  for each row execute function enforce_recurring_events_cap();

create or replace function placement_points(p int) returns int
language sql immutable as $$
  select case p when 1 then 100 when 2 then 75 when 3 then 60 when 4 then 50
    when 5 then 42 when 6 then 36 when 7 then 30 when 8 then 25 when 9 then 20
    when 10 then 16 when 11 then 12 when 12 then 8 else 5 end;
$$;

-- standings: INDIVIDUAL branch only for now (Classic/Mixed). Team branch added later.
create or replace function standings(p_event_id uuid)
returns table (entity_id uuid, is_team boolean, points int, wins int, draws int, losses int, rank int)
language sql stable security definer set search_path = public as $$
  with ev as (select scoring_mode from events where id = p_event_id),
  sides as (
    select mp.participant_id,
           case mp.side when 'a' then m.side_a_score else m.side_b_score end as own,
           case mp.side when 'a' then m.side_b_score else m.side_a_score end as opp
    from event_matches m join match_players mp on mp.match_id = m.id
    where m.event_id = p_event_id and m.status = 'played'
  ),
  agg as (
    select participant_id,
      coalesce(sum(coalesce(own,0)),0)::int total_points,
      count(*) filter (where own > opp)::int wins,
      count(*) filter (where own = opp)::int draws,
      count(*) filter (where own < opp)::int losses
    from sides group by participant_id
  )
  select a.participant_id, false,
    case (select scoring_mode from ev) when 'points' then a.total_points else 3*a.wins + a.draws end,
    a.wins, a.draws, a.losses,
    rank() over (order by case (select scoring_mode from ev) when 'points' then a.total_points else 3*a.wins + a.draws end desc)::int
  from agg a;
$$;
grant execute on function is_event_organizer, is_event_participant, is_event_invitee,
  event_is_visible, event_capacity, event_group_community, placement_points, standings to authenticated, anon;
