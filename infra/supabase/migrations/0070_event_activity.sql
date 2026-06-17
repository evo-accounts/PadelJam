-- JM-40: per-event activity log of roster-core changes. Organizer-only read; writes only via the
-- SECURITY DEFINER log_event_activity RPC (which authorizes organizer-vs-self actions).
create table event_activity (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  actor_id   uuid references profiles(id),
  action     text not null,
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index event_activity_event_idx on event_activity(event_id, created_at desc);

alter table event_activity enable row level security;

create policy "activity: read" on event_activity for select
  using (is_event_organizer(event_id, auth.uid()));
-- No insert/update/delete policy: writes go only through log_event_activity (SECURITY DEFINER).

create or replace function log_event_activity(
  p_event_id uuid, p_action text, p_detail jsonb default '{}'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_organizer_actions text[] := array[
    'confirmed','removed','guest_added','marked_paid','marked_unpaid','marked_all_paid'];
  v_self_actions text[] := array['joined','left'];
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not (p_action = any(v_organizer_actions) or p_action = any(v_self_actions)) then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  if p_action = any(v_organizer_actions) then
    if not is_event_organizer(p_event_id, v_user) then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;
  else
    if not event_is_visible(p_event_id, v_user) then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;
  end if;
  insert into event_activity (event_id, actor_id, action, detail)
  values (p_event_id, v_user, p_action, coalesce(p_detail, '{}'::jsonb));
end; $$;

grant execute on function log_event_activity to authenticated;
