-- Email-delivery helpers. CSV + recipient list are organizer-gated SECURITY DEFINER (single source of
-- truth; edge functions call these as the caller). send_event_blast re-created to also return the new id.

-- CSV field escaper: quote + double internal quotes when the value has a comma/quote/newline.
create or replace function _csv_field(p text) returns text
language sql immutable as $$
  select case when p ~ '[",\n]' then '"' || replace(p, '"', '""') || '"' else coalesce(p, '') end;
$$;
revoke execute on function _csv_field(text) from public;

-- JM-46/47: organizer-only roster CSV (no member email/mobile). Mirrors @padel/utils buildRosterCsv.
create or replace function event_roster_csv(p_event_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_fee numeric; v_body text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  v_fee := case when v_ev.entrance_fee_enabled then coalesce(v_ev.entrance_fee_amount, 0) else 0 end;

  select string_agg(
           _csv_field(coalesce(pr.full_name, ep.guest_name, '')) || ',' ||
           (case when ep.user_id is not null then 'member' else 'manual' end) || ',' ||
           ep.status || ',' || lower(ep.is_standby::text) || ',' ||
           coalesce(ep.joined_at::text,'') || ',' || coalesce(ep.confirmed_at::text,'') || ',' ||
           lower(ep.has_paid::text) || ',' || coalesce(ep.paid_at::text,'') || ',' || v_fee::text,
           E'\n' order by ep.joined_at asc)
    into v_body
  from event_participants ep
  left join profiles pr on pr.id = ep.user_id
  where ep.event_id = p_event_id;

  return 'name,user_type,status,is_standby,joined_at,confirmed_at,has_paid,paid_at,fee_amount'
         || coalesce(E'\n' || v_body, '');
end; $$;

-- Distinct emails of members opted-in to the blast's email channel (organizer-only). Reads auth.users.
create or replace function blast_email_recipients(p_blast_id uuid) returns table (email text)
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select event_id into v_event from event_blasts where id = p_blast_id;
  if v_event is null then raise exception 'blast_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;

  return query
  select distinct au.email::text
  from event_participants ep
  join user_settings us on us.user_id = ep.user_id and us.notifications_email
  join auth.users au on au.id = ep.user_id
  where ep.event_id = v_event
    and ep.user_id is not null
    and ep.status in ('invited','interested','confirmed','waiting_list')
    and au.email is not null;
end; $$;

-- Re-create send_event_blast to ALSO return the new blast id (was: returns integer). Body unchanged
-- except the final RETURN. (Different return type => must DROP first.)
drop function if exists send_event_blast(uuid, uuid, text, text, text, text[]);
create function send_event_blast(
  p_event_id uuid, p_source_template_id uuid, p_title text, p_description text,
  p_image_path text, p_channels text[]
) returns table (blast_id uuid, sent_to_count integer)
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_count int; v_ch text; v_id uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if event_group_community(p_event_id) is null then raise exception 'no_community' using errcode='P0001'; end if;
  if coalesce(array_length(p_channels,1),0) = 0 then raise exception 'channels_required' using errcode='P0001'; end if;
  foreach v_ch in array p_channels loop
    if v_ch not in ('email','whatsapp') then raise exception 'invalid_channel' using errcode='P0001'; end if;
  end loop;
  if coalesce(btrim(p_title),'')='' or coalesce(btrim(p_description),'')='' then
    raise exception 'blast_incomplete' using errcode='P0001'; end if;

  select count(distinct ep.user_id) into v_count
  from event_participants ep
  join user_settings us on us.user_id = ep.user_id
  where ep.event_id = p_event_id and ep.user_id is not null
    and ep.status in ('invited','interested','confirmed','waiting_list')
    and ( ('email' = any(p_channels) and us.notifications_email)
       or ('whatsapp' = any(p_channels) and us.notifications_whatsapp) );

  insert into event_blasts (event_id, sender_id, source_template_id, title, description, image_path, channels, sent_to_count)
  values (p_event_id, v_user, p_source_template_id, btrim(p_title), btrim(p_description),
          p_image_path, p_channels, coalesce(v_count,0))
  returning id into v_id;

  return query select v_id, coalesce(v_count,0);
end; $$;

grant execute on function event_roster_csv(uuid), blast_email_recipients(uuid),
  send_event_blast(uuid, uuid, text, text, text, text[]) to authenticated;
