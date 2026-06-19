-- A3: server-side activity logging. Recreate event RPCs to append event_activity rows inline
-- (bypass-proof), covering edit/invite/accept/decline plus the organizer roster + team actions
-- previously logged client-side. join/leave remain client-fired via log_event_activity.

-- (a) update_event ---------------------------------------------------------------------------
create or replace function update_event(p_event_id uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype;
        v_allow_standby boolean; v_standby int; v_private boolean; v_standby_have int;
        v_num_courts int; v_confirmed_main int;
        v_date_changed boolean; v_loc_changed boolean; v_changes text[] := '{}';
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'not_editable' using errcode='P0001'; end if;
  if coalesce(btrim(p_payload->>'name'),'') = '' then raise exception 'name_required' using errcode='P0001'; end if;

  v_allow_standby := coalesce((p_payload->>'allow_standby')::boolean, false);
  v_standby := nullif(p_payload->>'standby_spots','')::int;
  v_private := case when v_ev.group_id is null then true
                    else coalesce((p_payload->>'is_private')::boolean, false) end;
  v_num_courts := coalesce((p_payload->>'num_courts')::int, v_ev.num_courts);

  select count(*) into v_standby_have from event_participants where event_id=p_event_id and is_standby;
  if v_standby_have > 0 and (not v_allow_standby or coalesce(v_standby,0) < v_standby_have) then
    raise exception 'standby_below_roster' using errcode='P0001';
  end if;

  select count(*) into v_confirmed_main
    from event_participants where event_id=p_event_id and status='confirmed' and not is_standby;
  if v_num_courts * 4 < v_confirmed_main then
    raise exception 'courts_below_roster' using errcode='P0001';
  end if;

  v_date_changed := (p_payload->>'starts_at')::timestamptz is distinct from v_ev.starts_at;
  v_loc_changed :=
       nullif(p_payload->>'venue_id','')::uuid          is distinct from v_ev.venue_id
    or nullif(p_payload->>'manual_location_name','')    is distinct from v_ev.manual_location_name
    or nullif(p_payload->>'manual_location_address','') is distinct from v_ev.manual_location_address;

  -- A3: which groups changed (compared against the old snapshot v_ev), for the activity log.
  if v_date_changed or (p_payload->>'duration_minutes')::int is distinct from v_ev.duration_minutes then
    v_changes := v_changes || 'date'; end if;
  if v_loc_changed then v_changes := v_changes || 'location'; end if;
  if p_payload->>'scoring_mode' is distinct from v_ev.scoring_mode
     or nullif(p_payload->>'scoring_value','')::int is distinct from v_ev.scoring_value then
    v_changes := v_changes || 'scoring'; end if;
  if coalesce((p_payload->>'allow_standby')::boolean,false) is distinct from v_ev.allow_standby
     or nullif(p_payload->>'standby_spots','')::int is distinct from v_ev.standby_spots
     or v_private is distinct from v_ev.is_private
     or coalesce((p_payload->>'entrance_fee_enabled')::boolean,false) is distinct from v_ev.entrance_fee_enabled
     or nullif(p_payload->>'entrance_fee_amount','')::numeric is distinct from v_ev.entrance_fee_amount
     or nullif(p_payload->>'entrance_fee_method','') is distinct from v_ev.entrance_fee_method
     or coalesce((p_payload->>'players_submit_results')::boolean,false) is distinct from v_ev.players_submit_results
     or p_payload->>'organizer_role' is distinct from v_ev.organizer_role then
    v_changes := v_changes || 'preferences'; end if;
  if btrim(p_payload->>'name') is distinct from v_ev.name
     or p_payload->>'description' is distinct from v_ev.description
     or p_payload->>'thumbnail_path' is distinct from v_ev.thumbnail_path then
    v_changes := v_changes || 'details'; end if;

  update events set
    name                    = btrim(p_payload->>'name'),
    description             = p_payload->>'description',
    thumbnail_path          = p_payload->>'thumbnail_path',
    starts_at               = (p_payload->>'starts_at')::timestamptz,
    duration_minutes        = (p_payload->>'duration_minutes')::int,
    scoring_mode            = p_payload->>'scoring_mode',
    scoring_value           = nullif(p_payload->>'scoring_value','')::int,
    allow_standby           = v_allow_standby,
    standby_spots           = case when v_allow_standby then v_standby else null end,
    is_private              = v_private,
    counts_for_ranking      = case when v_private is distinct from v_ev.is_private
                                  then (v_ev.group_id is not null and not v_private)
                                  else v_ev.counts_for_ranking end,
    entrance_fee_enabled    = coalesce((p_payload->>'entrance_fee_enabled')::boolean, false),
    entrance_fee_amount     = nullif(p_payload->>'entrance_fee_amount','')::numeric,
    entrance_fee_method     = nullif(p_payload->>'entrance_fee_method',''),
    entrance_fee_mba_number = p_payload->>'entrance_fee_mba_number',
    players_submit_results  = coalesce((p_payload->>'players_submit_results')::boolean, false),
    organizer_role          = p_payload->>'organizer_role',
    venue_id                = nullif(p_payload->>'venue_id','')::uuid,
    manual_location_name    = nullif(p_payload->>'manual_location_name',''),
    manual_location_address = nullif(p_payload->>'manual_location_address',''),
    has_location            = coalesce((p_payload->>'has_location')::boolean, false),
    num_courts              = v_num_courts,
    location_point          = case
        when p_payload->>'location_lat' is not null and p_payload->>'location_lng' is not null
        then st_setsrid(st_makepoint((p_payload->>'location_lng')::float8,(p_payload->>'location_lat')::float8),4326)::geography
        else v_ev.location_point end,
    location_text           = coalesce(nullif(p_payload->>'location_text',''), v_ev.location_text)
  where id = p_event_id;

  if v_date_changed or v_loc_changed then
    insert into notifications (user_id, type, actor_id, event_id, actor_name, entity_name)
    select ep.user_id, 'event_updated', v_user, p_event_id,
           (select full_name from profiles where id = v_user), btrim(p_payload->>'name')
    from event_participants ep
    where ep.event_id = p_event_id and ep.status='confirmed'
      and ep.user_id is not null and ep.user_id <> v_user;
  end if;

  -- A3: log the edit (only when at least one tracked group changed).
  if array_length(v_changes,1) is not null then
    insert into event_activity (event_id, actor_id, action, detail)
    values (p_event_id, v_user, 'event_edited', jsonb_build_object('changes', to_jsonb(v_changes)));
  end if;
end; $$;

-- (b) invite_to_event -------------------------------------------------------------------------
create or replace function invite_to_event(p_event_id uuid, p_invitees jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_inv jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if jsonb_typeof(p_invitees) = 'array' then
    for v_inv in select * from jsonb_array_elements(p_invitees) loop
      insert into event_invitations (event_id, invitee_id, invitee_name, invitee_email, invitee_phone, invited_by)
      values (p_event_id, nullif(v_inv->>'invitee_id','')::uuid, v_inv->>'name', v_inv->>'email', v_inv->>'phone', v_user)
      on conflict do nothing;
      if found then
        insert into event_activity (event_id, actor_id, action, detail)
        values (p_event_id, v_user, 'invited',
          jsonb_build_object('target_name',
            coalesce(v_inv->>'name',
                     (select full_name from profiles where id = nullif(v_inv->>'invitee_id','')::uuid))));
      end if;
    end loop;
  end if;
end; $$;

-- (c) accept_event_invitation -----------------------------------------------------------------
create or replace function accept_event_invitation(p_event_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype;
        v_confirmed int; v_cap int; v_status text; v_pos int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from event_invitations where event_id=p_event_id and invitee_id=v_user and status='pending') then
    raise exception 'invitation_not_found' using errcode='P0001'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));

  insert into event_activity (event_id, actor_id, action, detail)
  values (p_event_id, v_user, 'invite_accepted', '{}'::jsonb);

  if v_ev.specification = 'team' then
    insert into event_participants (event_id, user_id, status, joined_at, invited_by)
      values (p_event_id, v_user, 'interested', now(), v_ev.organizer_id)
      on conflict (event_id, user_id) do update set status='interested';
    update event_invitations set status='accepted', responded_at=now()
      where event_id=p_event_id and invitee_id=v_user and status='pending';
    return 'interested';
  end if;

  if exists (select 1 from event_participants where event_id=p_event_id and user_id=v_user) then
    update event_invitations set status='accepted', responded_at=now()
      where event_id=p_event_id and invitee_id=v_user and status='pending';
    return (select status from event_participants where event_id=p_event_id and user_id=v_user);
  end if;

  v_cap := event_capacity(p_event_id);
  select count(*) into v_confirmed from event_participants where event_id=p_event_id and status='confirmed';
  if v_confirmed >= v_cap then
    v_status := 'waiting_list';
    select coalesce(max(waiting_list_position),0)+1 into v_pos from event_participants
      where event_id=p_event_id and status='waiting_list';
  else
    v_status := 'confirmed';
  end if;

  insert into event_participants (event_id, user_id, status, is_standby, waiting_list_position, confirmed_at, joined_at, invited_by)
  values (p_event_id, v_user, v_status,
    case when v_status='confirmed' then (v_confirmed >= v_ev.num_courts*4) else false end,
    case when v_status='waiting_list' then v_pos end,
    case when v_status='confirmed' then now() end, now(), v_ev.organizer_id);

  if not v_ev.is_private and v_ev.group_id is not null then
    insert into community_members (community_id, user_id, role)
      values (event_group_community(p_event_id), v_user, 'member') on conflict do nothing;
    insert into group_members (group_id, user_id) values (v_ev.group_id, v_user) on conflict do nothing;
  end if;
  update event_invitations set status='accepted', responded_at=now()
    where event_id=p_event_id and invitee_id=v_user and status='pending';
  return v_status;
