-- 0124_blasts.sql
-- UX Audit — Manage Event, plan PR "0124 — blasts" (docs/audit/2026-09-29-ux-manage-event-plan.md):
-- decision D6, bug B10, UX-MEVT-18. Stacked on 0122.
--
--   D6   Blasts work on GROUP-LESS events. send_event_blast no longer raises no_community.
--        "Premium" (full customisation, Your blasts, Save blast) is:
--          * a group event  → community_has_feature(community, 'custom_broadcasts') (Basic and above);
--          * a group-less event → the ORGANIZER's account plan (account_plan = 'jammer_plus').
--        can_customize_event_blast(event) answers it for the organizer (false for anyone else);
--        can_customize_blast(event) is kept for shipped clients and now delegates to it.
--   D6   send_to: 'all' (every participant — invited / interested / confirmed / waiting list — plus
--        pending invitees with an account), 'confirmed', 'invited' (pending invitations with an
--        invitee_id + participant rows in 'invited'), 'waiting_list'. 'all_members' (the only value
--        before 0124, and what shipped clients send implicitly) is accepted as an alias of 'all';
--        stored rows are rewritten to 'all'. The sender is never in their own audience; soft-deleted
--        accounts are skipped.
--   D6   Channels: email is delivered by the send-blast Edge Function, as before, to the audience
--        members opted in to email (user_settings.notifications_email). WhatsApp is sent from the
--        ORGANIZER's device (share intent / wa.me): no server send, so no per-recipient opt-in
--        applies. The RPC records a delivery_log row (channel 'whatsapp', status 'shared',
--        sent_count = audience) and returns share_text — "*Title*\n\nDescription" — for the app to
--        prefill.
--   B10  customisation is enforced server-side. Without it the blast must be a template, as is:
--        pass the template id and either omit title / description / image (the server fills them)
--        or send exactly the template's. Anything else — no template, edited text, another image,
--        p_save — raises blast_customization_required.
--        Title 1..80 and description 1..1000 characters (the client schema's limits): blast_too_long.
--   MEVT-18 "Your blasts": saved_blasts, scoped to the event's community (shared by the community's
--        organizers) or, on a group-less event, to the organizer. RPCs list_saved_blasts(event),
--        save_blast(event, …), update_saved_blast(id, …), delete_saved_blast(id); send_event_blast
--        takes p_save. Listing, saving and editing need customisation; deleting does not (a
--        downgraded owner can still clean up). Editing / deleting a community-scoped blast: its
--        creator while still a member, or a community admin.
--   MEVT-18 Templates grid "preview image": blast_templates.image_path already exists (0072). The
--        three seeded rows carried placeholder keys with no asset behind them; the column becomes
--        nullable and those keys become NULL until the artwork exists.
--
-- Return-shape change: send_event_blast returns (blast_id, sent_to_count, audience_count,
-- share_text). sent_to_count is now the EMAIL recipients only (0 without the email channel; before,
-- a WhatsApp-only blast counted notifications_whatsapp opt-ins that nothing ever messaged);
-- audience_count is everyone in the send_to scope (also stored on event_blasts).
-- Old callers (6 named args, reading sent_to_count) keep working: the new parameters default.

------------------------------------------------------------------------------
-- 1. Schema
------------------------------------------------------------------------------
alter table event_blasts drop constraint if exists event_blasts_send_to_check;
update event_blasts set send_to = 'all' where send_to = 'all_members';
alter table event_blasts alter column send_to set default 'all';
alter table event_blasts add constraint event_blasts_send_to_check
  check (send_to in ('all', 'confirmed', 'invited', 'waiting_list'));
-- Everyone in the send_to scope at send time. NULL on rows sent before 0124.
alter table event_blasts add column audience_count integer;

-- WhatsApp is recorded, not delivered: channel 'whatsapp' ⇔ status 'shared'.
alter table delivery_log drop constraint if exists delivery_log_channel_check;
alter table delivery_log add constraint delivery_log_channel_check
  check (channel in ('email', 'push', 'whatsapp'));
