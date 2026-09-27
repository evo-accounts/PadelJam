-- 0118_partner_request_notification_withdraw.sql
-- UX Audit — Events follow-up (browser pass on main, 2026-09-27): a withdrawn partner request
-- notified its target twice.
--
--   W1  Withdrawing a partner request left its `partner_request` notification behind. 0113's
--       _settle_partner_request_notification marked it read + done on every ending, a withdraw
--       included, so withdraw + re-invite showed the target two notifications for one ask (the
--       stale settled one and the fresh one). A withdraw is a DELETE of a PENDING request —
--       withdraw_partner_request, and the requester's pending asks taken with them by leave_event,
--       organizer_remove_participant and _unpair_waiting_partner (0111/0112). The target never
--       answered it, so an UNREAD notification for it is now deleted: nothing was asked after all.
--       One the target already read is settled as before (it stays in their history, done).
--       Accept, decline and system close (an UPDATE of status) are unchanged: settled, read + done.
--       Deleting a request that was no longer pending (a cascade) settles too, as before.
--   W2  request_partner no longer creates a second UNREAD `partner_request` notification for the
--       same requester → target + event while one stands. 0113's dedupe also required
--       `not cta_done`; now any unread one counts, and it is re-pointed at the live request
--       (ref_id, created_at, cta_done reset) so its Accept / Decline answers the request that exists.
--
-- Re-created: _settle_partner_request_notification (0113 body + the W1 branch), request_partner
-- (0113 body + W2). Triggers unchanged (0113). Latest function definition wins. Hosted: paste after
-- 0117.

begin;

-- W1: settle on answer / system close; on withdraw, delete the notification the target never read.
create or replace function _settle_partner_request_notification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'DELETE' and OLD.status = 'pending' then                                -- NEW (W1)
    delete from notifications
      where type = 'partner_request' and ref_id = OLD.id and read_at is null;
  end if;
  update notifications set cta_done = true, read_at = coalesce(read_at, now())
    where type = 'partner_request' and ref_id = OLD.id and not cta_done;
  return null;
end; $$;
revoke execute on function _settle_partner_request_notification() from public, anon, authenticated;

-- W2: request_partner (0113 body; only the notification block changes).
create or replace function request_partner(p_event_id uuid, p_targets uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_t uuid;
        v_req uuid; v_actor text; v_note uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.specification <> 'team' then raise exception 'not_a_team_event' using errcode='P0001'; end if;
  perform _assert_can_confirm(p_event_id);
  if not _may_enter_team_flow(p_event_id, v_user) then
    raise exception 'forbidden' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  if _is_paired_or_waiting(p_event_id, v_user) then
    raise exception 'already_joined' using errcode='P0001'; end if;
  perform _release_lone_slot(p_event_id, v_user);

  insert into event_participants (event_id, user_id, status, joined_at, invited_by)
    values (p_event_id, v_user, 'interested', now(), v_ev.organizer_id)
    on conflict (event_id, user_id) do update set status='interested';
  update event_invitations set status='accepted', responded_at=now()
    where event_id=p_event_id and invitee_id=v_user and status='pending';

  select full_name into v_actor from profiles where id = v_user;
  foreach v_t in array coalesce(p_targets, '{}'::uuid[]) loop
    if _partner_available(p_event_id, v_user, v_t) then
      v_req := null;
      insert into partner_requests (event_id, requester_id, target_id, status)
        values (p_event_id, v_user, v_t, 'pending')
        on conflict (event_id, requester_id, target_id) do update
          set status = 'pending', responded_at = null, created_at = now(), closed_by_system = false
          where partner_requests.status <> 'pending'
            and (partner_requests.closed_by_system or partner_requests.status = 'accepted')
        returning id into v_req;
      if v_req is not null then
        -- NEW (W2): one unread ask per requester → target + event. An unread one that still
        -- stands (whatever request it pointed at) is re-pointed at this request, not doubled.
        select n.id into v_note from notifications n
          where n.user_id = v_t and n.type = 'partner_request' and n.event_id = p_event_id
            and n.actor_id = v_user and n.read_at is null
          order by n.created_at desc limit 1;
        if v_note is not null then
          update notifications set ref_id = v_req, cta_done = false, created_at = now(),
                                   actor_name = v_actor, entity_name = v_ev.name
            where id = v_note;
        else
          insert into notifications (user_id, type, actor_id, event_id, group_id, ref_id, actor_name, entity_name)
            values (v_t, 'partner_request', v_user, p_event_id, v_ev.group_id, v_req, v_actor, v_ev.name);
        end if;
      end if;
    end if;
  end loop;
end; $$;
revoke execute on function request_partner(uuid, uuid[]) from public, anon, authenticated;
grant execute on function request_partner(uuid, uuid[]) to authenticated;

-- Self-check so a partial paste into the hosted SQL editor cannot silently leave something open.
do $$
begin
  if has_function_privilege('anon', 'public._settle_partner_request_notification()', 'execute')
     or has_function_privilege('authenticated', 'public._settle_partner_request_notification()', 'execute') then
    raise exception '0118: _settle_partner_request_notification executable by anon/authenticated';
  end if;
  if has_function_privilege('anon', 'public.request_partner(uuid, uuid[])', 'execute') then
    raise exception '0118: request_partner executable by anon';
  end if;
  if not has_function_privilege('authenticated', 'public.request_partner(uuid, uuid[])', 'execute') then
    raise exception '0118: request_partner not executable by authenticated';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_settle_partner_request_notification_del'
                   and tgrelid = 'public.partner_requests'::regclass)
     or not exists (select 1 from pg_trigger where tgname = 'trg_settle_partner_request_notification_upd'
                      and tgrelid = 'public.partner_requests'::regclass) then
    raise exception '0118: the 0113 partner_request settle triggers are missing (paste 0113 first)';
  end if;
end $$;

commit;