end; $$;

-- (d) decline_event_invitation ----------------------------------------------------------------
create or replace function decline_event_invitation(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update event_invitations set status='declined', responded_at=now()
    where event_id=p_event_id and invitee_id=v_user and status='pending';
  if found then
    insert into event_activity (event_id, actor_id, action, detail)
    values (p_event_id, v_user, 'invite_declined', '{}'::jsonb);
  end if;
end; $$;

-- (e) organizer_mark_confirmed ----------------------------------------------------------------
create or replace function organizer_mark_confirmed(p_participant_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select event_id into v_event from event_participants where id = p_participant_id;
  if v_event is null then raise exception 'participant_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  -- organizer override: no capacity check
  update event_participants set status='confirmed', confirmed_at=now(), waiting_list_position=null
    where id = p_participant_id;
  insert into event_activity (event_id, actor_id, action, detail)
  select v_event, v_user, 'confirmed', jsonb_build_object('target_name', coalesce(p.full_name, ep.guest_name))
  from event_participants ep left join profiles p on p.id = ep.user_id
  where ep.id = p_participant_id;
end; $$;

-- (f) organizer_remove_participant ------------------------------------------------------------
create or replace function organizer_remove_participant(p_participant_id uuid, p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid; v_target_user uuid; v_org uuid; v_target_name text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_mode not in ('to_invited','from_event') then raise exception 'invalid_mode' using errcode='P0001'; end if;
  select event_id, user_id into v_event, v_target_user from event_participants where id = p_participant_id;
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
end; $$;

-- (g) add_manual_participant ------------------------------------------------------------------
create or replace function add_manual_participant(p_event_id uuid, p_name text, p_gender text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_spec text; v_pid uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if coalesce(btrim(p_name),'') = '' then raise exception 'name_required' using errcode='P0001'; end if;
  select specification into v_spec from events where id = p_event_id;
  if v_spec = 'mixed' and p_gender is null then raise exception 'gender_required' using errcode='P0001'; end if;
  insert into event_participants (event_id, guest_name, guest_gender, status, confirmed_at, joined_at, invited_by)
    values (p_event_id, btrim(p_name), p_gender, 'confirmed', now(), now(), v_user)
    returning id into v_pid;
  insert into event_activity (event_id, actor_id, action, detail)
  values (p_event_id, v_user, 'guest_added', jsonb_build_object('guest_name', btrim(p_name)));
  return v_pid;
end; $$;

-- (h) mark_paid -------------------------------------------------------------------------------
create or replace function mark_paid(p_participant_id uuid, p_paid boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select event_id into v_event from event_participants where id = p_participant_id;
  if v_event is null then raise exception 'participant_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  update event_participants set has_paid=p_paid, paid_at = case when p_paid then now() else null end
    where id = p_participant_id;
  insert into event_activity (event_id, actor_id, action, detail)
  select v_event, v_user, case when p_paid then 'marked_paid' else 'marked_unpaid' end,
         jsonb_build_object('target_name', coalesce(p.full_name, ep.guest_name))
  from event_participants ep left join profiles p on p.id = ep.user_id where ep.id = p_participant_id;
end; $$;

-- (i) mark_all_paid ---------------------------------------------------------------------------
create or replace function mark_all_paid(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  update event_participants set has_paid=true, paid_at=now()
    where event_id=p_event_id and has_paid=false;
  insert into event_activity (event_id, actor_id, action, detail)
  values (p_event_id, v_user, 'marked_all_paid', '{}'::jsonb);
end; $$;

-- (j) organizer_assign_to_team ----------------------------------------------------------------
create or replace function organizer_assign_to_team(
  p_event_id uuid, p_participant_id uuid, p_team_number int, p_slot text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_team_id uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.specification <> 'team' then raise exception 'not_a_team_event' using errcode='P0001'; end if;
  if p_slot not in ('a','b') then raise exception 'invalid_slot' using errcode='P0001'; end if;
  if p_team_number < 1 or p_team_number > v_ev.num_courts * 2 then
    raise exception 'invalid_team' using errcode='P0001'; end if;
  if not exists (select 1 from event_participants where id = p_participant_id and event_id = p_event_id) then
    raise exception 'participant_not_found' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));

  perform _clear_team_slot(p_event_id, p_participant_id);

  select id into v_team_id from event_teams where event_id=p_event_id and team_number=p_team_number;
  if v_team_id is null then
    insert into event_teams (event_id, team_number, is_confirmed)
      values (p_event_id, p_team_number, false) returning id into v_team_id;
  end if;

  if p_slot = 'a' then
    update event_teams set player_a_id = p_participant_id where id = v_team_id;
  else
    update event_teams set player_b_id = p_participant_id where id = v_team_id;
  end if;

  perform _reconcile_team(v_team_id);
  insert into event_activity (event_id, actor_id, action, detail)
  select p_event_id, v_user, 'team_assigned',
         jsonb_build_object('target_name', coalesce(p.full_name, ep.guest_name), 'team_number', p_team_number)
  from event_participants ep left join profiles p on p.id = ep.user_id where ep.id = p_participant_id;
end; $$;

-- (k) organizer_remove_from_team --------------------------------------------------------------
create or replace function organizer_remove_from_team(p_event_id uuid, p_participant_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  perform _clear_team_slot(p_event_id, p_participant_id);
  update event_participants
    set status='invited', confirmed_at=null, waiting_list_position=null, is_standby=false
    where id = p_participant_id and event_id = p_event_id;
  insert into event_activity (event_id, actor_id, action, detail)
  select p_event_id, v_user, 'team_removed', jsonb_build_object('target_name', coalesce(p.full_name, ep.guest_name))
  from event_participants ep left join profiles p on p.id = ep.user_id where ep.id = p_participant_id;
end; $$;

-- (l) organizer_switch_players ----------------------------------------------------------------
create or replace function organizer_switch_players(p_event_id uuid, p_a uuid, p_b uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
        a_team uuid; a_slot text; b_team uuid; b_slot text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if p_a = p_b then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));

  select id, case when player_a_id=p_a then 'a' when player_b_id=p_a then 'b' end
    into a_team, a_slot from event_teams
    where event_id=p_event_id and (player_a_id=p_a or player_b_id=p_a);
  select id, case when player_a_id=p_b then 'a' when player_b_id=p_b then 'b' end
    into b_team, b_slot from event_teams
    where event_id=p_event_id and (player_a_id=p_b or player_b_id=p_b);

  -- Same-team swap is a no-op (the pair is unchanged) and the sequential single-slot UPDATEs
  -- would transiently set both slots equal, tripping the et_distinct CHECK. Skip it.
  if a_team is not null and a_team = b_team then return; end if;

  -- write B into A's old slot, A into B's old slot (no-op if that player had no slot)
  if a_team is not null then
    if a_slot='a' then update event_teams set player_a_id=p_b where id=a_team;
    else update event_teams set player_b_id=p_b where id=a_team; end if;
  end if;
  if b_team is not null then
    if b_slot='a' then update event_teams set player_a_id=p_a where id=b_team;
    else update event_teams set player_b_id=p_a where id=b_team; end if;
  end if;

  if a_team is not null then perform _reconcile_team(a_team); end if;
  if b_team is not null and b_team is distinct from a_team then perform _reconcile_team(b_team); end if;

  -- either player now in no slot => invited
  update event_participants
    set status='invited', confirmed_at=null, waiting_list_position=null, is_standby=false
    where id in (p_a, p_b) and event_id=p_event_id
      and not exists (
        select 1 from event_teams
        where event_id=p_event_id
          and (player_a_id=event_participants.id or player_b_id=event_participants.id));

  insert into event_activity (event_id, actor_id, action, detail)
  values (p_event_id, v_user, 'team_switched', '{}'::jsonb);
end; $$;
