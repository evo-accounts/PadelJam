-- Audit spec section 3: three notification types with real emitters, and the JM-08 manual
-- waiting-list promotion. Bodies of leave_event / organizer_remove_participant / finish_event are
-- the current definitions plus the lines marked NEW.

-- 1) Types -----------------------------------------------------------------------------------
alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'event_invite','group_invite','community_invite',
  'community_request_accepted','follow','follow_joined_event','event_cancelled','event_updated',
  'participant_confirmed','waitlist_spot','results_published'));

-- 2) N3: organizer is told when a player becomes confirmed --------------------------------------
create or replace function notify_on_participant_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_actor text; v_name text;
begin
  if NEW.status <> 'confirmed' then return NEW; end if;
  if TG_OP = 'UPDATE' and OLD.status = 'confirmed' then return NEW; end if;
  if NEW.user_id is null then return NEW; end if;                 -- guests are added by the organizer
  select organizer_id, name into v_org, v_name from events where id = NEW.event_id;
  if v_org is null or v_org = NEW.user_id then return NEW; end if; -- organizer playing their own event
  if auth.uid() = v_org then return NEW; end if;               -- the organizer's own action
  -- Service-role writes (seed, admin scripts) carry no JWT: auth.uid() is null and they still notify.
  if notif_blocked(v_org, NEW.user_id) then return NEW; end if;
  select full_name into v_actor from profiles where id = NEW.user_id;
  insert into notifications (user_id, type, actor_id, event_id, actor_name, entity_name)
  values (v_org, 'participant_confirmed', NEW.user_id, NEW.event_id, v_actor, v_name);
  return NEW;
end; $$;
drop trigger if exists trg_notify_on_participant_confirmed on event_participants;
create trigger trg_notify_on_participant_confirmed
  after insert or update of status on event_participants
  for each row execute function notify_on_participant_confirmed();

