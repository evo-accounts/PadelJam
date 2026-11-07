-- PAD-160 (from the PAD-156 audit): the RLS helpers stop answering outsiders.
--
-- Eleven SECURITY DEFINER helpers that policies call were executable by anyone holding the
-- publishable key. Three leaked: is_event_organizer(e, u) and event_is_visible(e, u) answered for
-- ANY user u, private events included, and group_community_id(g) returned a private group's
-- community. Plan: docs/superpowers/plans/2026-11-05-rls-helpers-no-outside-answers.md.
--
-- ORDER MATTERS. 0094, 0098, 0099, 0100 and 0136 kept anon's EXECUTE on these on purpose: a policy
-- runs as the calling role, all 43 policies using them were `to public`, and anon holds SELECT on
-- those tables, so a bare revoke turns anon's empty read into `42501 permission denied for
-- function`. So step 1 moves the policies to `authenticated` (a role with no applicable policy gets
-- no rows without evaluating anything); only then are the grants taken away. Anon's results do not
-- change: every branch of every one of these policies needs auth.uid(), a helper that is false
-- without a session, or a read of `communities`, which anon cannot read.
--
-- THIS SUPERSEDES 0142's advice ("grant to anon as well if anon reaches it") FOR RLS HELPERS: a
-- policy that calls a helper is `to authenticated`, and a helper does not answer for a user other
-- than the caller. A later migration that adds a `to public` policy calling one of them fails
-- infra/supabase/tests/rls_helpers_closed.sql.

-- 1. The 41 policies that only call helpers move to authenticated. (The other two, on group_members
--    and group_departures, are rewritten in step 4.)
alter policy "communities: read" on communities to authenticated;
alter policy "communities: update" on communities to authenticated;
alter policy "ci: read" on community_invitations to authenticated;
alter policy "cjr: read" on community_join_requests to authenticated;
alter policy "community_members: read" on community_members to authenticated;
alter policy "community_members: update" on community_members to authenticated;
alter policy "community_permissions: read" on community_permissions to authenticated;
alter policy "community_permissions: write" on community_permissions to authenticated;
alter policy "posts: create" on community_posts to authenticated;
alter policy "posts: delete" on community_posts to authenticated;
alter policy "posts: read" on community_posts to authenticated;
alter policy "reviews: read" on community_reviews to authenticated;
alter policy "reviews: write" on community_reviews to authenticated;
alter policy "community_subscriptions: read" on community_subscriptions to authenticated;
alter policy "delivery_log: organizer reads blast rows" on delivery_log to authenticated;
alter policy "activity: read" on event_activity to authenticated;
alter policy "event_blasts: read" on event_blasts to authenticated;
alter policy "event_courts: read" on event_courts to authenticated;
alter policy "event_courts: write" on event_courts to authenticated;
alter policy "event_invitations: read" on event_invitations to authenticated;
alter policy "event_matches: read" on event_matches to authenticated;
alter policy "event_participants: read" on event_participants to authenticated;
alter policy "event_rounds: read" on event_rounds to authenticated;
alter policy "event_teams: read" on event_teams to authenticated;
alter policy "event_teams: write" on event_teams to authenticated;
alter policy "event_timer: read" on event_timer to authenticated;
alter policy "events: read" on events to authenticated;
alter policy "group_event_results: read" on group_event_results to authenticated;
alter policy "group_invitations: read" on group_invitations to authenticated;
alter policy "group_seasons: read" on group_seasons to authenticated;
alter policy "groups: read" on groups to authenticated;
alter policy "groups: update" on groups to authenticated;
alter policy "match_players: read" on match_players to authenticated;
alter policy "partner_requests: read" on partner_requests to authenticated;
alter policy "comments: delete" on post_comments to authenticated;
alter policy "comments: read" on post_comments to authenticated;
alter policy "comments: write" on post_comments to authenticated;
alter policy "likes: read" on post_likes to authenticated;
alter policy "likes: write" on post_likes to authenticated;
alter policy "round_rest: read" on round_rest to authenticated;
alter policy "tenants: read own" on tenants to authenticated;

-- 2. Close the arbitrary-user forms. `case`, not `u = auth.uid() and ...`: the latter is NULL
--    without a session, and callers written `if not is_event_organizer(...) then raise` would not
--    raise on `not NULL`. Both must return a real false.
create or replace function is_event_organizer(e uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when u = auth.uid()
    then exists (select 1 from events where id = e and organizer_id = u)
    else false end;
$$;

create or replace function event_is_visible(e uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when u = auth.uid() then exists (
    select 1 from events ev where ev.id = e and ev.deleted_at is null and (
      ev.organizer_id = u
      or exists (select 1 from event_participants p where p.event_id = e and p.user_id = u)
      or exists (select 1 from event_invitations i where i.event_id = e and i.invitee_id = u)
      or (ev.is_private = false and ev.group_id is not null
          and exists (select 1 from group_members gm where gm.group_id = ev.group_id and gm.user_id = u))
      -- UX-COMM-04: a public community's events are part of its preview. `u is not null` is
      -- the anonymous guard (kept; `u = auth.uid()` already implies it).
      or (u is not null and ev.is_private = false and ev.group_id is not null
          and exists (
            select 1 from groups g
             where g.id = ev.group_id
               and g.is_private = false
               and community_is_public(g.community_id)
          ))
    )
  ) else false end;
$$;

-- 3. blast_email_recipients_for runs as service role (auth.uid() is null) and asks about the
--    organiser sent by send-blast, so it checks events.organizer_id itself. Body otherwise as 0143+.
create or replace function blast_email_recipients_for(p_blast_id uuid, p_organizer_id uuid)
returns table(email text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_event uuid; v_send_to text; v_channels text[];
begin
  -- Service role only, whatever the grants say: never as the anon or authenticated database role
  -- (the role PostgREST set for the request; SECURITY DEFINER does not change it).
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_organizer_id is null then raise exception 'not authenticated' using errcode = 'P0001'; end if;

  select event_id, send_to, channels into v_event, v_send_to, v_channels from event_blasts where id = p_blast_id;
  if v_event is null then raise exception 'blast_not_found' using errcode = 'P0001'; end if;
  -- send-blast checked this with the same verified id; checked again so the function is safe alone.
  if not exists (select 1 from events where id = v_event and organizer_id = p_organizer_id) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  -- A WhatsApp-only blast has no email recipients, whoever asks.
  if not ('email' = any(v_channels)) then return; end if;

  return query
  select distinct au.email::text
  from _blast_audience(v_event, v_send_to) a(uid)
  join user_settings us on us.user_id = a.uid and us.notifications_email
  join auth.users au on au.id = a.uid
  where au.email is not null;
end; $$;

-- 4. group_community_id(g) told any caller a private group's community. Replace its two policy uses
--    with a helper that only describes the caller. unarchive_group (definer) keeps calling it.
create function is_community_admin_of_group(g uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from groups gr
    join community_members cm on cm.community_id = gr.community_id
    where gr.id = g and cm.user_id = auth.uid() and cm.role = 'admin');
$$;
revoke execute on function is_community_admin_of_group(uuid) from public, anon;
grant execute on function is_community_admin_of_group(uuid) to authenticated;

alter policy "group_members: read" on group_members to authenticated
  using (is_group_member(group_id) or is_community_admin_of_group(group_id));
alter policy "group_departures: read" on group_departures to authenticated
  using (is_group_member(group_id) or is_community_admin_of_group(group_id));

revoke execute on function group_community_id(uuid) from public, anon, authenticated;

-- 5. Anon (and PUBLIC, which anon would keep access through, see 0136) loses the other ten.
revoke execute on function auth_tenant_ids() from public, anon;
revoke execute on function can_create_post(uuid) from public, anon;
revoke execute on function community_is_public(uuid) from public, anon;
revoke execute on function is_community_admin(uuid) from public, anon;
revoke execute on function is_community_member(uuid) from public, anon;
revoke execute on function is_group_admin(uuid, uuid) from public, anon;
revoke execute on function is_group_member(uuid) from public, anon;
revoke execute on function may_approve_requests(uuid) from public, anon;
revoke execute on function event_is_visible(uuid, uuid) from public, anon;
revoke execute on function is_event_organizer(uuid, uuid) from public, anon;

-- 6. Self-check, as 0136 and 0141.
do $$
declare
  fn text;
  helpers text[] := array[
    'auth_tenant_ids()', 'can_create_post(uuid)', 'community_is_public(uuid)', 'is_community_admin(uuid)',
    'is_community_member(uuid)', 'is_group_admin(uuid, uuid)', 'is_group_member(uuid)',
    'may_approve_requests(uuid)', 'event_is_visible(uuid, uuid)', 'is_event_organizer(uuid, uuid)',
    'group_community_id(uuid)'];
  n int;
begin
  foreach fn in array helpers loop
    if has_function_privilege('anon', 'public.' || fn, 'execute') then
      raise exception 'anon can still execute %', fn; end if;
    if fn <> 'group_community_id(uuid)' and not has_function_privilege('authenticated', 'public.' || fn, 'execute') then
      raise exception 'authenticated lost %', fn; end if;
  end loop;
  if has_function_privilege('authenticated', 'public.group_community_id(uuid)', 'execute') then
    raise exception 'authenticated can still execute group_community_id'; end if;
  if has_function_privilege('anon', 'public.is_community_admin_of_group(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.is_community_admin_of_group(uuid)', 'execute') then
    raise exception 'is_community_admin_of_group grants are wrong'; end if;
  select count(*) into n from pg_policies
   where schemaname = 'public' and (roles && array['public', 'anon']::name[])
     and coalesce(qual, '') || coalesce(with_check, '') ~ '\m(auth_tenant_ids|can_create_post|community_is_public|is_community_admin|is_community_member|is_group_admin|is_group_member|may_approve_requests|event_is_visible|is_event_organizer|group_community_id|is_community_admin_of_group)\M';
  if n > 0 then raise exception '% policies still call an RLS helper for public or anon', n; end if;
end $$;
