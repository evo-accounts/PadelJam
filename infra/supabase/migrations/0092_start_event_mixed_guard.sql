-- create-event.md line 54: a mixed event pairs one man with one woman, so it cannot start with
-- unequal counts or unknown genders. The check runs BEFORE the capacity check so the organizer
-- sees the gender problem rather than setup_incomplete.
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
  v_men int;
  v_women int;
  v_unknown int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'event_not_scheduled' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event:'||p_event_id::text, 0));

  if v_ev.specification = 'mixed' then
    select
      count(*) filter (where coalesce(pr.gender, ep.guest_gender) = 'male'),
      count(*) filter (where coalesce(pr.gender, ep.guest_gender) = 'female'),
      count(*) filter (where coalesce(pr.gender, ep.guest_gender) is null)
      into v_men, v_women, v_unknown
    from event_participants ep
    left join profiles pr on pr.id = ep.user_id
    where ep.event_id = p_event_id and ep.status = 'confirmed';
    if v_unknown > 0 then raise exception 'mixed_gender_missing' using errcode='P0001'; end if;
    if v_men <> v_women then raise exception 'mixed_unbalanced' using errcode='P0001'; end if;
  end if;

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