-- 3) N4: offer a freed confirmed spot to the first waiter (no auto-confirmation, JM-08) ---------
create or replace function notify_waitlist_spot(p_event_id uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_pid uuid; v_uid uuid; v_actor text; v_name text;
begin
  select ep.id, ep.user_id into v_pid, v_uid
    from event_participants ep
    where ep.event_id = p_event_id and ep.status = 'waiting_list' and ep.user_id is not null
    order by ep.waiting_list_position asc, ep.joined_at asc
    limit 1;
  if v_pid is null then return; end if;
  if exists (select 1 from notifications n
              where n.user_id = v_uid and n.event_id = p_event_id and n.type = 'waitlist_spot'
                and n.read_at is null and not n.cta_done) then
    return;  -- an unread, unactioned offer already stands. Once the waiter reads it (mark-all-read included),
             -- the next freed spot produces a fresh offer; that is intended (JM-08: the waiter must act).
  end if;
  if p_actor is not null and notif_blocked(v_uid, p_actor) then return; end if;
  select full_name into v_actor from profiles where id = p_actor;
  select name into v_name from events where id = p_event_id;
  insert into notifications (user_id, type, actor_id, event_id, ref_id, actor_name, entity_name)
  values (v_uid, 'waitlist_spot', p_actor, p_event_id, v_pid, v_actor, v_name);
end; $$;
-- Internal helper: only the RPCs in this migration call it. 0030's default privileges would expose it via PostgREST.
revoke execute on function notify_waitlist_spot(uuid, uuid) from public, anon, authenticated;

create or replace function leave_event(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_pid uuid;
        v_team event_teams%rowtype; v_partner_pid uuid; v_partner_user uuid;
        v_was_confirmed boolean;                                   -- NEW
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if now() > v_ev.starts_at - interval '12 hours' then raise exception 'leave_deadline_passed' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  select id, status = 'confirmed' into v_pid, v_was_confirmed                       -- NEW (status)
    from event_participants where event_id=p_event_id and user_id=v_user;
  if v_pid is null then raise exception 'not_participant' using errcode='P0001'; end if;

  if v_ev.specification = 'team' then
    -- find the team row holding the caller's slot; demote the partner to invited.
    for v_team in select * from event_teams where event_id=p_event_id and (player_a_id=v_pid or player_b_id=v_pid) loop
      if v_team.player_a_id = v_pid then v_partner_pid := v_team.player_b_id;
      else v_partner_pid := v_team.player_a_id; end if;
      update event_teams set
        player_a_id = case when player_a_id=v_pid then null else player_a_id end,
        player_b_id = case when player_b_id=v_pid then null else player_b_id end,
        is_confirmed = false
        where id = v_team.id;
      if v_partner_pid is not null then
        select user_id into v_partner_user from event_participants where id = v_partner_pid;
        delete from event_participants where id = v_partner_pid;
        if v_partner_user is not null then
          update event_teams set
            player_a_id = case when player_a_id=v_partner_pid then null else player_a_id end,
            player_b_id = case when player_b_id=v_partner_pid then null else player_b_id end
            where event_id=p_event_id;
          if exists (select 1 from event_invitations where event_id=p_event_id and invitee_id=v_partner_user) then
            update event_invitations set status='pending', responded_at=null
              where event_id=p_event_id and invitee_id=v_partner_user;
          else
            insert into event_invitations (event_id, invitee_id, status, invited_by)
              values (p_event_id, v_partner_user, 'pending', v_ev.organizer_id);
          end if;
        end if;
      end if;
    end loop;
  end if;

  delete from event_participants where id = v_pid;
  -- JM-08: do NOT auto-promote the waiting list; just renumber to stay contiguous.
  with ranked as (
    select id, row_number() over (order by waiting_list_position, joined_at) as rn
    from event_participants where event_id=p_event_id and status='waiting_list')
  update event_participants ep set waiting_list_position = ranked.rn
    from ranked where ep.id = ranked.id and ep.waiting_list_position <> ranked.rn;
  if v_was_confirmed then perform notify_waitlist_spot(p_event_id, v_user); end if;   -- NEW
end; $$;

create or replace function organizer_remove_participant(p_participant_id uuid, p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid; v_target_user uuid; v_org uuid; v_target_name text;
        v_was_confirmed boolean;                                   -- NEW
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_mode not in ('to_invited','from_event') then raise exception 'invalid_mode' using errcode='P0001'; end if;
  select event_id, user_id, status = 'confirmed' into v_event, v_target_user, v_was_confirmed   -- NEW (status)
    from event_participants where id = p_participant_id;
  if v_event is null then raise exception 'participant_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  select organizer_id into v_org from events where id = v_event;

  select coalesce(p.full_name, ep.guest_name) into v_target_name
    from event_participants ep left join profiles p on p.id = ep.user_id where ep.id = p_participant_id;

  delete from event_participants where id = p_participant_id;
  if p_mode = 'to_invited' then
    if v_target_user is not null then
      if exists (select 1 from event_invitations where event_id=v_event and invitee_id=v_target_user) then
        update event_invitations set status='pending', responded_at=null
          where event_id=v_event and invitee_id=v_target_user;
      else
        insert into event_invitations (event_id, invitee_id, status, invited_by)
          values (v_event, v_target_user, 'pending', v_org);
      end if;
    end if;
  else -- from_event
    if v_target_user is not null then
      delete from event_invitations where event_id=v_event and invitee_id=v_target_user;
    end if;
  end if;
  insert into event_activity (event_id, actor_id, action, detail)
  values (v_event, v_user, 'removed', jsonb_build_object('target_name', v_target_name, 'mode', p_mode));
  if v_was_confirmed then perform notify_waitlist_spot(v_event, v_user); end if;      -- NEW
end; $$;

create or replace function claim_waitlist_spot(p_event_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_pid uuid; v_confirmed int; v_reg int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'event_closed' using errcode='P0001'; end if;
  if now() > v_ev.starts_at - interval '6 hours' then raise exception 'event_closed' using errcode='P0001'; end if;
  if v_ev.specification = 'team' then raise exception 'use_team_join' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  select id into v_pid from event_participants
    where event_id = p_event_id and user_id = v_user and status = 'waiting_list';
  if v_pid is null then raise exception 'not_on_waiting_list' using errcode='P0001'; end if;

  v_reg := v_ev.num_courts * 4;
  select count(*) into v_confirmed from event_participants where event_id = p_event_id and status = 'confirmed';
  if v_confirmed >= event_capacity(p_event_id) then raise exception 'spot_taken' using errcode='P0001'; end if;

  update event_participants set
    status = 'confirmed', is_standby = (v_confirmed >= v_reg),
    waiting_list_position = null, confirmed_at = now()
    where id = v_pid;
  with ranked as (
    select id, row_number() over (order by waiting_list_position, joined_at) as rn
    from event_participants where event_id = p_event_id and status = 'waiting_list')
  update event_participants ep set waiting_list_position = ranked.rn
    from ranked where ep.id = ranked.id and ep.waiting_list_position <> ranked.rn;
  update notifications set cta_done = true, read_at = coalesce(read_at, now())
    where user_id = v_user and event_id = p_event_id and type = 'waitlist_spot' and not cta_done;
  -- Offers are deduplicated per waiter, so a second spot freed while the first offer stood was
  -- never announced. Now that this waiter has moved on, pass any remaining free spot down the list.
  if v_confirmed + 1 < event_capacity(p_event_id) then perform notify_waitlist_spot(p_event_id, null); end if;
  return 'confirmed';
end; $$;
grant execute on function claim_waitlist_spot(uuid) to authenticated;

-- 4) N7: results are out -------------------------------------------------------------------------
create or replace function finish_event(p_event_id uuid, p_finish_message text default null, p_counts_override boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_ev events%rowtype;
  v_early boolean;
  v_counts boolean;
  v_season uuid;
  v_actor text;                                                    -- NEW
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

  -- NEW: every confirmed player with an account, the organizer included when they played.
  -- Guarded so a retried finish does not notify twice.
  if v_ev.status <> 'completed' then
    select full_name into v_actor from profiles where id = v_user;
    insert into notifications (user_id, type, actor_id, event_id, actor_name, entity_name)
    select ep.user_id, 'results_published', v_user, p_event_id, v_actor, v_ev.name
    from event_participants ep
    where ep.event_id = p_event_id and ep.status = 'confirmed' and ep.user_id is not null
      and not notif_blocked(ep.user_id, v_user);
  end if;
end; $$;
