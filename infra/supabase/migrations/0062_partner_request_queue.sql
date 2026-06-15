-- 0062_partner_request_queue.sql
-- Aggregate "incoming partner requests" for the pinned Notifications row: pending
-- event partner_requests for events I organize + pending community join requests for
-- communities I own. (Phase 2B)
create or replace function incoming_partner_requests()
returns table (
  kind             text,
  request_id       uuid,
  entity_id        uuid,
  entity_name      text,
  requester_id     uuid,
  requester_name   text,
  requester_avatar text,
  created_at       timestamptz
)
language sql stable security definer set search_path = public as $$
  select 'event'::text, pr.id, e.id, e.name, p.id, p.full_name, p.avatar_url, pr.created_at
  from partner_requests pr
  join events e   on e.id = pr.event_id
  join profiles p on p.id = pr.requester_id
  where e.organizer_id = auth.uid() and pr.status = 'pending'
  union all
  select 'community'::text, jr.id, c.id, c.name, p.id, p.full_name, p.avatar_url, jr.created_at
  from community_join_requests jr
  join communities c on c.id = jr.community_id
  join profiles p    on p.id = jr.user_id
  where jr.status = 'pending'
    and exists (select 1 from community_members cm
                 where cm.community_id = jr.community_id
                   and cm.user_id = auth.uid() and cm.role = 'owner')
  order by created_at desc;
$$;
grant execute on function incoming_partner_requests() to authenticated;
