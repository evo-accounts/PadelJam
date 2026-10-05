-- 0126_engine_pairs.sql
-- UX Audit — Manage Event: the round engine forms pairs by the event's modality. Audit UX-MEVT-23,
-- UX-MEVT-25, UX-MEVT-27 (docs/audit/2026-09-29-ux-manage-event.md), UX-LIVE-20; Requirements/
-- in-progress-event.md §5 (round count, 5.4 resting players, IP-13, IP-18). Stacked on 0125.
--
-- The bug (0122's "known and left for later"): every engine path rotated partners freely, whatever
-- the modality — the client Americano schedule, start_event's round 1 and generate_next_round
-- (Mexicano / Up & Down) all fed participants into _build_fours_arrangement.
--   Team   a pair must play the WHOLE event as one (UX-MEVT-27) — it was split from round 1.
--   Mixed  every pair is one man and one woman (UX-MEVT-25) — nothing enforced it.
--   Up & Down never rotated a player who rested in round 1 back in, and wrote no round_rest rows
--          after round 1 (its courts came from the previous round's matches only).
--
-- The fix. A round is built from UNITS, one per what the modality pairs:
--   Classic  a unit is a player; a court seats 4 units.
--   Team     a unit is a confirmed, complete event_teams pair; a court seats 2 units (pair v pair).
--   Mixed    a unit is a player in the pool of their gender; a court seats 2 men + 2 women, and
--            each side is one man and one woman.
-- Courts used = least(num_courts, what the units fill) — 0122's "largest multiple of 4" rule, per
-- modality: floor(players / 4), floor(teams / 2), floor(min(men, women) / 2). The units that do
-- not fit rest — a whole team, or as many men as women — chosen fairly: fewest rests so far first
-- (0122's rule), so the rest rotates.
--
--   _engine_units(event)   NEW internal: the units with their players, pool, rests so far.
--   _engine_place(mode, style, courts, units)
--                          NEW internal, pure: picks who rests and builds the courts.
--                          style 'mexicano': ranked fours as 1 + 4 v 2 + 3 (Classic, unchanged),
--                          team 1 v team 2, Mixed best man + second woman v second man + best woman;
--                          style 'ladder' (Up & Down): the units in court order, 1 + 2 v 3 + 4 —
--                          the pair that moved together stays together, as before.
--   start_event            round 1 of Mexicano / Up & Down (and an Americano started without a
--                          client schedule) is seeded as before — stand-by last, group ranking
--                          points (a team: its two players' sum) or random — by unit.
--   generate_next_round    Mexicano ranks units by standings() (0125: a team event ranks teams).
--                          Up & Down moves units: winners up a court, losers down, the ends stay;
--                          a unit that did not play the previous round rejoins at the middle court
--                          (IN-PROGRESS §5.4 "rejoins at a mid-table court"); who rests is chosen
--                          like Mexicano, so round-1 resters come back in; round_rest is written.
--   _validate_rounds       a client-built (Americano) schedule is refused (invalid_rounds) when a
--                          side of a team event is not a confirmed pair, or a side of a mixed event
--                          is not one man and one woman.
--   event_engine_roster(event)
--                          NEW, organizer only: each confirmed participant's gender and team, so
--                          the client builds a Team / Mixed Americano schedule from the same
--                          genders start_event checks (a blocked profile hides gender from the
--                          client's profiles embed).
--
-- Every redefined function is its latest body (0122: _validate_rounds, start_event,
-- generate_next_round) plus the lines marked NEW. Classic is unchanged in outcome: same seeding,
-- same 1 + 4 v 2 + 3 Mexicano fours and Up & Down movement.
--
-- HOSTED: paste after 0125 (0123 / 0124 do not touch these functions). Probe afterwards:
--   select exists (select 1 from pg_proc where proname = 'event_engine_roster') as has_0126;

begin;

-- ---------------------------------------------------------------------------------------------
-- Units
-- ---------------------------------------------------------------------------------------------
create or replace function _engine_mode(p_event_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case specification when 'team' then 'team' when 'mixed' then 'mixed' else 'classic' end
  from events where id = p_event_id;
$$;
revoke execute on function _engine_mode(uuid) from public, anon, authenticated;

-- One row per unit of the event's modality, over the CONFIRMED roster. A team event's player who
-- is in no complete confirmed team is not a unit (start_event refuses teams_incomplete). A mixed
-- player without a gender lands in the 'unknown' pool, which is never seated.
create or replace function _engine_units(p_event_id uuid)
returns table (unit_id uuid, players uuid[], pool text, joined_at timestamptz, is_standby boolean,
               user_ids uuid[], team_number int, rests int)
language sql stable security definer set search_path = public as $$
  with spec as (select _engine_mode(p_event_id) as mode),
  conf as (
    select ep.id, ep.user_id, ep.joined_at, ep.is_standby, coalesce(pr.gender, ep.guest_gender) as g
    from event_participants ep left join profiles pr on pr.id = ep.user_id
    where ep.event_id = p_event_id and ep.status = 'confirmed'
  ),
  units as (
    select t.id as unit_id, array[a.id, b.id] as players, 'all'::text as pool,
           greatest(a.joined_at, b.joined_at) as joined_at, (a.is_standby or b.is_standby) as is_standby,
           array[a.user_id, b.user_id] as user_ids, t.team_number
    from event_teams t
    join conf a on a.id = t.player_a_id
    join conf b on b.id = t.player_b_id
    where t.event_id = p_event_id and t.is_confirmed and (select mode from spec) = 'team'
    union all
    select c.id, array[c.id],
           case when (select mode from spec) = 'mixed' then coalesce(c.g, 'unknown') else 'all' end,
           c.joined_at, c.is_standby, array[c.user_id], null::int
    from conf c where (select mode from spec) <> 'team'
  )
  select u.unit_id, u.players, u.pool, u.joined_at, u.is_standby, u.user_ids, u.team_number,
         (select count(distinct rr.round_id)::int
            from round_rest rr join event_rounds er on er.id = rr.round_id
           where er.event_id = p_event_id and rr.participant_id = any(u.players))
  from units u;
$$;
revoke execute on function _engine_units(uuid) from public, anon, authenticated;

-- p_units: [{players: [pid…], pool: 'all'|'male'|'female'|'unknown', ord: n, rest_ord: n}]
--   ord       court order of the units that play (ascending)
--   rest_ord  who rests first when there are more units than seats (ascending), per pool
-- Returns {arrangement: [...] (for _persist_round_matches), rests: [pid…]}.
create or replace function _engine_place(p_mode text, p_style text, p_courts int, p_units jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  v_units jsonb := coalesce(p_units, '[]'::jsonb);
  v_n int; v_men int; v_women int; v_courts int; v_seat int;
  v_rows jsonb;
  v_rest jsonb;
  v_ids text[]; v_m text[]; v_w text[]; v_teams jsonb;
  v_out jsonb := '[]'::jsonb;
  k int; sa jsonb; sb jsonb;
begin
  select count(*), count(*) filter (where e->>'pool' = 'male'), count(*) filter (where e->>'pool' = 'female')
    into v_n, v_men, v_women from jsonb_array_elements(v_units) e;
  v_courts := greatest(0, least(coalesce(p_courts, 0), case p_mode
                when 'team' then v_n / 2 when 'mixed' then least(v_men, v_women) / 2 else v_n / 4 end));
  v_seat := v_courts * case p_mode when 'classic' then 4 else 2 end;

  -- Per pool: the first (count - seats) by rest_ord rest; mixed seats only the male / female pools.
  select coalesce(jsonb_agg(jsonb_build_object('players', q.players, 'pool', q.pool, 'ord', q.ord,
                                               'rest', q.rn <= q.cnt - q.seat)), '[]'::jsonb)
    into v_rows
  from (
    select e->'players' as players, e->>'pool' as pool, (e->>'ord')::numeric as ord,
           row_number() over (partition by e->>'pool' order by (e->>'rest_ord')::numeric, (e->>'ord')::numeric) as rn,
           count(*) over (partition by e->>'pool') as cnt,
           case when p_mode <> 'mixed' or e->>'pool' in ('male', 'female') then v_seat else 0 end as seat
    from jsonb_array_elements(v_units) e
  ) q;

  select coalesce(jsonb_agg(p), '[]'::jsonb) into v_rest
  from jsonb_array_elements(v_rows) r, jsonb_array_elements(r->'players') p
  where (r->>'rest')::boolean;

  if v_courts = 0 then
    return jsonb_build_object('arrangement', '[]'::jsonb, 'rests', v_rest);
  end if;

  if p_mode = 'team' then
    select jsonb_agg(r->'players' order by (r->>'ord')::numeric) into v_teams
    from jsonb_array_elements(v_rows) r where not (r->>'rest')::boolean;
    for k in 1..v_courts loop
      v_out := v_out || jsonb_build_array(jsonb_build_object('court_number', k, 'match_number', 1,
        'side_a', v_teams->(2*k - 2), 'side_b', v_teams->(2*k - 1)));
    end loop;

  elsif p_mode = 'mixed' then
    select array_agg(r->'players'->>0 order by (r->>'ord')::numeric) into v_m
    from jsonb_array_elements(v_rows) r where not (r->>'rest')::boolean and r->>'pool' = 'male';
    select array_agg(r->'players'->>0 order by (r->>'ord')::numeric) into v_w
    from jsonb_array_elements(v_rows) r where not (r->>'rest')::boolean and r->>'pool' = 'female';
    for k in 1..v_courts loop
      if p_style = 'ladder' then
        sa := jsonb_build_array(v_m[2*k - 1], v_w[2*k - 1]);
        sb := jsonb_build_array(v_m[2*k], v_w[2*k]);
      else
        sa := jsonb_build_array(v_m[2*k - 1], v_w[2*k]);
        sb := jsonb_build_array(v_m[2*k], v_w[2*k - 1]);
      end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object('court_number', k, 'match_number', 1,
        'side_a', sa, 'side_b', sb));
    end loop;

  else
    select array_agg(r->'players'->>0 order by (r->>'ord')::numeric) into v_ids
    from jsonb_array_elements(v_rows) r where not (r->>'rest')::boolean;
    if p_style = 'ladder' then
      for k in 1..v_courts loop
        v_out := v_out || jsonb_build_array(jsonb_build_object('court_number', k, 'match_number', 1,
          'side_a', jsonb_build_array(v_ids[4*k - 3], v_ids[4*k - 2]),
          'side_b', jsonb_build_array(v_ids[4*k - 1], v_ids[4*k])));
      end loop;
    else
      v_out := _build_fours_arrangement(v_ids::uuid[]);
    end if;
  end if;

  return jsonb_build_object('arrangement', v_out, 'rests', v_rest);
end; $$;
revoke execute on function _engine_place(text, text, int, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The client's Americano input
-- ---------------------------------------------------------------------------------------------
create or replace function event_engine_roster(p_event_id uuid)
returns table (participant_id uuid, gender text, team_id uuid, team_number int)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from events e where e.id = p_event_id and e.deleted_at is null
                   and e.organizer_id = auth.uid()) then
    raise exception 'forbidden' using errcode='P0001'; end if;
  return query
    select ep.id, coalesce(pr.gender, ep.guest_gender), t.id, t.team_number
    from event_participants ep
    left join profiles pr on pr.id = ep.user_id
    left join event_teams t on t.event_id = p_event_id and t.is_confirmed
                           and ep.id in (t.player_a_id, t.player_b_id)
    where ep.event_id = p_event_id and ep.status = 'confirmed'
    order by ep.joined_at, ep.id;
end; $$;
revoke execute on function event_engine_roster(uuid) from public, anon;
grant execute on function event_engine_roster(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- _validate_rounds (0122 body) + the modality's pair rule
-- ---------------------------------------------------------------------------------------------
-- NEW: is this side (a 2-element jsonb array of ids) a legal pair for the event's modality?
create or replace function _engine_side_ok(p_event_id uuid, p_mode text, p_side jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_mode
    when 'team' then exists (
      select 1 from event_teams t
      where t.event_id = p_event_id and t.is_confirmed
        and ((t.player_a_id::text = p_side->>0 and t.player_b_id::text = p_side->>1)
          or (t.player_a_id::text = p_side->>1 and t.player_b_id::text = p_side->>0)))
    when 'mixed' then (
      select count(*) filter (where g = 'male') = 1 and count(*) filter (where g = 'female') = 1
      from (select coalesce(pr.gender, ep.guest_gender) as g
            from jsonb_array_elements_text(p_side) x
            join event_participants ep on ep.id::text = x and ep.event_id = p_event_id
            left join profiles pr on pr.id = ep.user_id) s)
    else true end;
$$;
revoke execute on function _engine_side_ok(uuid, text, jsonb) from public, anon, authenticated;

create or replace function _validate_rounds(p_event_id uuid, p_rounds jsonb) returns void
language plpgsql stable security definer set search_path = public as $$
declare v_courts int; v_round jsonb; v_match jsonb; v_ids text[]; v_rests text[];
        v_mode text := _engine_mode(p_event_id);                                        -- NEW
begin
  select num_courts into v_courts from events where id = p_event_id;
  for v_round in select * from jsonb_array_elements(p_rounds) loop
    if jsonb_typeof(v_round) <> 'object' or (v_round->>'round_number') is null
       or jsonb_typeof(coalesce(v_round->'matches', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(v_round->'rests', '[]'::jsonb)) <> 'array' then
      raise exception 'invalid_rounds' using errcode='P0001'; end if;
    v_rests := array(select jsonb_array_elements_text(coalesce(v_round->'rests', '[]'::jsonb)));
    v_ids := v_rests;
    for v_match in select * from jsonb_array_elements(coalesce(v_round->'matches', '[]'::jsonb)) loop
      if jsonb_typeof(v_match->'side_a') is distinct from 'array' or jsonb_typeof(v_match->'side_b') is distinct from 'array'
         or jsonb_array_length(v_match->'side_a') <> 2 or jsonb_array_length(v_match->'side_b') <> 2
         or coalesce((v_match->>'court_number')::int, 0) not between 1 and v_courts then
        raise exception 'invalid_rounds' using errcode='P0001'; end if;
      -- NEW: a team event plays its pairs, a mixed event a man and a woman a side.
      if not _engine_side_ok(p_event_id, v_mode, v_match->'side_a')
         or not _engine_side_ok(p_event_id, v_mode, v_match->'side_b') then
        raise exception 'invalid_rounds' using errcode='P0001'; end if;
      v_ids := v_ids || array(select jsonb_array_elements_text(v_match->'side_a'))
                     || array(select jsonb_array_elements_text(v_match->'side_b'));
    end loop;
    -- nobody twice in one round (on two courts, or playing and resting)
    if cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x) then
      raise exception 'invalid_rounds' using errcode='P0001'; end if;
    if exists (select 1 from unnest(v_ids) x
               where x !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  or not exists (select 1 from event_participants ep
                                 where ep.id = x::uuid and ep.event_id = p_event_id and ep.status = 'confirmed')) then
      raise exception 'invalid_participant' using errcode='P0001'; end if;
  end loop;
end; $$;
revoke execute on function _validate_rounds(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- start_event (0122 body): round 1 by unit
-- ---------------------------------------------------------------------------------------------
create or replace function start_event(p_event_id uuid, p_rounds jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_ev events%rowtype;
  v_round_id uuid;
  v_round jsonb;
  v_rest_pid text;
  v_rn int;
  v_blockers text[];
  v_units jsonb;                                                                      -- NEW
  v_placed jsonb;                                                                     -- NEW
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'event_not_scheduled' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('event:'||p_event_id::text, 0));
  select * into v_ev from events where id = p_event_id;
  if v_ev.deleted_at is not null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'event_not_scheduled' using errcode='P0001'; end if;

  v_blockers := _start_blockers(p_event_id);
  if cardinality(v_blockers) > 0 then
    raise exception '%', v_blockers[1] using errcode='P0001'; end if;

  update events set status = 'in_progress' where id = p_event_id;

  if p_rounds is not null and jsonb_typeof(p_rounds) = 'array' then
    perform _validate_rounds(p_event_id, p_rounds);
    for v_round in select * from jsonb_array_elements(p_rounds) loop
      v_rn := (v_round->>'round_number')::int;
      insert into event_rounds (event_id, round_number, status, generated_at)
      values (p_event_id, v_rn,
              case when v_rn = 1 then 'active' else 'pending' end, now())
      returning id into v_round_id;
      perform _persist_round_matches(p_event_id, v_round_id, v_round->'matches');
      for v_rest_pid in select * from jsonb_array_elements_text(coalesce(v_round->'rests','[]'::jsonb)) loop
        insert into round_rest (round_id, participant_id) values (v_round_id, v_rest_pid::uuid);
      end loop;
    end loop;
    return;
  end if;

  -- NEW: seeded by unit — stand-by last, then the group ranking (a team: its players' sum) on a
  -- group event, random on a standalone one; join order breaks ties. The tail rests.
  select coalesce(jsonb_agg(jsonb_build_object('players', to_jsonb(q.players), 'pool', q.pool,
                                               'ord', q.ord, 'rest_ord', -q.ord)), '[]'::jsonb)
    into v_units
  from (
    select u.players, u.pool,
           row_number() over (order by u.is_standby,
                                       coalesce(gp.pts, 0) desc,
                                       case when v_ev.group_id is null then random() end,
                                       u.joined_at, u.unit_id) as ord
    from _engine_units(p_event_id) u
    left join lateral (
      select sum(ger.ranking_points) as pts
      from group_event_results ger
      join group_seasons gs on gs.id = ger.group_season_id
      where v_ev.group_id is not null and gs.group_id = v_ev.group_id and gs.ended_at is null
        and ger.user_id = any(u.user_ids)
    ) gp on true
  ) q;

  v_placed := _engine_place(_engine_mode(p_event_id), 'mexicano', v_ev.num_courts, v_units);

  insert into event_rounds (event_id, round_number, status, generated_at)
  values (p_event_id, 1, 'active', now())
  returning id into v_round_id;

  perform _persist_round_matches(p_event_id, v_round_id, v_placed->'arrangement');

  insert into round_rest (round_id, participant_id)
  select v_round_id, x::uuid from jsonb_array_elements_text(v_placed->'rests') x;
end; $$;

-- ---------------------------------------------------------------------------------------------
-- generate_next_round (0122 body): by unit, and Up & Down rotates its rests
-- ---------------------------------------------------------------------------------------------
create or replace function generate_next_round(p_event_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_ev events%rowtype;
  v_prev_round_id uuid;
  v_prev_rn int;
  v_new_round_id uuid;
  v_prev_courts int;                                                                  -- NEW
  v_units jsonb;                                                                      -- NEW
  v_placed jsonb;                                                                     -- NEW
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.event_type = 'americano' then raise exception 'not_applicable' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event:'||p_event_id::text, 0));

  select id, round_number into v_prev_round_id, v_prev_rn
    from event_rounds where event_id = p_event_id
    order by round_number desc limit 1;
  if v_prev_round_id is null then raise exception 'no_current_round' using errcode='P0001'; end if;
  if exists (select 1 from event_matches m where m.round_id = v_prev_round_id and m.status = 'pending') then
    raise exception 'round_not_scored' using errcode='P0001';
  end if;

  if v_ev.event_type = 'mexicano' then
    -- Ranked by the event standings (a team event ranks teams, 0125); fewest rests rest first.
    select coalesce(jsonb_agg(jsonb_build_object('players', to_jsonb(q.players), 'pool', q.pool,
                                                 'ord', q.ord, 'rest_ord', q.rest_ord)), '[]'::jsonb)
      into v_units
    from (
      select u.players, u.pool,
             row_number() over (order by coalesce(s.rank, 2147483647), u.team_number, u.joined_at, u.unit_id) as ord,
             row_number() over (order by u.rests, u.team_number, u.joined_at, u.unit_id) as rest_ord
      from _engine_units(p_event_id) u
      left join standings(p_event_id) s on s.entity_id = u.unit_id
    ) q;
    v_placed := _engine_place(_engine_mode(p_event_id), 'mexicano', v_ev.num_courts, v_units);

  elsif v_ev.event_type = 'up_and_down' then
    -- Winners of court K go to K - 1, losers to K + 1; the winners of court 1 and the losers of the
    -- last court stay. Units that did not play last round rejoin at the middle court. Court order:
    -- target court, then the court they came from, winners first — so the pair that moved together
    -- stays together (side a: the pair from the court above, side b: the pair from below).
    select count(*) into v_prev_courts from event_matches where round_id = v_prev_round_id;
    select coalesce(jsonb_agg(jsonb_build_object('players', to_jsonb(q.players), 'pool', q.pool,
                                                 'ord', q.ord, 'rest_ord', q.rest_ord)), '[]'::jsonb)
      into v_units
    from (
      select u.players, u.pool,
             row_number() over (order by
               case when pl.court is null then greatest(1, (v_prev_courts + 1) / 2)
                    when pl.won then greatest(pl.court - 1, 1)
                    else least(pl.court + 1, v_prev_courts) end,
               coalesce(pl.court, 2147483647),
               case when pl.court is null then 2 when pl.won then 0 else 1 end,
               u.team_number, u.joined_at, u.unit_id) as ord,
             row_number() over (order by u.rests, u.team_number, u.joined_at, u.unit_id) as rest_ord
      from _engine_units(p_event_id) u
      left join lateral (
        select min(m.court_number) as court,
               bool_or(mp.side = case when coalesce(m.side_a_score, 0) >= coalesce(m.side_b_score, 0)
                                      then 'a' else 'b' end) as won
        from match_players mp join event_matches m on m.id = mp.match_id
        where m.round_id = v_prev_round_id and mp.participant_id = any(u.players)
      ) pl on true
    ) q;
    v_placed := _engine_place(_engine_mode(p_event_id), 'ladder', v_ev.num_courts, v_units);

  else
    raise exception 'not_applicable' using errcode='P0001';
  end if;

  update event_rounds set status = 'completed' where id = v_prev_round_id;

  insert into event_rounds (event_id, round_number, status, generated_at)
  values (p_event_id, v_prev_rn + 1, 'active', now())
  returning id into v_new_round_id;

  perform _persist_round_matches(p_event_id, v_new_round_id, v_placed->'arrangement');

  insert into round_rest (round_id, participant_id)
  select v_new_round_id, x::uuid from jsonb_array_elements_text(v_placed->'rests') x;

  return v_new_round_id;
end; $$;

commit;
