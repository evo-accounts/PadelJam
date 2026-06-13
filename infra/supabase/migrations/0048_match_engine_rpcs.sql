-- 0048_match_engine_rpcs.sql
-- Events module Phase 2: the in-progress match engine.
-- start_event / persist_round / generate_next_round / submit_score / finish_event / set_event_ranking
-- plus a private internal helper to persist one round's matches from an ordered arrangement.

-- ----------------------------------------------------------------------------
-- _persist_round_matches(p_event_id, p_round_id, p_arrangement jsonb)
-- arrangement: [{court_number, match_number, court_id?, side_a:[pid,pid], side_b:[pid,pid]}]
-- Inserts event_matches (status 'pending') + match_players (side a/b). Returns void.
-- ----------------------------------------------------------------------------
create or replace function _persist_round_matches(p_event_id uuid, p_round_id uuid, p_arrangement jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_match jsonb; v_match_id uuid; v_pid text;
begin
  for v_match in select * from jsonb_array_elements(coalesce(p_arrangement, '[]'::jsonb)) loop
    insert into event_matches (event_id, round_id, court_id, court_number, match_number, status)
    values (p_event_id, p_round_id,
            nullif(v_match->>'court_id','')::uuid,
            (v_match->>'court_number')::int,
            coalesce((v_match->>'match_number')::int, 1),
            'pending')
    returning id into v_match_id;
    for v_pid in select * from jsonb_array_elements_text(v_match->'side_a') loop
      insert into match_players (match_id, participant_id, side) values (v_match_id, v_pid::uuid, 'a');
    end loop;
    for v_pid in select * from jsonb_array_elements_text(v_match->'side_b') loop
      insert into match_players (match_id, participant_id, side) values (v_match_id, v_pid::uuid, 'b');
    end loop;
  end loop;
end; $$;

-- ----------------------------------------------------------------------------
-- _build_fours_arrangement(ordered participant_id array) -> arrangement jsonb
-- Groups an ordered list into consecutive fours; for the k-th four [a,b,c,d]:
--   side_a = {a,d}, side_b = {b,c}, court_number = k, match_number = 1.
-- Trailing participants that do not complete a four are ignored (rested upstream).
-- ----------------------------------------------------------------------------
create or replace function _build_fours_arrangement(p_ordered uuid[])
returns jsonb language plpgsql immutable as $$
declare v_out jsonb := '[]'::jsonb; v_courts int; k int; a uuid; b uuid; c uuid; d uuid;
begin
  v_courts := array_length(p_ordered, 1) / 4;
  if v_courts is null then return v_out; end if;
  for k in 1..v_courts loop
    a := p_ordered[(k-1)*4 + 1];
    b := p_ordered[(k-1)*4 + 2];
    c := p_ordered[(k-1)*4 + 3];
    d := p_ordered[(k-1)*4 + 4];
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'court_number', k, 'match_number', 1,
      'side_a', jsonb_build_array(a::text, d::text),
      'side_b', jsonb_build_array(b::text, c::text)));
  end loop;
  return v_out;
end; $$;

-- ----------------------------------------------------------------------------
-- submit_score (verbatim per spec)
-- ----------------------------------------------------------------------------
create or replace function submit_score(p_match_id uuid, p_side_a int, p_side_b int, p_not_played boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_m event_matches%rowtype; v_ev events%rowtype;
        v_is_org boolean; v_is_player boolean;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended('match:'||p_match_id::text, 0));
  select * into v_m from event_matches where id=p_match_id;
  if v_m.id is null then raise exception 'match_not_found' using errcode='P0001'; end if;
  select * into v_ev from events where id=v_m.event_id;
  v_is_org := (v_ev.organizer_id = v_user);
  v_is_player := exists (select 1 from match_players mp join event_participants p on p.id=mp.participant_id
                  where mp.match_id=p_match_id and p.user_id=v_user);
  if not v_is_org then
    if not v_ev.players_submit_results or not v_is_player then raise exception 'forbidden' using errcode='P0001'; end if;
    if v_m.submitted_by is not null then raise exception 'score_locked' using errcode='P0001'; end if;
  end if;
  update event_matches set
     side_a_score = case when p_not_played then 0 else p_side_a end,
     side_b_score = case when p_not_played then 0 else p_side_b end,
     status = case when p_not_played then 'not_played' else 'played' end,
     submitted_by = coalesce(submitted_by, v_user), submitted_at = now()
   where id = p_match_id;
  update event_rounds r set status='completed'
   where r.id=v_m.round_id and not exists (select 1 from event_matches m where m.round_id=r.id and m.status='pending');
