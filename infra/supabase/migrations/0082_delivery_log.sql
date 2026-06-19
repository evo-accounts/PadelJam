-- A4: per-attempt delivery log for outbound blasts (email) + push. Service-role writes (edge functions);
-- organizers read their own blast rows. retry_blast is the organizer-gated retry precondition.
create table delivery_log (
  id              uuid primary key default gen_random_uuid(),
  channel         text not null check (channel in ('email','push')),
  blast_id        uuid references event_blasts(id) on delete cascade,
  notification_id uuid references notifications(id) on delete cascade,
  status          text not null check (status in ('sent','failed')),
  attempt         integer not null default 1,
  sent_count      integer not null default 0,
  failed_count    integer not null default 0,
  error           text,
  created_at      timestamptz not null default now(),
  constraint delivery_target check (
    (channel = 'email' and blast_id is not null and notification_id is null) or
    (channel = 'push'  and notification_id is not null and blast_id is null))
);
create index delivery_log_blast_idx on delivery_log (blast_id, attempt desc);

alter table delivery_log enable row level security;
-- Organizer-only read of email/blast rows; push rows have no user read policy (service-role only).
create policy "delivery_log: organizer reads blast rows" on delivery_log for select
  using (blast_id is not null and exists (
    select 1 from event_blasts b
    where b.id = delivery_log.blast_id and is_event_organizer(b.event_id, auth.uid())));

-- retry_blast: gate a retry of a failed email blast. The resend itself reuses the send-blast invocation.
create or replace function retry_blast(p_blast_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid; v_channels text[]; v_status text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select event_id, channels into v_event, v_channels from event_blasts where id = p_blast_id;
  if v_event is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if not ('email' = any(v_channels)) then raise exception 'not_retryable' using errcode='P0001'; end if;
  select status into v_status from delivery_log
    where blast_id = p_blast_id order by attempt desc limit 1;
  if v_status is null or v_status <> 'failed' then
    raise exception 'not_retryable' using errcode='P0001';
  end if;
end; $$;

grant execute on function retry_blast(uuid) to authenticated;
