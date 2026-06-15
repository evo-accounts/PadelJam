-- 0063_partner_request_summary_scope_fix.sql
-- Fix: the event branch of partner_request_summary (added in 0061) scoped to the event
-- organizer, but partner_requests are player-to-player and only the TARGET can act on them
-- (accept_partner_request gates on target_id = auth.uid()). Re-scope the count to partner
-- requests addressed to the caller, so the pinned "Partner Requests" count matches the
-- aggregate list (incoming_partner_requests) and the rows are actually actionable.
create or replace function partner_request_summary() returns integer
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from partner_requests pr
      where pr.target_id = auth.uid() and pr.status = 'pending')
  + (select count(*) from community_join_requests jr
      where jr.status = 'pending'
        and exists (select 1 from community_members cm
                     where cm.community_id = jr.community_id
                       and cm.user_id = auth.uid() and cm.role = 'owner'));
$$;
grant execute on function partner_request_summary() to authenticated;