end; $$;

-- ----------------------------------------------------------------------------
-- start_event(p_event_id, p_rounds jsonb default null)
-- ----------------------------------------------------------------------------
create or replace function start_event(p_event_id uuid, p_rounds jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_ev events%rowtype;
  v_confirmed int;
  v_teams int;
  v_play int;
  v_ordered uuid[];
  v_rest uuid[];
  v_round_id uuid;
  v_round jsonb;
  v_rest_pid text;
  v_rn int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'event_not_scheduled' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event:'||p_event_id::text, 0));

  select count(*) into v_confirmed from event_participants
    where event_id = p_event_id and status = 'confirmed';
  if v_confirmed < v_ev.num_courts * 4 then raise exception 'setup_incomplete' using errcode='P0001'; end if;
  if v_ev.specification = 'team' then
    select count(*) into v_teams from event_teams where event_id = p_event_id and is_confirmed;
    if v_teams < v_ev.num_courts * 2 then raise exception 'setup_incomplete' using errcode='P0001'; end if;
  end if;

  update events set status = 'in_progress' where id = p_event_id;

  if p_rounds is not null and jsonb_typeof(p_rounds) = 'array' then
    -- Client-built schedule (Americano / Up&Down bootstrapped client-side).
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

  -- Server-side bootstrap of ROUND 1 (Mexicano, or any type without a client schedule).
  -- Seed order: non-standby first then standby; within each, by group-ranking
  -- (sum ranking_points desc in the group's OPEN season) when grouped, else random.
  if v_ev.group_id is not null then
    select array_agg(p.id order by p.is_standby asc, coalesce(gr.pts,0) desc, p.joined_at asc)
      into v_ordered
    from event_participants p
    left join (
      select ger.user_id, sum(ger.ranking_points) pts
      from group_event_results ger
      join group_seasons gs on gs.id = ger.group_season_id
      where gs.group_id = v_ev.group_id and gs.ended_at is null
      group by ger.user_id
    ) gr on gr.user_id = p.user_id
    where p.event_id = p_event_id and p.status = 'confirmed';
  else
    select array_agg(p.id order by p.is_standby asc, random())
      into v_ordered
    from event_participants p
    where p.event_id = p_event_id and p.status = 'confirmed';
  end if;

  -- Playing set = largest multiple of 4 that fits courts and confirmed count.
  v_play := least(v_ev.num_courts * 4, (array_length(v_ordered,1) / 4) * 4);
  -- Tail rests this round.
  if array_length(v_ordered,1) > v_play then
    v_rest := v_ordered[v_play+1 : array_length(v_ordered,1)];
  end if;

  insert into event_rounds (event_id, round_number, status, generated_at)
  values (p_event_id, 1, 'active', now())
  returning id into v_round_id;

  perform _persist_round_matches(p_event_id, v_round_id,
    _build_fours_arrangement((v_ordered)[1:v_play]));

  if v_rest is not null then
    insert into round_rest (round_id, participant_id)
    select v_round_id, unnest(v_rest);
  end if;
end; $$;

-- ----------------------------------------------------------------------------
-- persist_round(p_payload jsonb) -> uuid
-- ----------------------------------------------------------------------------
create or replace function persist_round(p_payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_event uuid := (p_payload->>'event_id')::uuid;
  v_round_id uuid;
  v_rn int := (p_payload->>'round_number')::int;
  v_status text := coalesce(p_payload->>'status', 'active');
  v_pid text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;

  -- Validate every referenced participant belongs to this event.
  perform 1 from (
    select pid from jsonb_array_elements(coalesce(p_payload->'matches','[]'::jsonb)) m,
      lateral (
        select jsonb_array_elements_text(m->'side_a') pid
        union all select jsonb_array_elements_text(m->'side_b')
      ) s
    union all
    select pid from jsonb_array_elements_text(coalesce(p_payload->'rests','[]'::jsonb)) pid
  ) all_pids
  where not exists (
    select 1 from event_participants ep where ep.event_id = v_event and ep.id = all_pids.pid::uuid
  );
  if found then raise exception 'invalid_participant' using errcode='P0001'; end if;

  begin
    insert into event_rounds (event_id, round_number, status, generated_at)
    values (v_event, v_rn, v_status, now())
    returning id into v_round_id;
  exception when unique_violation then
    raise exception 'round_exists' using errcode='P0001';
  end;

  perform _persist_round_matches(v_event, v_round_id, p_payload->'matches');
  for v_pid in select * from jsonb_array_elements_text(coalesce(p_payload->'rests','[]'::jsonb)) loop
    insert into round_rest (round_id, participant_id) values (v_round_id, v_pid::uuid);
  end loop;

  return v_round_id;
end; $$;

-- ----------------------------------------------------------------------------
-- generate_next_round(p_event_id) -> uuid
-- ----------------------------------------------------------------------------
create or replace function generate_next_round(p_event_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_ev events%rowtype;
  v_prev_round_id uuid;
  v_prev_rn int;
  v_play int;
  v_ordered uuid[];        -- standings-ranked playing participants (Mexicano)
  v_rest uuid[];
  v_arrangement jsonb;
  v_new_round_id uuid;
  v_courts int;
  k int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.event_type = 'americano' then raise exception 'not_applicable' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event:'||p_event_id::text, 0));

  -- Current (max) round + gate: every match scored.
  select id, round_number into v_prev_round_id, v_prev_rn
    from event_rounds where event_id = p_event_id
    order by round_number desc limit 1;
  if v_prev_round_id is null then raise exception 'no_current_round' using errcode='P0001'; end if;
  if exists (select 1 from event_matches m where m.round_id = v_prev_round_id and m.status = 'pending') then
    raise exception 'round_not_scored' using errcode='P0001';
  end if;

  -- Resting pool: participants who have NOT been resting / equal rotation.
  -- Compute who plays this round below; v_play is the count of playing slots.
  v_play := v_ev.num_courts * 4;

  if v_ev.event_type = 'mexicano' then
    -- Choose playing set by equal-rotation resting if there is a surplus.
    -- Participants ordered by standings rank; resting picked from those with
    -- the FEWEST prior round_rest appearances (tie-break joined_at).
    with confirmed as (
      select p.id, p.joined_at,
             coalesce(s.rank, 2147483647) as rnk,
             (select count(*) from round_rest rr join event_rounds er on er.id = rr.round_id
               where er.event_id = p_event_id and rr.participant_id = p.id) as rests
      from event_participants p
      left join standings(p_event_id) s on s.entity_id = p.id
      where p.event_id = p_event_id and p.status = 'confirmed'
    ),
    surplus as (
      -- rest the surplus = total - v_play, choosing those who rested least
      select id from confirmed
      order by rests asc, joined_at asc
      limit greatest((select count(*) from confirmed) - v_play, 0)
    )
    select
      (select array_agg(id order by rnk asc, joined_at asc)
         from confirmed where id not in (select id from surplus)),
      (select array_agg(id) from confirmed where id in (select id from surplus))
    into v_ordered, v_rest;

    v_arrangement := _build_fours_arrangement(v_ordered);

  elsif v_ev.event_type = 'up_and_down' then
    -- Up & Down: courts shuffle by result. For each court in the previous round,
    -- the winning pair moves UP (toward court 1), the losing pair moves DOWN
    -- (toward court N). Court 1 winners stay; bottom court losers stay.
    -- Within each next court the down-comers face the up-comers.
    declare
      v_n int;
      r record;
      v_winners uuid[];
      v_losers uuid[];
      -- per next-court accumulation of pairs arriving
      v_down jsonb := '{}'::jsonb;  -- court_number(text) -> array of pids (came down)
      v_up jsonb := '{}'::jsonb;    -- court_number(text) -> array of pids (came up)
      v_stay jsonb := '{}'::jsonb;  -- court_number(text) -> array of pids (stayed)
      v_cn int;
      v_dest int;
      v_a jsonb; v_b jsonb;
    begin
      select count(*) into v_n from event_matches where round_id = v_prev_round_id;
      v_courts := v_n;
      for r in
        select m.court_number,
               case when coalesce(m.side_a_score,0) >= coalesce(m.side_b_score,0) then 'a' else 'b' end as win_side
        from event_matches m where m.round_id = v_prev_round_id
        order by m.court_number
      loop
        select array_agg(mp.participant_id) into v_winners
          from match_players mp join event_matches m on m.id = mp.match_id
          where m.round_id = v_prev_round_id and m.court_number = r.court_number and mp.side = r.win_side;
        select array_agg(mp.participant_id) into v_losers
          from match_players mp join event_matches m on m.id = mp.match_id
          where m.round_id = v_prev_round_id and m.court_number = r.court_number and mp.side <> r.win_side;

        -- winners move up (court K -> K-1); court 1 winners stay on court 1.
        if r.court_number = 1 then
          v_stay := jsonb_set(v_stay, array['1'],
            coalesce(v_stay->'1','[]'::jsonb) || to_jsonb(v_winners));
        else
          v_dest := r.court_number - 1;
          v_up := jsonb_set(v_up, array[v_dest::text],
            coalesce(v_up->(v_dest::text),'[]'::jsonb) || to_jsonb(v_winners));
        end if;

        -- losers move down (court K -> K+1); bottom court losers stay.
        if r.court_number = v_courts then
          v_stay := jsonb_set(v_stay, array[v_courts::text],
            coalesce(v_stay->(v_courts::text),'[]'::jsonb) || to_jsonb(v_losers));
        else
          v_dest := r.court_number + 1;
          v_down := jsonb_set(v_down, array[v_dest::text],
            coalesce(v_down->(v_dest::text),'[]'::jsonb) || to_jsonb(v_losers));
        end if;
      end loop;

      -- Build arrangement per next court: pair down-comers (side a) vs up-comers (side b);
      -- stayers fill in (top/bottom courts). Ensure each court ends with 2 vs 2.
      v_arrangement := '[]'::jsonb;
      for v_cn in 1..v_courts loop
        v_a := (coalesce(v_down->(v_cn::text),'[]'::jsonb)) || (coalesce(v_stay->(v_cn::text),'[]'::jsonb));
        v_b := coalesce(v_up->(v_cn::text),'[]'::jsonb);
        -- If a side has fewer than 2, rebalance from the other side so each holds 2.
        while jsonb_array_length(v_a) < 2 and jsonb_array_length(v_b) > 2 loop
          v_a := v_a || jsonb_build_array(v_b->-1);
          v_b := v_b - (jsonb_array_length(v_b) - 1);
        end loop;
        while jsonb_array_length(v_b) < 2 and jsonb_array_length(v_a) > 2 loop
          v_b := v_b || jsonb_build_array(v_a->-1);
          v_a := v_a - (jsonb_array_length(v_a) - 1);
        end loop;
        v_arrangement := v_arrangement || jsonb_build_array(jsonb_build_object(
          'court_number', v_cn, 'match_number', 1,
          'side_a', jsonb_build_array(v_a->0, v_a->1),
          'side_b', jsonb_build_array(v_b->0, v_b->1)));
      end loop;
      -- Up&Down carries the same playing set forward; no rest reshuffle here.
      v_rest := null;
    end;
  else
    raise exception 'not_applicable' using errcode='P0001';
  end if;

  update event_rounds set status = 'completed' where id = v_prev_round_id;

  insert into event_rounds (event_id, round_number, status, generated_at)
  values (p_event_id, v_prev_rn + 1, 'active', now())
  returning id into v_new_round_id;

  perform _persist_round_matches(p_event_id, v_new_round_id, v_arrangement);

  if v_rest is not null then
    insert into round_rest (round_id, participant_id)
    select v_new_round_id, unnest(v_rest);
  end if;

  return v_new_round_id;
end; $$;

-- ----------------------------------------------------------------------------
-- finish_event(p_event_id, p_finish_message, p_counts_override)
-- ----------------------------------------------------------------------------
create or replace function finish_event(p_event_id uuid, p_finish_message text default null, p_counts_override boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_ev events%rowtype;
  v_early boolean;
  v_counts boolean;
  v_season uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event:finish:'||p_event_id::text, 0));

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
      insert into group_event_results (group_season_id, event_id, user_id, final_placement, ranking_points)
      select v_season, p_event_id, p.user_id, s.rank, placement_points(s.rank)
      from standings(p_event_id) s
      join event_participants p on p.id = s.entity_id
      where p.user_id is not null;
    end if;
  end if;
end; $$;

-- ----------------------------------------------------------------------------
-- set_event_ranking(p_event_id, p_enabled)
-- ----------------------------------------------------------------------------
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
  insert into group_event_results (group_season_id, event_id, user_id, final_placement, ranking_points)
  select v_season, p_event_id, p.user_id, s.rank, placement_points(s.rank)
  from standings(p_event_id) s
  join event_participants p on p.id = s.entity_id
  where p.user_id is not null;
end; $$;

grant execute on function _persist_round_matches, _build_fours_arrangement,
  submit_score, start_event, persist_round, generate_next_round, finish_event, set_event_ranking
  to authenticated;