alter table delivery_log drop constraint if exists delivery_log_status_check;
alter table delivery_log add constraint delivery_log_status_check
  check (status in ('sent', 'failed', 'shared'));
alter table delivery_log drop constraint if exists delivery_target;
alter table delivery_log add constraint delivery_target check (
  (channel in ('email', 'whatsapp') and blast_id is not null and notification_id is null) or
  (channel = 'push' and notification_id is not null and blast_id is null));
alter table delivery_log add constraint delivery_shared_is_whatsapp
  check ((status = 'shared') = (channel = 'whatsapp'));

alter table blast_templates alter column image_path drop not null;
update blast_templates set image_path = null
  where image_path in ('templates/reminder.png', 'templates/lastcall.png', 'templates/recap.png');

create table saved_blasts (
  id                 uuid primary key default gen_random_uuid(),
  -- Exactly one scope: the community of a group event, or the organizer of a group-less one.
  community_id       uuid references communities(id) on delete cascade,
  owner_user_id      uuid references profiles(id) on delete cascade,
  created_by         uuid references profiles(id) on delete set null,
  source_template_id uuid references blast_templates(id) on delete set null,
  title              text not null,
  description        text not null,
  image_path         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint saved_blasts_scope check (num_nonnulls(community_id, owner_user_id) = 1),
  constraint saved_blasts_title check (char_length(title) between 1 and 80),
  constraint saved_blasts_description check (char_length(description) between 1 and 1000)
);
create index saved_blasts_community_idx on saved_blasts (community_id, updated_at desc) where community_id is not null;
create index saved_blasts_owner_idx on saved_blasts (owner_user_id, updated_at desc) where owner_user_id is not null;
alter table saved_blasts enable row level security;
-- No policies and no table grants: every read and write goes through the RPCs below.
revoke all on saved_blasts from anon, authenticated;

------------------------------------------------------------------------------
-- 2. Internal helpers (no client grant, 0094)
------------------------------------------------------------------------------
-- Is full customisation on for a blast scope? Exactly one argument is non-null.
create or replace function _blast_scope_can_customize(p_community uuid, p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_community is not null then community_has_feature(p_community, 'custom_broadcasts')
    when p_owner is not null then account_plan(p_owner) = 'jammer_plus'
    else false
  end;
$$;
revoke execute on function _blast_scope_can_customize(uuid, uuid) from public, anon, authenticated;

-- The user ids a blast with this send_to reaches (before any channel opt-in). 'all_members' is the
-- pre-0124 spelling of 'all'. The organizer and soft-deleted accounts are never included.
create or replace function _blast_audience(p_event_id uuid, p_send_to text) returns setof uuid
language sql stable security definer set search_path = public as $$
  with scope as (
    select case when p_send_to = 'all_members' then 'all' else p_send_to end as s
  ), ids as (
    select ep.user_id as uid
    from event_participants ep, scope
    where ep.event_id = p_event_id and ep.user_id is not null
      and case scope.s
            when 'all'          then ep.status in ('invited', 'interested', 'confirmed', 'waiting_list')
            when 'confirmed'    then ep.status = 'confirmed'
            when 'invited'      then ep.status = 'invited'
            when 'waiting_list' then ep.status = 'waiting_list'
            else false
          end
    union
    -- Pending invitees with an account. A pending invitation next to a participant row in another
    -- status (a stale invitation) does not make that player "invited".
    select ei.invitee_id
    from event_invitations ei, scope
    where ei.event_id = p_event_id and ei.invitee_id is not null and ei.status = 'pending'
      and scope.s in ('all', 'invited')
      and not exists (
        select 1 from event_participants ep2
        where ep2.event_id = p_event_id and ep2.user_id = ei.invitee_id and ep2.status <> 'invited')
  )
  select distinct ids.uid
  from ids
  join profiles p on p.id = ids.uid and p.deleted_at is null
  join events ev on ev.id = p_event_id
  where ids.uid <> ev.organizer_id;
$$;
revoke execute on function _blast_audience(uuid, text) from public, anon, authenticated;

-- Title / description checks shared by send and save.
create or replace function _blast_check_text(p_title text, p_description text) returns void
language plpgsql immutable set search_path = public as $$
begin
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_description), '') = '' then
    raise exception 'blast_incomplete' using errcode = 'P0001';
  end if;
  if char_length(btrim(p_title)) > 80 or char_length(btrim(p_description)) > 1000 then
    raise exception 'blast_too_long' using errcode = 'P0001';
  end if;
