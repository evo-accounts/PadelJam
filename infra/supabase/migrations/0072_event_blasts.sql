create table blast_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  image_path text not null,
  category text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table blast_templates enable row level security;
create policy "blast_templates: read" on blast_templates for select
  using (auth.uid() is not null and is_active);
-- no client write policy (curated by service role / seed)

create table event_blasts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  source_template_id uuid references blast_templates(id),
  title text not null,
  description text not null,
  image_path text,
  channels text[] not null,
  send_to text not null default 'all_members' check (send_to in ('all_members')),
  sent_to_count integer not null,
  sent_at timestamptz not null default now()
);
create index event_blasts_event_idx on event_blasts(event_id, sent_at desc);
alter table event_blasts enable row level security;
create policy "event_blasts: read" on event_blasts for select
  using (is_event_organizer(event_id, auth.uid()));
-- inserts only via send_event_blast (SECURITY DEFINER)

-- Seed generic system templates (image_path is a placeholder asset key; the UI renders a styled card).
insert into blast_templates (title, description, image_path, category, is_default) values
  ('Event reminder', 'Don''t forget — our event is coming up. See you on court!', 'templates/reminder.png', 'reminder', true),
  ('Last call', 'A few spots are still open. Grab yours before it fills up!', 'templates/lastcall.png', 'reminder', false),
  ('Results are in', 'Great games today — check out the final standings in the app.', 'templates/recap.png', 'recap', false);

create or replace function can_customize_blast(p_event_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select event_group_community(p_event_id) is not null
     and community_has_feature(event_group_community(p_event_id), 'custom_broadcasts');
$$;

create or replace function send_event_blast(
  p_event_id uuid, p_source_template_id uuid, p_title text, p_description text,
  p_image_path text, p_channels text[]
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_count int; v_ch text;
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

  -- Count members opted-in to >=1 selected channel (guests have no settings -> skipped; JM-44).
  select count(distinct ep.user_id) into v_count
  from event_participants ep
  join user_settings us on us.user_id = ep.user_id
  where ep.event_id = p_event_id
    and ep.user_id is not null
    and ep.status in ('invited','interested','confirmed','waiting_list')
    and ( ('email' = any(p_channels) and us.notifications_email)
       or ('whatsapp' = any(p_channels) and us.notifications_whatsapp) );

  insert into event_blasts (event_id, sender_id, source_template_id, title, description, image_path, channels, sent_to_count)
  values (p_event_id, v_user, p_source_template_id, btrim(p_title), btrim(p_description),
          p_image_path, p_channels, coalesce(v_count,0));
  return coalesce(v_count,0);
end; $$;

grant execute on function can_customize_blast(uuid), send_event_blast(uuid, uuid, text, text, text, text[]) to authenticated;
