-- 0113_event_guests.sql
-- UX Audit — Events, plan PR 3 (docs/audit/2026-09-25-ux-events-plan.md): decision 7, B12, and the
-- manual-venue court names that moved here from plan PR 4 (the venue registry part stays in 0114).
--
--   D7  Guest players: a name (and a gender on mixed events), confirmed for THIS event only, no
--       account, no history, no ranking, never reused. Two ways in:
--         create_event            the organizer lists them in the wizard (UX-CEVT-11) as
--                                 `guests: [{name, gender}]` → confirmed guest event_participants.
--                                 A mixed event's guest needs a gender (guest_gender_required — its
--                                 own code, not the caller's profile gender_required).
--                                 Creation fails loudly: a guest beyond capacity raises event_full,
--                                 beyond a mixed event's half gender_full (0112's per-gender rule).
--         choose_guest_partner    a player pairs with someone not on the app (UX-JEVT-10). Same gates
--                                 as choose_partner (0112); the pair is confirmed, or waits together
--                                 as a 0112 waiting pair when there are not two free spots or anyone
--                                 is already waiting. When the player leaves, 0112's _drop_partner
--                                 deletes the guest row (user_id null → no invitation reset, no
--                                 notification) — no change needed there. When the player's waiting
--                                 place ends any other way, 0112's _unpair_waiting_partner trigger
--                                 now deletes a guest half instead of making it 'interested'. A
--                                 CONFIRMED guest partner goes with the player when the player's row
--                                 is deleted any other way (organizer removal, account deletion):
--                                 trg_drop_guest_teammate (below).
--       Guest names are trimmed, 1..60 characters (invalid_guest_name).
--   B12 A manual invitee with a name only violated ei_user_or_contact, so create_event failed. The
--       contact-only invitation path is gone: create_event and invite_to_event now ignore invitee
--       entries without an invitee_id (nothing ever delivered those invitations — there is no email
--       or SMS sender for them). People without an account are guests. Existing contact-only rows
--       are left alone; materialize_occurrence / duplicate_event still copy them as before.
--   CEVT-06 events.manual_court_names text[]: optional court names for a manual venue or an event
--       with no location. Length = num_courts, each trimmed 1..40 characters (invalid_court_names);
--       refused with a registry venue. A table check backs it (count, venue, and every name through
--       the IMMUTABLE _court_names_valid), and a trigger clears the names when update_event later
--       changes num_courts or picks a registry venue, so an edit can never trip the check.
--
--   Venues  venues.deleted_at (0039) is now set by the super-admin tool (PR #212). create_event
--       raises venue_not_found for a deleted (or unknown) venue_id; update_event (redefined from 0081)
--       raises it only when the venue CHANGES to one — re-sending an event's current, since-deleted
--       venue must not block editing the rest of the event.
--
--   M5 review  _is_paired_or_waiting (0111) counted any team slot, so a player left alone in one
--       by an organizer team edit (0071's _reconcile_team, status 'invited') could never pair again.
--       It now counts full teams and waiting places only; choose_partner, accept_partner_request
--       (0112 bodies), request_partner and choose_guest_partner release a lone slot first.
--
--   Partner requests  request_partner notifies each target (new type `partner_request`) and
--       answers the caller's own pending invitation; incoming_partner_requests (0098) also returns
--       the event's starts_at and venue / manual location name and address.
--
-- Guests and ranking/history — verified, nothing to change: every group_event_results writer
-- (finish_event 0093:236 and the 0107 backfill) filters `user_id is not null`; standings and the
-- 0109 group ranking read group_event_results; player_badge_facts (0105) is keyed by the user and
-- skips guest partners explicitly; player_recent_results (0102) starts from the user's own rows and
-- only prints a guest's name on the other side. Guests do take part in an event's own placement
-- (they played), they just earn nothing and have no profile to carry it.
--
-- Every redefined function is its latest body (create_event, request_partner, choose_partner,
-- accept_partner_request and _unpair_waiting_partner 0112, _is_paired_or_waiting 0111,
-- incoming_partner_requests 0098, update_event and invite_to_event 0081) plus the lines marked NEW. New error codes:
-- invalid_guest_name, guest_gender_required, invalid_court_names, venue_not_found.

begin;

-- ---------------------------------------------------------------------------------------------
-- Schema: manual court names
-- ---------------------------------------------------------------------------------------------
alter table events add column if not exists manual_court_names text[];
comment on column events.manual_court_names is
  'Court names for a manual venue or no-location event (UX-CEVT-06): one per court, in order. Null with a registry venue (its courts table names them) or when the organizer named none.';

-- Every name present and 1..40 characters once trimmed (create_event stores them trimmed).
create or replace function _court_names_valid(p_names text[]) returns boolean
language sql immutable set search_path = public as $$
  select not exists (select 1 from unnest(p_names) n where n is null or char_length(btrim(n)) not between 1 and 40);
$$;
revoke execute on function _court_names_valid(text[]) from public, anon, authenticated;

alter table events drop constraint if exists events_manual_court_names_ok;
alter table events add constraint events_manual_court_names_ok check (
  manual_court_names is null
  or (venue_id is null and cardinality(manual_court_names) = num_courts
      and _court_names_valid(manual_court_names)));

-- update_event may change num_courts or pick a registry venue; the names no longer fit, so they go.
create or replace function _events_reset_manual_court_names() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.manual_court_names is not null
     and (new.venue_id is not null or cardinality(new.manual_court_names) <> new.num_courts) then
    new.manual_court_names := null;
  end if;
  return new;
end; $$;
revoke execute on function _events_reset_manual_court_names() from public, anon, authenticated;
drop trigger if exists trg_events_reset_manual_court_names on events;
create trigger trg_events_reset_manual_court_names before update of num_courts, venue_id on events
  for each row execute function _events_reset_manual_court_names();

-- ---------------------------------------------------------------------------------------------
-- D7 + B12 + CEVT-06: create_event (0112 body)
-- ---------------------------------------------------------------------------------------------
create or replace function create_event(p_payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_group uuid := nullif(p_payload->>'group_id','')::uuid;
  v_private boolean := coalesce((p_payload->>'is_private')::boolean, false);
  v_spec text := p_payload->>'specification';
  v_org_role text := p_payload->>'organizer_role';
  v_recurring boolean := (p_payload->'series') is not null and (p_payload->'series') <> 'null'::jsonb;
  v_event uuid; v_series uuid; v_cid uuid; v_inv jsonb;
  v_court_names text[]; v_guest jsonb; v_gname text; v_ggender text;                  -- NEW
  v_cap int; v_reg int; v_confirmed int;                                              -- NEW
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if v_group is not null then
    select community_id into v_cid from groups where id = v_group and archived_at is null;
    if v_cid is null then raise exception 'group_not_found' using errcode='P0001'; end if;
    if not may_create_event(v_cid) then raise exception 'forbidden' using errcode='P0001'; end if;
    if (select is_private from groups where id = v_group) and not is_group_member(v_group) then
      raise exception 'forbidden' using errcode='P0001'; end if;
  end if;
  if v_group is null then v_private := true; end if;
  if coalesce(btrim(p_payload->>'name'),'') = '' then raise exception 'name_required' using errcode='P0001'; end if;
  if (p_payload->>'event_type') not in ('americano','mexicano','up_and_down')
     or v_spec not in ('classic','mixed','team')
     or (p_payload->>'scoring_mode') not in ('points','time','classic')
     or v_org_role not in ('organizing_only','organizing_and_playing') then
    raise exception 'invalid_event_config' using errcode='P0001'; end if;

  -- NEW: a registry venue must exist and not be soft-deleted (the super-admin tool deletes them).
  if nullif(p_payload->>'venue_id','') is not null
     and not exists (select 1 from venues where id = (p_payload->>'venue_id')::uuid and deleted_at is null) then
    raise exception 'venue_not_found' using errcode='P0001'; end if;

  -- NEW (CEVT-06): one trimmed name of 1..40 characters per court, only without a registry venue.
  if jsonb_typeof(p_payload->'manual_court_names') = 'array' then
    if nullif(p_payload->>'venue_id','') is not null then
      raise exception 'invalid_court_names' using errcode='P0001'; end if;
    select coalesce(array_agg(btrim(t.n) order by t.ord), '{}') into v_court_names
      from jsonb_array_elements_text(p_payload->'manual_court_names') with ordinality as t(n, ord);
    if cardinality(v_court_names) is distinct from (p_payload->>'num_courts')::int
       or exists (select 1 from unnest(v_court_names) n where n is null or char_length(n) not between 1 and 40) then
      raise exception 'invalid_court_names' using errcode='P0001'; end if;
  elsif coalesce(jsonb_typeof(p_payload->'manual_court_names'), 'null') <> 'null' then
    raise exception 'invalid_court_names' using errcode='P0001';
  end if;

  if v_recurring then
    if v_group is null then raise exception 'series_requires_group' using errcode='P0001'; end if;
    insert into event_series (group_id, organizer_id, day_of_week, start_time, duration_minutes, invite_lead_days)
    values (v_group, v_user, (p_payload->'series'->>'day_of_week')::int,
            (p_payload->'series'->>'start_time')::time, (p_payload->'series'->>'duration_minutes')::int,
            (p_payload->'series'->>'invite_lead_days')::int)
    returning id into v_series;
  end if;

  insert into events (group_id, series_id, organizer_id, event_type, specification, scoring_mode,
    scoring_value, venue_id, manual_location_name, manual_location_address, has_location, num_courts,
    starts_at, duration_minutes, allow_standby, standby_spots, is_private, entrance_fee_enabled,
    entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number, players_submit_results,
    organizer_role, name, description, thumbnail_path, location_point, location_text, counts_for_ranking,
    manual_court_names)                                                               -- NEW
  values (v_group, v_series, v_user, p_payload->>'event_type', v_spec, p_payload->>'scoring_mode',
    nullif(p_payload->>'scoring_value','')::int, nullif(p_payload->>'venue_id','')::uuid,
    p_payload->>'manual_location_name', p_payload->>'manual_location_address',
    coalesce((p_payload->>'has_location')::boolean,false), (p_payload->>'num_courts')::int,
    (p_payload->>'starts_at')::timestamptz, (p_payload->>'duration_minutes')::int,
    coalesce((p_payload->>'allow_standby')::boolean,false), nullif(p_payload->>'standby_spots','')::int,
    v_private, coalesce((p_payload->>'entrance_fee_enabled')::boolean,false),
    nullif(p_payload->>'entrance_fee_amount','')::numeric, nullif(p_payload->>'entrance_fee_method',''),
    p_payload->>'entrance_fee_mba_number', coalesce((p_payload->>'players_submit_results')::boolean,false),
    v_org_role, p_payload->>'name', p_payload->>'description', p_payload->>'thumbnail_path',
    case
        when p_payload->>'location_lat' is not null and p_payload->>'location_lng' is not null
        then st_setsrid(st_makepoint((p_payload->>'location_lng')::float8, (p_payload->>'location_lat')::float8), 4326)::geography
      end,
    nullif(p_payload->>'location_text',''),
    (v_group is not null and v_private = false),
    v_court_names)                                                                    -- NEW
  returning id into v_event;

  if jsonb_typeof(p_payload->'court_ids') = 'array' then
    insert into event_courts (event_id, court_id)
    select v_event, (c)::uuid from jsonb_array_elements_text(p_payload->'court_ids') c on conflict do nothing;
  end if;

  if v_org_role = 'organizing_and_playing' then
    insert into event_participants (event_id, user_id, status, confirmed_at, joined_at)
    values (v_event, v_user, 'confirmed', now(), now());
  end if;

  -- NEW (D7): guests, confirmed for this event only. The organizer is building the roster, so a
  -- guest who does not fit fails the whole creation instead of being waitlisted.
  if jsonb_typeof(p_payload->'guests') = 'array' then
    v_cap := event_capacity(v_event);
    v_reg := (p_payload->>'num_courts')::int * 4;
    for v_guest in select * from jsonb_array_elements(p_payload->'guests') loop
      v_gname := btrim(case when jsonb_typeof(v_guest) = 'object' then v_guest->>'name' end);
      if v_gname is null or char_length(v_gname) not between 1 and 60 then
        raise exception 'invalid_guest_name' using errcode='P0001'; end if;
      v_ggender := null;
      if v_spec = 'mixed' then
        v_ggender := v_guest->>'gender';
        if v_ggender is null or v_ggender not in ('male','female') then
          raise exception 'guest_gender_required' using errcode='P0001'; end if;
      end if;
      select count(*) into v_confirmed from event_participants where event_id = v_event and status = 'confirmed';
      if v_confirmed >= v_cap then raise exception 'event_full' using errcode='P0001'; end if;
      if v_spec = 'mixed' and _mixed_gender_full(v_event, v_ggender) then
        raise exception 'gender_full' using errcode='P0001'; end if;
      insert into event_participants (event_id, guest_name, guest_gender, status, is_standby, confirmed_at, joined_at, invited_by)
      values (v_event, v_gname, v_ggender, 'confirmed', v_confirmed >= v_reg, now(), now(), v_user);
      insert into event_activity (event_id, actor_id, action, detail)
      values (v_event, v_user, 'guest_added', jsonb_build_object('guest_name', v_gname));
    end loop;
  end if;

  if v_group is not null and v_private = false then
    -- D5 (0112): no invitations for a public group event. Members are told the event exists and see Join.
    perform _notify_event_created(v_event);
  else
    if jsonb_typeof(p_payload->'invitees') = 'array' then
      for v_inv in select * from jsonb_array_elements(p_payload->'invitees') loop
        -- NEW (B12): platform users only. An entry without an invitee_id (the old name/email/phone
        -- path) is skipped — people without an account are `guests` now.
        continue when nullif(v_inv->>'invitee_id','') is null;
        insert into event_invitations (event_id, invitee_id, invited_by)
        values (v_event, (v_inv->>'invitee_id')::uuid, v_user);
      end loop;
    end if;
  end if;
  return v_event;
end; $$;
revoke execute on function create_event(jsonb) from public, anon, authenticated;
grant execute on function create_event(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- update_event (0081 body) — a newly picked venue must not be soft-deleted
-- ---------------------------------------------------------------------------------------------
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
  -- NEW (venues are soft-deleted by the super-admin tool, PR #212): a NEWLY picked registry venue must be live. Re-sending the
  -- event's current venue_id is fine even if that venue was deleted since, so the event stays editable.
  if nullif(p_payload->>'venue_id','')::uuid is distinct from v_ev.venue_id
     and nullif(p_payload->>'venue_id','') is not null
     and not exists (select 1 from venues where id = (p_payload->>'venue_id')::uuid and deleted_at is null) then
    raise exception 'venue_not_found' using errcode='P0001'; end if;

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
    v_changes := v_changes || 'date'::text; end if;
  if v_loc_changed then v_changes := v_changes || 'location'::text; end if;
  if p_payload->>'scoring_mode' is distinct from v_ev.scoring_mode
     or nullif(p_payload->>'scoring_value','')::int is distinct from v_ev.scoring_value then
    v_changes := v_changes || 'scoring'::text; end if;
  if coalesce((p_payload->>'allow_standby')::boolean,false) is distinct from v_ev.allow_standby
     or nullif(p_payload->>'standby_spots','')::int is distinct from v_ev.standby_spots
     or v_private is distinct from v_ev.is_private
     or coalesce((p_payload->>'entrance_fee_enabled')::boolean,false) is distinct from v_ev.entrance_fee_enabled
     or nullif(p_payload->>'entrance_fee_amount','')::numeric is distinct from v_ev.entrance_fee_amount
     or nullif(p_payload->>'entrance_fee_method','') is distinct from v_ev.entrance_fee_method
     or coalesce((p_payload->>'players_submit_results')::boolean,false) is distinct from v_ev.players_submit_results
     or p_payload->>'organizer_role' is distinct from v_ev.organizer_role then
    v_changes := v_changes || 'preferences'::text; end if;
  if btrim(p_payload->>'name') is distinct from v_ev.name
     or p_payload->>'description' is distinct from v_ev.description
     or p_payload->>'thumbnail_path' is distinct from v_ev.thumbnail_path then
    v_changes := v_changes || 'details'::text; end if;

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
revoke execute on function update_event(uuid, jsonb) from public, anon, authenticated;
grant execute on function update_event(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- B12: invite_to_event (0081 body) — platform users only
-- ---------------------------------------------------------------------------------------------
-- No app calls this today (packages/api's useInviteToEvent has no caller); its manual branch had the
-- same ei_user_or_contact trap as create_event. Contract for platform users unchanged.
create or replace function invite_to_event(p_event_id uuid, p_invitees jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_inv jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if jsonb_typeof(p_invitees) = 'array' then
    for v_inv in select * from jsonb_array_elements(p_invitees) loop
      continue when nullif(v_inv->>'invitee_id','') is null;                           -- NEW (B12)
      insert into event_invitations (event_id, invitee_id, invited_by)
      values (p_event_id, (v_inv->>'invitee_id')::uuid, v_user)
      on conflict do nothing;
      if found then
        insert into event_activity (event_id, actor_id, action, detail)
        values (p_event_id, v_user, 'invited',
          jsonb_build_object('target_name',
            (select full_name from profiles where id = (v_inv->>'invitee_id')::uuid)));
      end if;
    end loop;
  end if;
end; $$;
revoke execute on function invite_to_event(uuid, jsonb) from public, anon, authenticated;
grant execute on function invite_to_event(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- D7 (UX-JEVT-10): choose_guest_partner — choose_partner (0112) with a new guest as the partner.
-- Returns 'confirmed' | 'waiting_list'. p_gender is optional (team events are never mixed);
-- anything but male/female is stored as null.
-- ---------------------------------------------------------------------------------------------
create or replace function choose_guest_partner(p_event_id uuid, p_name text, p_gender text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype;
        v_name text := btrim(p_name);
        v_gender text := case when p_gender in ('male','female') then p_gender end;
        v_confirmed int; v_cap int; v_caller_pid uuid; v_guest_pid uuid; v_team int;
        v_status text; v_pos int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  perform _assert_can_confirm(p_event_id);
  if v_ev.specification <> 'team' then raise exception 'not_a_team_event' using errcode='P0001'; end if;
  if not _may_enter_team_flow(p_event_id, v_user) then
    raise exception 'forbidden' using errcode='P0001'; end if;
  if v_name is null or char_length(v_name) not between 1 and 60 then
    raise exception 'invalid_guest_name' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  if _is_paired_or_waiting(p_event_id, v_user) then
    raise exception 'already_joined' using errcode='P0001'; end if;
  perform _release_lone_slot(p_event_id, v_user);           -- a lone slot from an organizer team edit

  v_cap := event_capacity(p_event_id);
  select count(*) into v_confirmed from event_participants
    where event_id=p_event_id and status='confirmed' and user_id is distinct from v_user;

  -- As choose_partner: no room for two, or a waiting PAIR already queued → the pair waits together.
  if v_confirmed + 2 > v_cap
     or exists (select 1 from event_participants where event_id=p_event_id and status='waiting_list'
                  and pair_participant_id is not null) then
    -- As choose_partner: never demote a confirmed player (the organizer who plays) into the queue.
    if exists (select 1 from event_participants where event_id=p_event_id
                 and user_id = v_user and status='confirmed') then
      raise exception 'event_full' using errcode='P0001'; end if;
    v_status := 'waiting_list';
    select coalesce(max(waiting_list_position),0) into v_pos from event_participants
      where event_id=p_event_id and status='waiting_list';
    insert into event_participants (event_id, user_id, status, waiting_list_position, joined_at, invited_by)
      values (p_event_id, v_user, 'waiting_list', v_pos + 1, now(), v_ev.organizer_id)
      on conflict (event_id, user_id) do update set status='waiting_list',
        waiting_list_position=excluded.waiting_list_position, confirmed_at=null, is_standby=false
      returning id into v_caller_pid;
    insert into event_participants (event_id, guest_name, guest_gender, status, waiting_list_position, joined_at, invited_by)
      values (p_event_id, v_name, v_gender, 'waiting_list', v_pos + 2, now(), v_user)
      returning id into v_guest_pid;
    update event_participants set pair_participant_id =
      case when id = v_caller_pid then v_guest_pid else v_caller_pid end
      where id in (v_caller_pid, v_guest_pid);
  else
    v_status := 'confirmed';
    insert into event_participants (event_id, user_id, status, confirmed_at, joined_at, invited_by)
      values (p_event_id, v_user, 'confirmed', now(), now(), v_ev.organizer_id)
      on conflict (event_id, user_id) do update set status='confirmed', confirmed_at=now()
      returning id into v_caller_pid;
    insert into event_participants (event_id, guest_name, guest_gender, status, confirmed_at, joined_at, invited_by)
      values (p_event_id, v_name, v_gender, 'confirmed', now(), now(), v_user)
      returning id into v_guest_pid;

    select coalesce(max(team_number),0)+1 into v_team from event_teams where event_id=p_event_id;
    insert into event_teams (event_id, team_number, player_a_id, player_b_id, is_confirmed)
      values (p_event_id, v_team, v_caller_pid, v_guest_pid, true);
  end if;

  update event_invitations set status='accepted', responded_at=now()
    where event_id=p_event_id and invitee_id=v_user and status='pending';
  -- The caller is paired now: every pending request they sent or received is closed by the system.
  update partner_requests set status='declined', responded_at=now(), closed_by_system=true
    where event_id=p_event_id and status='pending' and (requester_id = v_user or target_id = v_user);
  insert into event_activity (event_id, actor_id, action, detail)
  values (p_event_id, v_user, 'guest_added', jsonb_build_object('guest_name', v_name));
  -- As choose_partner: a pair queued behind other pairs while two spots are free is offered them.
  if v_status = 'waiting_list' then perform notify_waitlist_spot(p_event_id, null); end if;
  return v_status;
end; $$;
revoke execute on function choose_guest_partner(uuid, text, text) from public, anon, authenticated;
grant execute on function choose_guest_partner(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- D7: _unpair_waiting_partner (0112 body) — a stranded GUEST half is deleted, not made 'interested'
-- ---------------------------------------------------------------------------------------------
-- 0112 returns the other half of a broken waiting pair to 'interested'. A guest has no account and
-- cannot pair again, so when the player who brought them is removed by the organizer (or confirmed
-- alone, or deletes their account) the guest goes with them. The delete re-fires this trigger for
-- the guest row, whose partner is by then gone or no longer waiting, so it does nothing more.
create or replace function _unpair_waiting_partner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from event_participants                                                      -- NEW (guest half)
    where id = OLD.pair_participant_id and status = 'waiting_list' and user_id is null;
  update event_participants
    set status = 'interested', waiting_list_position = null, pair_participant_id = null
    where id = OLD.pair_participant_id and status = 'waiting_list';
  if TG_OP = 'UPDATE' and NEW.pair_participant_id is not null then
    update event_participants set pair_participant_id = null where id = NEW.id;
  end if;
  perform _renumber_waiting_list(OLD.event_id);
  return null;
end; $$;
revoke execute on function _unpair_waiting_partner() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- M5 review: a lone team-slot occupant can pair again
-- ---------------------------------------------------------------------------------------------
-- _reconcile_team (0071) — reached from organizer_remove_from_team / organizer_switch_players /
-- organizer_assign_to_team — can leave one player alone in an event_teams slot with status
-- 'invited'. _is_paired_or_waiting (0111) counted ANY slot, so that player got already_joined from
-- every pairing RPC forever. Now only a team with BOTH slots filled (or a waiting-list place)
-- counts, and each pairing RPC first releases the caller's (and the partner's) lone slot.

create or replace function _is_paired_or_waiting(p_event_id uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from event_participants ep
    where ep.event_id = p_event_id and ep.user_id = p_user
      and (ep.status = 'waiting_list'
           or exists (select 1 from event_teams t
                      where t.event_id = p_event_id and ep.id in (t.player_a_id, t.player_b_id)
                        and t.player_a_id is not null and t.player_b_id is not null)));   -- NEW (both slots)
$$;
revoke execute on function _is_paired_or_waiting(uuid, uuid) from public, anon, authenticated;

-- Empty the user's slot in any team where they sit alone (the team row stays, unconfirmed, as
-- leave_event leaves it). Never touches a full team: callers check _is_paired_or_waiting first.
create or replace function _release_lone_slot(p_event_id uuid, p_user uuid) returns void
language sql security definer set search_path = public as $$
  update event_teams t set
    player_a_id = case when t.player_a_id = ep.id then null else t.player_a_id end,
    player_b_id = case when t.player_b_id = ep.id then null else t.player_b_id end,
    is_confirmed = false
  from event_participants ep
  where ep.event_id = p_event_id and ep.user_id = p_user and t.event_id = p_event_id
    and ep.id in (t.player_a_id, t.player_b_id)
    and (t.player_a_id is null or t.player_b_id is null);
$$;
revoke execute on function _release_lone_slot(uuid, uuid) from public, anon, authenticated;

-- choose_partner (0112 body) + lone slots released.
create or replace function choose_partner(p_event_id uuid, p_partner_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype;
        v_confirmed int; v_cap int; v_caller_pid uuid; v_partner_pid uuid; v_team int;
        v_status text; v_pos int;                                                     -- NEW
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  perform _assert_can_confirm(p_event_id);
  if v_ev.specification <> 'team' then raise exception 'not_a_team_event' using errcode='P0001'; end if;
  if not _may_enter_team_flow(p_event_id, v_user) then                                -- NEW (B7; was invitee/participant)
    raise exception 'forbidden' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  if _is_paired_or_waiting(p_event_id, v_user) then
    raise exception 'already_joined' using errcode='P0001'; end if;
  if not _partner_available(p_event_id, v_user, p_partner_user) then
    raise exception 'partner_unavailable' using errcode='P0001'; end if;
  -- NEW (0113, M5 review): a lone slot left by an organizer team edit is released first.
  perform _release_lone_slot(p_event_id, v_user);
  perform _release_lone_slot(p_event_id, p_partner_user);

  v_cap := event_capacity(p_event_id);
  select count(*) into v_confirmed from event_participants
    where event_id=p_event_id and status='confirmed'
      and user_id is distinct from v_user and user_id is distinct from p_partner_user;

  -- NEW (D6 + B8): no room for two, or someone already queued → the pair waits together
  -- (was: raise event_full).
  if v_confirmed + 2 > v_cap
     or exists (select 1 from event_participants where event_id=p_event_id and status='waiting_list'
                  and pair_participant_id is not null) then                          -- only pairs can claim
    -- NEW (review): never demote a confirmed player (the organizer who plays) into the queue.
    if exists (select 1 from event_participants where event_id=p_event_id
                 and user_id in (v_user, p_partner_user) and status='confirmed') then
      raise exception 'event_full' using errcode='P0001'; end if;
    v_status := 'waiting_list';
    select coalesce(max(waiting_list_position),0) into v_pos from event_participants
      where event_id=p_event_id and status='waiting_list';
    insert into event_participants (event_id, user_id, status, waiting_list_position, joined_at, invited_by)
      values (p_event_id, v_user, 'waiting_list', v_pos + 1, now(), v_ev.organizer_id)
      on conflict (event_id, user_id) do update set status='waiting_list',
        waiting_list_position=excluded.waiting_list_position, confirmed_at=null, is_standby=false
      returning id into v_caller_pid;
    insert into event_participants (event_id, user_id, status, waiting_list_position, joined_at, invited_by)
      values (p_event_id, p_partner_user, 'waiting_list', v_pos + 2, now(), v_user)
      on conflict (event_id, user_id) do update set status='waiting_list',
        waiting_list_position=excluded.waiting_list_position, confirmed_at=null, is_standby=false
      returning id into v_partner_pid;
    update event_participants set pair_participant_id =
      case when id = v_caller_pid then v_partner_pid else v_caller_pid end
      where id in (v_caller_pid, v_partner_pid);
  else
    v_status := 'confirmed';
    insert into event_participants (event_id, user_id, status, confirmed_at, joined_at, invited_by)
      values (p_event_id, v_user, 'confirmed', now(), now(), v_ev.organizer_id)
      on conflict (event_id, user_id) do update set status='confirmed', confirmed_at=now()
      returning id into v_caller_pid;
    insert into event_participants (event_id, user_id, status, confirmed_at, joined_at, invited_by)
      values (p_event_id, p_partner_user, 'confirmed', now(), now(), v_user)
      on conflict (event_id, user_id) do update set status='confirmed', confirmed_at=now()
      returning id into v_partner_pid;

    select coalesce(max(team_number),0)+1 into v_team from event_teams where event_id=p_event_id;
    insert into event_teams (event_id, team_number, player_a_id, player_b_id, is_confirmed)
      values (p_event_id, v_team, v_caller_pid, v_partner_pid, true);
  end if;

  update event_invitations set status='accepted', responded_at=now()
    where event_id=p_event_id and invitee_id in (v_user, p_partner_user) and status='pending';

  update partner_requests set status='declined', responded_at=now(), closed_by_system=true   -- NEW (R2)
    where event_id=p_event_id and status='pending'
      and (requester_id in (v_user, p_partner_user) or target_id in (v_user, p_partner_user));
  if v_status = 'waiting_list' then perform notify_waitlist_spot(p_event_id, null); end if;   -- NEW
  return v_status;                                                                    -- NEW
end; $$;
revoke execute on function choose_partner(uuid, uuid) from public, anon, authenticated;
grant execute on function choose_partner(uuid, uuid) to authenticated;

-- accept_partner_request (0112 body) + lone slots released.
create or replace function accept_partner_request(p_request_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_req partner_requests%rowtype; v_ev events%rowtype;
        v_confirmed int; v_cap int; v_req_pid uuid; v_target_pid uuid; v_team int;
        v_status text; v_pos int;                                                     -- NEW
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_req from partner_requests where id = p_request_id;
  if v_req.id is null or v_req.target_id <> v_user or v_req.status <> 'pending' then
    raise exception 'request_not_found' using errcode='P0001'; end if;
  select * into v_ev from events where id = v_req.event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  perform _assert_can_confirm(v_req.event_id);
  -- NEW (review): a player removed from the event cannot walk back in through an old request.
  if not _may_enter_team_flow(v_req.event_id, v_user) then
    raise exception 'forbidden' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||v_req.event_id::text, 0));
  if _is_paired_or_waiting(v_req.event_id, v_user) then
    raise exception 'already_joined' using errcode='P0001'; end if;
  -- NEW (R5): same rule as _partner_available — a participant who is not paired or waiting.
  if not is_event_participant(v_req.event_id, v_req.requester_id)
     or _is_paired_or_waiting(v_req.event_id, v_req.requester_id)
     or notif_blocked(v_req.requester_id, v_user) then
    raise exception 'request_stale' using errcode='P0001'; end if;
  -- NEW (0113, M5 review): a lone slot left by an organizer team edit is released first.
  perform _release_lone_slot(v_req.event_id, v_req.requester_id);
  perform _release_lone_slot(v_req.event_id, v_req.target_id);

  -- NEW (R1): re-checked under the lock, BEFORE anything is written. A withdraw that committed
  -- after the first read deleted the row, so nothing matches and the whole call rolls back.
  update partner_requests set status='accepted', responded_at=now()
    where id = p_request_id and status = 'pending';
  if not found then raise exception 'request_not_found' using errcode='P0001'; end if;
  update partner_requests set status='declined', responded_at=now(), closed_by_system=true   -- NEW (R2)
    where event_id=v_req.event_id and status='pending' and id <> p_request_id
      and (requester_id in (v_req.requester_id, v_req.target_id)
           or target_id in (v_req.requester_id, v_req.target_id));

  v_cap := event_capacity(v_req.event_id);
  select count(*) into v_confirmed from event_participants
    where event_id=v_req.event_id and status='confirmed'
      and user_id is distinct from v_req.requester_id and user_id is distinct from v_req.target_id;

  -- NEW (D6 + B8): as choose_partner — no room for two, or a queue → the pair waits together.
  if v_confirmed + 2 > v_cap
     or exists (select 1 from event_participants where event_id=v_req.event_id and status='waiting_list'
                  and pair_participant_id is not null) then                          -- only pairs can claim
    -- NEW (review): never demote a confirmed player (the organizer who plays) into the queue.
    if exists (select 1 from event_participants where event_id=v_req.event_id
                 and user_id in (v_req.requester_id, v_req.target_id) and status='confirmed') then
      raise exception 'event_full' using errcode='P0001'; end if;
    v_status := 'waiting_list';
    select coalesce(max(waiting_list_position),0) into v_pos from event_participants
      where event_id=v_req.event_id and status='waiting_list';
    insert into event_participants (event_id, user_id, status, waiting_list_position, joined_at, invited_by)
      values (v_req.event_id, v_req.requester_id, 'waiting_list', v_pos + 1, now(), v_ev.organizer_id)
      on conflict (event_id, user_id) do update set status='waiting_list',
        waiting_list_position=excluded.waiting_list_position, confirmed_at=null, is_standby=false
      returning id into v_req_pid;
    insert into event_participants (event_id, user_id, status, waiting_list_position, joined_at, invited_by)
      values (v_req.event_id, v_req.target_id, 'waiting_list', v_pos + 2, now(), v_req.requester_id)
      on conflict (event_id, user_id) do update set status='waiting_list',
        waiting_list_position=excluded.waiting_list_position, confirmed_at=null, is_standby=false
      returning id into v_target_pid;
    update event_participants set pair_participant_id =
      case when id = v_req_pid then v_target_pid else v_req_pid end
      where id in (v_req_pid, v_target_pid);
  else
    v_status := 'confirmed';
    insert into event_participants (event_id, user_id, status, confirmed_at, joined_at, invited_by)
      values (v_req.event_id, v_req.requester_id, 'confirmed', now(), now(), v_ev.organizer_id)
      on conflict (event_id, user_id) do update set status='confirmed', confirmed_at=now()
      returning id into v_req_pid;
    insert into event_participants (event_id, user_id, status, confirmed_at, joined_at, invited_by)
      values (v_req.event_id, v_req.target_id, 'confirmed', now(), now(), v_req.requester_id)
      on conflict (event_id, user_id) do update set status='confirmed', confirmed_at=now()
      returning id into v_target_pid;

    select coalesce(max(team_number),0)+1 into v_team from event_teams where event_id=v_req.event_id;
    insert into event_teams (event_id, team_number, player_a_id, player_b_id, is_confirmed)
      values (v_req.event_id, v_team, v_req_pid, v_target_pid, true);
  end if;

  update event_invitations set status='accepted', responded_at=now()
    where event_id=v_req.event_id and invitee_id in (v_req.requester_id, v_req.target_id) and status='pending';
  if v_status = 'waiting_list' then perform notify_waitlist_spot(v_req.event_id, null); end if;   -- NEW
  return v_status;                                                                    -- NEW
end; $$;
revoke execute on function accept_partner_request(uuid) from public, anon, authenticated;
grant execute on function accept_partner_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Partner requests (found by the mobile team-events PR): a notification, the invitation answered,
-- and the event details the requests screen needs
-- ---------------------------------------------------------------------------------------------
-- New notification type `partner_request`; every existing one kept (latest list: 0112).
alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'event_invite','group_invite','community_invite',
  'community_request_accepted','follow','follow_joined_event','event_cancelled','event_updated',
  'participant_confirmed','waitlist_spot','results_published',
  'event_created','partner_left',
  'partner_request'));                                                                -- NEW

-- request_partner (0112 body):
--   * each target whose request is created or re-opened gets a `partner_request` notification
--     (actor = requester, entity = event, ref_id = the request). Blocked pairs never get this far
--     (_partner_available). Dedupe as elsewhere: no second one while an unread, unactioned one
--     from the same requester for the same event stands.
--   * the caller's own pending invitation is answered (accepted) — they are in the event now, as
--     interested; choose_partner already does this. Was: left pending, so the Invited state and
--     the Pending tab kept showing an event the caller had entered.
create or replace function request_partner(p_event_id uuid, p_targets uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_t uuid;
        v_req uuid; v_actor text;                                                     -- NEW
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
  perform _release_lone_slot(p_event_id, v_user);                                    -- NEW (M5 review)

  insert into event_participants (event_id, user_id, status, joined_at, invited_by)
    values (p_event_id, v_user, 'interested', now(), v_ev.organizer_id)
    on conflict (event_id, user_id) do update set status='interested';
  update event_invitations set status='accepted', responded_at=now()                 -- NEW
    where event_id=p_event_id and invitee_id=v_user and status='pending';

  select full_name into v_actor from profiles where id = v_user;                      -- NEW
  foreach v_t in array coalesce(p_targets, '{}'::uuid[]) loop
    if _partner_available(p_event_id, v_user, v_t) then
      v_req := null;                                                                  -- NEW
      insert into partner_requests (event_id, requester_id, target_id, status)
        values (p_event_id, v_user, v_t, 'pending')
        on conflict (event_id, requester_id, target_id) do update
          set status = 'pending', responded_at = null, created_at = now(), closed_by_system = false
          where partner_requests.status <> 'pending'
            and (partner_requests.closed_by_system or partner_requests.status = 'accepted')
        returning id into v_req;                                                      -- NEW
      if v_req is not null and not exists (                                           -- NEW
           select 1 from notifications n
           where n.user_id = v_t and n.type = 'partner_request' and n.event_id = p_event_id
             and n.actor_id = v_user and n.read_at is null and not n.cta_done) then
        insert into notifications (user_id, type, actor_id, event_id, group_id, ref_id, actor_name, entity_name)
          values (v_t, 'partner_request', v_user, p_event_id, v_ev.group_id, v_req, v_actor, v_ev.name);
      end if;
    end if;
  end loop;
end; $$;

-- incoming_partner_requests (0098 body) + the event's date and location, so the requests screen
-- needs no second query. Explicit columns; null on community rows.
drop function if exists incoming_partner_requests();
create function incoming_partner_requests()
returns table (
  kind             text,
  request_id       uuid,
  entity_id        uuid,
  entity_name      text,
  requester_id     uuid,
  requester_name   text,
  requester_avatar text,
  created_at       timestamptz,
  starts_at        timestamptz,                                                       -- NEW
  venue_name       text,                                                              -- NEW
  venue_address    text,                                                              -- NEW
  manual_location_name    text,                                                       -- NEW
  manual_location_address text                                                        -- NEW
)
language sql stable security definer set search_path = public as $$
  select 'event'::text, pr.id, e.id, e.name, p.id, p.full_name, p.avatar_url, pr.created_at,
         e.starts_at, v.name, v.address, e.manual_location_name, e.manual_location_address
  from partner_requests pr
  join events e   on e.id = pr.event_id
  join profiles p on p.id = pr.requester_id
  left join venues v on v.id = e.venue_id
  where pr.target_id = auth.uid() and pr.status = 'pending'
  union all
  select 'community'::text, jr.id, c.id, c.name, p.id, p.full_name, p.avatar_url, jr.created_at,
         null::timestamptz, null::text, null::text, null::text, null::text
  from community_join_requests jr
  join communities c on c.id = jr.community_id
  join profiles p    on p.id = jr.user_id
  where jr.status = 'pending'
    and exists (select 1 from community_members cm
                 where cm.community_id = jr.community_id
                   and cm.user_id = auth.uid() and cm.role = 'admin')
  order by created_at desc;
$$;
revoke execute on function incoming_partner_requests() from public, anon, authenticated;
grant execute on function incoming_partner_requests() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- D7: a confirmed guest partner never outlives the player who brought them
-- ---------------------------------------------------------------------------------------------
-- leave_event drops the partner itself (_drop_partner). Any other delete of the player's row —
-- organizer_remove_participant, account deletion (profiles cascade) — would leave their guest
-- confirmed in a half-empty team with nobody to answer for them. BEFORE DELETE, because the team
-- slots are nulled by the FK (on delete set null) before any AFTER trigger could read them. Only a
-- guest the deleted player brought (invited_by) goes: a guest the organizer added and teamed with
-- someone stays the organizer's to manage. As leave_event: the team row is kept, unconfirmed.
create or replace function _drop_guest_teammate() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_team event_teams%rowtype; v_mate uuid;
begin
  -- The whole event is going (a cascade from events): nothing to keep consistent.
  if not exists (select 1 from events where id = OLD.event_id) then return OLD; end if;
  for v_team in select * from event_teams t
                where t.event_id = OLD.event_id and OLD.id in (t.player_a_id, t.player_b_id) loop
    v_mate := case when v_team.player_a_id = OLD.id then v_team.player_b_id else v_team.player_a_id end;
    if v_mate is not null and exists (select 1 from event_participants g
                                      where g.id = v_mate and g.user_id is null and g.invited_by = OLD.user_id) then
      update event_teams set is_confirmed = false where id = v_team.id;
      delete from event_participants where id = v_mate;
    end if;
  end loop;
  return OLD;
end; $$;
revoke execute on function _drop_guest_teammate() from public, anon, authenticated;
drop trigger if exists trg_drop_guest_teammate on event_participants;
create trigger trg_drop_guest_teammate before delete on event_participants
  for each row when (OLD.user_id is not null)
  execute function _drop_guest_teammate();

-- Self-check so a partial paste into the hosted SQL editor cannot silently leave something open.
do $$
begin
  if has_function_privilege('anon', 'public._events_reset_manual_court_names()', 'execute')
     or has_function_privilege('authenticated', 'public._events_reset_manual_court_names()', 'execute') then
    raise exception '_events_reset_manual_court_names is executable by anon/authenticated';
  end if;
  if has_function_privilege('anon', 'public._release_lone_slot(uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._release_lone_slot(uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._is_paired_or_waiting(uuid, uuid)', 'execute') then
    raise exception '_release_lone_slot / _is_paired_or_waiting executable by the API';
  end if;
  if has_function_privilege('anon', 'public._drop_guest_teammate()', 'execute')
     or has_function_privilege('authenticated', 'public._drop_guest_teammate()', 'execute')
     or has_function_privilege('anon', 'public._court_names_valid(text[])', 'execute')
     or has_function_privilege('authenticated', 'public._court_names_valid(text[])', 'execute') then
    raise exception '0113 internal helpers executable by anon/authenticated';
  end if;
  if has_function_privilege('anon', 'public._unpair_waiting_partner()', 'execute')
     or has_function_privilege('authenticated', 'public._unpair_waiting_partner()', 'execute') then
    raise exception '_unpair_waiting_partner is executable by anon/authenticated';
  end if;
  if has_function_privilege('anon', 'public.choose_guest_partner(uuid, text, text)', 'execute') then
    raise exception 'choose_guest_partner is executable by anon';
  end if;
  if not has_function_privilege('authenticated', 'public.choose_guest_partner(uuid, text, text)', 'execute') then
    raise exception 'choose_guest_partner is not executable by authenticated';
  end if;
  if has_function_privilege('anon', 'public.create_event(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.update_event(uuid, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.invite_to_event(uuid, jsonb)', 'execute') then
    raise exception 'create_event / update_event / invite_to_event executable by anon';
  end if;
  if has_function_privilege('anon', 'public.incoming_partner_requests()', 'execute') then
    raise exception 'incoming_partner_requests is executable by anon';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_manual_court_names_ok'
                 and conrelid = 'public.events'::regclass) then
    raise exception 'events_manual_court_names_ok is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_events_reset_manual_court_names'
                 and tgrelid = 'public.events'::regclass) then
    raise exception 'trg_events_reset_manual_court_names is missing';
  end if;
end $$;

commit;