end; $$;
revoke execute on function _blast_check_text(text, text) from public, anon, authenticated;

-- May the caller edit / delete this saved blast? Owner scope: the owner. Community scope: its
-- creator while still a member, or a community admin.
create or replace function _saved_blast_writable(p_row saved_blasts) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_row.owner_user_id is not null then p_row.owner_user_id = auth.uid()
    else is_community_admin(p_row.community_id)
      or (p_row.created_by = auth.uid() and exists (
            select 1 from community_members cm
            where cm.community_id = p_row.community_id and cm.user_id = auth.uid()))
  end;
$$;
revoke execute on function _saved_blast_writable(saved_blasts) from public, anon, authenticated;

------------------------------------------------------------------------------
-- 3. The customisation gate
------------------------------------------------------------------------------
create or replace function can_customize_event_blast(p_event_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid;
begin
  select organizer_id into v_org from events where id = p_event_id and deleted_at is null;
  if v_org is null or v_org is distinct from auth.uid() then return false; end if;
  return _blast_scope_can_customize(event_group_community(p_event_id),
           case when event_group_community(p_event_id) is null then v_org end);
end; $$;
revoke execute on function can_customize_event_blast(uuid) from public, anon;
grant execute on function can_customize_event_blast(uuid) to authenticated;

-- Shipped clients call the 0072 name. Same answer.
create or replace function can_customize_blast(p_event_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_customize_event_blast(p_event_id);
$$;
revoke execute on function can_customize_blast(uuid) from public, anon;
grant execute on function can_customize_blast(uuid) to authenticated;

------------------------------------------------------------------------------
-- 4. send_event_blast
------------------------------------------------------------------------------
drop function if exists send_event_blast(uuid, uuid, text, text, text, text[]);
create function send_event_blast(
  p_event_id uuid, p_source_template_id uuid, p_title text, p_description text,
  p_image_path text, p_channels text[], p_send_to text default 'all', p_save boolean default false
) returns table (blast_id uuid, sent_to_count integer, audience_count integer, share_text text)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_ev events%rowtype;
  v_community uuid;
  v_owner uuid;
  v_custom boolean;
  v_tpl blast_templates%rowtype;
  v_channels text[];
  v_ch text;
  v_send_to text;
  v_title text;
  v_desc text;
  v_image text;
  v_audience int;
  v_email int;
  v_id uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode = 'P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode = 'P0001'; end if;

  select coalesce(array_agg(distinct c), '{}') into v_channels from unnest(p_channels) c;
  if coalesce(array_length(v_channels, 1), 0) = 0 then
    raise exception 'channels_required' using errcode = 'P0001';
  end if;
  foreach v_ch in array v_channels loop
    if v_ch is null or v_ch not in ('email', 'whatsapp') then
      raise exception 'invalid_channel' using errcode = 'P0001';
    end if;
  end loop;

  v_send_to := case when p_send_to is null or p_send_to = 'all_members' then 'all' else p_send_to end;
  if v_send_to not in ('all', 'confirmed', 'invited', 'waiting_list') then
    raise exception 'invalid_send_to' using errcode = 'P0001';
  end if;

  v_community := event_group_community(p_event_id);
  v_owner := case when v_community is null then v_ev.organizer_id end;
  v_custom := _blast_scope_can_customize(v_community, v_owner);

  v_title := nullif(btrim(p_title), '');
  v_desc  := nullif(btrim(p_description), '');
  v_image := nullif(btrim(p_image_path), '');

  if p_source_template_id is not null then
    select * into v_tpl from blast_templates where id = p_source_template_id and is_active;
    if v_tpl.id is null then raise exception 'template_not_found' using errcode = 'P0001'; end if;
  end if;

  if not v_custom then
    -- B10: a template, unedited. Omitted fields are filled from it.
    if v_tpl.id is null or coalesce(p_save, false)
       or (v_title is not null and v_title <> btrim(v_tpl.title))
       or (v_desc  is not null and v_desc  <> btrim(v_tpl.description))
       or (v_image is not null and v_image is distinct from v_tpl.image_path) then
      raise exception 'blast_customization_required' using errcode = 'P0001';
    end if;
    v_title := btrim(v_tpl.title);
    v_desc  := btrim(v_tpl.description);
    v_image := v_tpl.image_path;
  elsif v_tpl.id is not null then
    v_title := coalesce(v_title, btrim(v_tpl.title));
    v_desc  := coalesce(v_desc, btrim(v_tpl.description));
    v_image := coalesce(v_image, v_tpl.image_path);
  end if;

  perform _blast_check_text(v_title, v_desc);

  select count(*) into v_audience from _blast_audience(p_event_id, v_send_to);

  v_email := 0;
  if 'email' = any(v_channels) then
    -- Exactly who blast_email_recipients will return.
    select count(distinct au.email) into v_email
    from _blast_audience(p_event_id, v_send_to) a(uid)
    join user_settings us on us.user_id = a.uid and us.notifications_email
    join auth.users au on au.id = a.uid
    where au.email is not null;
  end if;

  insert into event_blasts (event_id, sender_id, source_template_id, title, description, image_path,
                            channels, send_to, sent_to_count, audience_count)
  values (p_event_id, v_user, v_tpl.id, v_title, v_desc, v_image,
          v_channels, v_send_to, v_email, v_audience)
  returning id into v_id;

  if 'whatsapp' = any(v_channels) then
    insert into delivery_log (channel, blast_id, status, attempt, sent_count)
    values ('whatsapp', v_id, 'shared', 1, v_audience);
  end if;

  if coalesce(p_save, false) then
    insert into saved_blasts (community_id, owner_user_id, created_by, source_template_id,
                              title, description, image_path)
    values (v_community, v_owner, v_user, v_tpl.id, v_title, v_desc, v_image);
  end if;

  return query select v_id, v_email, v_audience,
    case when 'whatsapp' = any(v_channels) then '*' || v_title || '*' || E'\n\n' || v_desc end;
end; $$;
revoke execute on function send_event_blast(uuid, uuid, text, text, text, text[], text, boolean) from public, anon;
grant execute on function send_event_blast(uuid, uuid, text, text, text, text[], text, boolean) to authenticated;

------------------------------------------------------------------------------
-- 5. Email delivery reads the blast's own scope
------------------------------------------------------------------------------
create or replace function blast_email_recipients(p_blast_id uuid) returns table (email text)
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid; v_send_to text; v_channels text[];
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select event_id, send_to, channels into v_event, v_send_to, v_channels from event_blasts where id = p_blast_id;
  if v_event is null then raise exception 'blast_not_found' using errcode = 'P0001'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  -- A WhatsApp-only blast has no email recipients, whoever asks.
  if not ('email' = any(v_channels)) then return; end if;

  return query
  select distinct au.email::text
  from _blast_audience(v_event, v_send_to) a(uid)
  join user_settings us on us.user_id = a.uid and us.notifications_email
  join auth.users au on au.id = a.uid
  where au.email is not null;
end; $$;

-- The latest EMAIL attempt decides; a WhatsApp 'shared' row is not an attempt.
create or replace function retry_blast(p_blast_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid; v_channels text[]; v_status text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select event_id, channels into v_event, v_channels from event_blasts where id = p_blast_id;
  if v_event is null then raise exception 'event_not_found' using errcode = 'P0001'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if not ('email' = any(v_channels)) then raise exception 'not_retryable' using errcode = 'P0001'; end if;
  select status into v_status from delivery_log
    where blast_id = p_blast_id and channel = 'email' order by attempt desc limit 1;
  if v_status is null or v_status <> 'failed' then
    raise exception 'not_retryable' using errcode = 'P0001';
  end if;
end; $$;

------------------------------------------------------------------------------
-- 6. Your blasts
------------------------------------------------------------------------------
-- The saved blasts for this event's scope (organizer only; needs customisation).
create or replace function list_saved_blasts(p_event_id uuid)
returns table (id uuid, title text, description text, image_path text, source_template_id uuid,
               created_by uuid, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_org uuid; v_community uuid; v_owner uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select organizer_id into v_org from events where events.id = p_event_id and deleted_at is null;
  if v_org is null then raise exception 'event_not_found' using errcode = 'P0001'; end if;
  if v_org <> v_user then raise exception 'forbidden' using errcode = 'P0001'; end if;
  v_community := event_group_community(p_event_id);
  v_owner := case when v_community is null then v_org end;
  if not _blast_scope_can_customize(v_community, v_owner) then
    raise exception 'blast_customization_required' using errcode = 'P0001';
  end if;
  return query
  select sb.id, sb.title, sb.description, sb.image_path, sb.source_template_id,
         sb.created_by, sb.created_at, sb.updated_at
  from saved_blasts sb
  where (v_community is not null and sb.community_id = v_community)
     or (v_owner is not null and sb.owner_user_id = v_owner)
  order by sb.updated_at desc, sb.id;
end; $$;

create or replace function save_blast(
  p_event_id uuid, p_title text, p_description text, p_image_path text default null,
  p_source_template_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_org uuid; v_community uuid; v_owner uuid; v_id uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select organizer_id into v_org from events where id = p_event_id and deleted_at is null;
  if v_org is null then raise exception 'event_not_found' using errcode = 'P0001'; end if;
  if v_org <> v_user then raise exception 'forbidden' using errcode = 'P0001'; end if;
  v_community := event_group_community(p_event_id);
  v_owner := case when v_community is null then v_org end;
  if not _blast_scope_can_customize(v_community, v_owner) then
    raise exception 'blast_customization_required' using errcode = 'P0001';
  end if;
  perform _blast_check_text(p_title, p_description);
  if p_source_template_id is not null
     and not exists (select 1 from blast_templates where id = p_source_template_id) then
    raise exception 'template_not_found' using errcode = 'P0001';
  end if;
  insert into saved_blasts (community_id, owner_user_id, created_by, source_template_id,
                            title, description, image_path)
  values (v_community, v_owner, v_user, p_source_template_id,
          btrim(p_title), btrim(p_description), nullif(btrim(p_image_path), ''))
  returning id into v_id;
  return v_id;
end; $$;

create or replace function update_saved_blast(
  p_saved_blast_id uuid, p_title text, p_description text, p_image_path text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_row saved_blasts%rowtype;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_row from saved_blasts where id = p_saved_blast_id for update;
  if v_row.id is null or not _saved_blast_writable(v_row) then
    raise exception 'saved_blast_not_found' using errcode = 'P0001';
  end if;
  if not _blast_scope_can_customize(v_row.community_id, v_row.owner_user_id) then
    raise exception 'blast_customization_required' using errcode = 'P0001';
  end if;
  perform _blast_check_text(p_title, p_description);
  update saved_blasts
     set title = btrim(p_title), description = btrim(p_description),
         image_path = nullif(btrim(p_image_path), ''), updated_at = now()
   where id = p_saved_blast_id;
end; $$;

create or replace function delete_saved_blast(p_saved_blast_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_row saved_blasts%rowtype;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_row from saved_blasts where id = p_saved_blast_id for update;
  if v_row.id is null or not _saved_blast_writable(v_row) then
    raise exception 'saved_blast_not_found' using errcode = 'P0001';
  end if;
  delete from saved_blasts where id = p_saved_blast_id;
end; $$;

revoke execute on function list_saved_blasts(uuid), save_blast(uuid, text, text, text, uuid),
  update_saved_blast(uuid, text, text, text), delete_saved_blast(uuid) from public, anon;
grant execute on function list_saved_blasts(uuid), save_blast(uuid, text, text, text, uuid),
  update_saved_blast(uuid, text, text, text), delete_saved_blast(uuid) to authenticated;
