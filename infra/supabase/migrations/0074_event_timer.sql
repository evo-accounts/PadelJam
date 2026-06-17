create table event_timer (
  event_id uuid primary key references events(id) on delete cascade,
  duration_seconds integer not null,
  started_at timestamptz,
  paused_at timestamptz,
  status text not null default 'idle' check (status in ('idle','running','paused')),
  updated_at timestamptz not null default now()
);
alter table event_timer enable row level security;
create policy "event_timer: read" on event_timer for select using (event_is_visible(event_id, auth.uid()));
-- writes only via set_event_timer (SECURITY DEFINER)
alter publication supabase_realtime add table event_timer;

create or replace function set_event_timer(p_event_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_t event_timer%rowtype; v_dur int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if p_action not in ('start','pause','resume','reset') then raise exception 'invalid_action' using errcode='P0001'; end if;

  select * into v_t from event_timer where event_id = p_event_id;
  v_dur := coalesce(v_ev.scoring_value, 0) * 60;  -- time-mode limit (minutes) -> seconds

  if p_action = 'start' then
    insert into event_timer (event_id, duration_seconds, started_at, paused_at, status, updated_at)
    values (p_event_id, v_dur, now(), null, 'running', now())
    on conflict (event_id) do update set duration_seconds = v_dur, started_at = now(),
      paused_at = null, status = 'running', updated_at = now();
  elsif p_action = 'pause' then
    update event_timer set paused_at = now(), status = 'paused', updated_at = now()
      where event_id = p_event_id and status = 'running';
  elsif p_action = 'resume' then
    update event_timer set started_at = started_at + (now() - paused_at), paused_at = null,
      status = 'running', updated_at = now()
      where event_id = p_event_id and status = 'paused';
  else -- reset
    update event_timer set started_at = null, paused_at = null, status = 'idle', updated_at = now()
      where event_id = p_event_id;
  end if;
end; $$;

grant execute on function set_event_timer(uuid, text) to authenticated;
