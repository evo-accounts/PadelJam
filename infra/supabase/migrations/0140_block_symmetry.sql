-- Blocks work in both directions again. Someone who has been blocked can no longer read the
-- blocker's profile row, find the blocker in the invite search, list who follows the blocker or whom
-- the blocker follows, attach themselves to the blocker with a direct follow, or write a block row
-- past block_user. The screens that read names through a SECURITY DEFINER function (the emailed
-- roster CSV, join and partner requests, the organizer's activity feed, a player's recent results)
-- now hide a person blocked with the viewer, the same way the profile embeds do. Found while
-- triaging Supabase's SECURITY DEFINER warnings, and in review. Each case was reproduced in a
-- throwaway copy of the schema (begin … rollback).
--
-- THE MODEL (0055, UX-PROF-03). A block hides each person from the other, whoever placed it, and
-- admins and organizers are no exception. get_player_profile returns zero rows in either direction,
-- and the requirement says "a user who has blocked the current user does not appear in search
-- results or listings at all". Nine places still let the BLOCKED person see or reach the blocker, or
-- showed an admin or organizer the name of a member who had blocked them.
--
-- 1. "profiles: read" never matched for the blocked person (LOW).
--    0055's policy hid a row when
--      exists (select 1 from blocks b where (b.blocker_id = auth.uid() and b.blocked_id = profiles.id)
--                                         or (b.blocker_id = profiles.id and b.blocked_id = auth.uid()))
--    That subquery runs under the caller's own row-level security, and "blocks: all"
--    (blocker_id = auth.uid()) shows a user only the blocks THEY placed. So when A blocks B, B's
--    subquery never sees A's row and the second half is always false. B therefore reads A's whole
--    profile (name, avatar, description, location, preferences) through every direct read:
--    useSearchProfiles in the invite pickers (a plain `profiles` ilike, so A turned up in B's search)
--    and every `profiles(...)` embed on rosters, member lists, posts and comments. A's half worked,
--    which hid the gap: 0102's header, profile-reads.test.mjs and social_graph.sql all assume both
--    halves hold.
--
--    The check is now is_blocked_with(id). It is SECURITY DEFINER, so it reads `blocks` as the owner
--    and sees rows in both directions. It is caller-relative on purpose: it takes ONE id and compares
--    it with auth.uid(), so all it can answer is "is there a block between me and this person". It
--    says nothing about two other people. notif_blocked(u1, u2) answers that question, which is why
--    0094 keeps it internal. It also tells a caller nothing new: get_player_profile already returns
--    zero rows, and follow_player already answers 'blocked', for exactly the same pairs. It must be
--    granted to authenticated, because Postgres checks EXECUTE as the role that evaluates the policy.
--
--    The policy is now TO authenticated instead of `using (auth.role() = 'authenticated' and …)`.
--    PostgREST sets the database role from that same JWT claim, so the two tests are equivalent. The
--    difference is anon. Postgres checks a function's EXECUTE privilege when it sets up the
--    expression, before the AND has a chance to skip it. A policy that applies to every role would
--    therefore make anon need EXECUTE too. Without it, an anon read of any table that embeds
--    profiles would fail with "permission denied for function" instead of returning nothing.
--    Scoping the policy to authenticated keeps anon exactly as before (no profile rows, no error)
--    and grants anon nothing.
--
-- 2. list_followers / list_following let a blocked person list the blocker's graph (LOW).
--    Both filtered blocks against each person LISTED but never against p_user, the person whose list
--    it is. So B, blocked by A, saw "no access" on A's profile but could still call
--    list_followers(A) and list_following(A). Both now return nothing when the caller and p_user are
--    blocked in either direction, which is what get_player_profile does. The profile screen calls
--    get_player_profile first and shows its "no access" state on zero rows, so no screen renders
--    differently. Each body is the live one (0102) with that one predicate added; everything else,
--    search_path included, is unchanged. Both functions run as the owner, so their own `blocks`
--    subqueries were always correct. They were never affected by (1).
--
-- 3. "follows: read" exposed the same graph to a direct read (LOW).
--    The policy was only `auth.role() = 'authenticated'`. With just (2), B could still read
--    `follows?followee_id=eq.<A>` and embed the followers' names. Now an edge is hidden from a caller
--    who is blocked with either end of it. No app screen reads `follows` directly: counts and lists
--    come from SECURITY DEFINER functions, and useFollow / useUnfollow only insert and delete the
--    caller's own edge (insert with return=minimal). So nothing visible changes for anyone outside a
--    block. TO authenticated, for the same reason as (1).
--
-- 4. "follows: insert" let either side of a block follow the other directly (LOW).
--    It checked only `follower_id = auth.uid()`. follow_player refuses a blocked pair with 'blocked',
--    but useFollow does not call follow_player: it inserts into `follows` directly. So B could follow
--    A after A blocked them (and A could follow B). notify_on_follow sends no notification for such a
--    pair, but the edge landed: it counted in A's followers_count, and a bystander saw B listed in
--    list_followers(A) — B attaching themselves, publicly, to the person who blocked them. After (3)
--    neither side could even see the edge to delete it. The policy now also requires
--    `not is_blocked_with(followee_id)`, so the insert fails with 42501 like any other RLS refusal.
--    No screen offers Follow on a blocked profile (it shows "no access"), so nobody legitimate hits
--    it. TO authenticated, as before in effect: anon never passed `follower_id = auth.uid()`.
--    Edges that got in this way before today are deleted below — the same delete block_user runs when
--    a block is placed — so the rule "no follow between a blocked pair" holds for existing rows too.
--
-- 5. "blocks: all" let a user write a block row directly, past block_user (LOW).
--    It was `for all using / with check (blocker_id = auth.uid())`, on every role, and the API roles
--    held every privilege on the table. So B, who already followed A, could POST /rest/v1/blocks
--    naming A. That skips block_user's follow delete: the B→A edge survived, kept counting in A's
--    followers_count and kept B in list_followers(A) for bystanders, while after (3) neither A nor B
--    could see it to remove it (B's own DELETE matched nothing under "follows: read"). The only
--    policy is now "blocks: read": the blocker reads the blocks they placed, as before. The API
--    roles keep SELECT on the table and nothing else. block_user and unblock_user (SECURITY DEFINER,
--    owned by postgres) are the only writers — plus soft_delete_account, which removes the blocks a
--    deleted account placed (0143) — so with (4) no API path can leave a follow edge between
--    a blocked pair. A direct DELETE (an unblock that skips unblock_user) is refused too: it was
--    harmless, but unblock_user is the one way out as block_user is the one way in.
--    Checked: the apps call only block_user and unblock_user (packages/api/src/profile/mutations.ts),
--    and list_my_blocks for the Blocked users screen. Nothing in apps/, packages/ or the edge
--    functions reads or writes `blocks` directly. The audit seed's insert and purge, and the REST
--    tests' fixtures, use the service role, which this does not touch.
--
-- 6. event_roster_csv named a participant who had blocked the organizer (LOW).
--    "Email CSV to me" (send-roster-csv, which calls this with the organizer's JWT) built the name
--    column from profiles with no block check. So the emailed file carried the name that the
--    downloaded one leaves empty: buildRosterCsv builds the download from the roster embed, which
--    (1) nulls. Any organizer could also fetch it straight from the API. A member blocked with the
--    caller either way now gets '' here too, exactly what the download writes. The row itself
--    (status, payment) stays, so the organizer can still reconcile it.
--
-- 7. incoming_partner_requests named a requester blocked with the caller (LOW).
--    Both branches returned requester_name and requester_avatar straight from profiles. The community
--    branch had no block check at all, and join_community still answers 'requested' across a block.
--    The event branch had none for a request left pending from before a block, since block_user does
--    not close it. So an admin saw the same join request nameless in manage requests (the embed) and
--    named on the notifications' requests screen. Both fields now come back null for a requester
--    blocked with the caller either way, and both clients already show '—'. The row stays, so the
--    admin can still accept or decline a join request and the target can decline a partner request
--    (accepting one answers request_stale across a block, as before).
--
-- 8. The organizer's activity feed named a player blocked with the organizer (LOW).
--    event_activity.detail.target_name is a snapshot of profiles.full_name. Two kinds of writer put
--    it there: the three activity triggers (_activity_on_participant, _activity_on_invitation,
--    _activity_on_partner_request), and the organizer's own roster actions. Those go through
--    _participant_label (mark_paid, organizer_assign_to_team, organizer_remove_participant,
--    _organizer_confirm_row) or read the name inline (organizer_remove_from_team,
--    organizer_revoke_invitation). None of them checked blocks. "activity: read" lets the organizer
--    select those rows directly (useEventActivity). Only the organizer can: is_event_organizer is
--    events.organizer_id, and there are no co-organizers to mask for. So a player who blocked the
--    organizer and then left showed as "Rita left", next to an actor embed that came back null.
--    Every writer now leaves target_name empty when the event's organizer and the named player are
--    blocked either way (notif_blocked); activityLine falls back to '—' / activitySomeone. This is
--    decided when the entry is written. Entries from before a block keep the name, as
--    notifications.actor_name does, and unblocking does not bring back a name that was hidden. Guests
--    have no account and keep their names.
--
-- 9. player_recent_results named a co-player blocked with the viewer (LOW).
--    It checked blocks between the viewer and p_user only. The partners and opponents in
--    side_a_names / side_b_names came straight from profiles. So a match on Bob's profile named Dana
--    to Alice even though Dana had blocked her, and event_result_summary (0139) already shows Dana to
--    Alice as '—' for the same event. A co-player blocked with the viewer either way now reads '—'
--    and sorts last on their side. Guests keep their names.
--
-- CHECKED. Only "profiles: read" had a raw `blocks` subquery in a policy (pg_policies). Every
-- function that reads `blocks` (18 live, from pg_proc.prosrc, plus is_blocked_with) is SECURITY
-- DEFINER and owned by postgres, so none of them is subject to blocks RLS.
-- Of the functions that take another user's id:
--   * get_player_profile, player_badge_facts and my_groups already check it against p_user;
--   * player_recent_results checks p_user, and with (9) every co-player too;
--   * list_followers / list_following are fixed in (2);
--   * invite_to_group and invite_to_community do NOT check. They take invitee ids and ignore blocks,
--     whereas invite_to_event refuses a blocked invitee (0122). So a blocked person can still send
--     the blocker an invitation through the API; the invite pickers stop listing the blocker after
--     (1). The check belongs in 0141 (status gaps, section 6), which owns the last definition of
--     invite_to_community: it refuses such an invitee with 'blocked', as invite_to_event does. It
--     is not repeated here.
-- The name-returning functions executable by authenticated that never mention blocks:
--   * covered above: event_roster_csv (6), incoming_partner_requests (7), and the organizer actions
--     in (8);
--   * clean through a helper: event_partner_candidates (_partner_available calls notif_blocked) and
--     search_suggest (search_players);
--   * read only the caller's own name, for notifications: archive_group, cancel_event,
--     request_partner;
--   * event_result_summary is 0139's.
-- "follows: delete" (follower_id = auth.uid()) is unchanged: unfollowing is never refused for a
-- block.
--
-- WHAT A BLOCKED PERSON NOW SEES. The blocker's row behaves exactly as the blocked person's row
-- already did for the blocker: embeds come back null, the invite search skips it, and
-- get_player_profile still returns zero rows. Every screen already handles that null, because it has
-- always happened in the blocker's direction. That includes admins and organizers (a product
-- decision). A member who blocks a community admin or an event organizer shows to that admin as a
-- nameless, avatar-less row the admin can still act on. That holds in community member lists, join
-- requests (manage requests and, with (7), the notifications' requests screen), posts, comments,
-- reviews, rosters, the roster CSV (6) and the organizer's share card (0139). The organizer's
-- activity feed no longer names them (8), and nor does anyone's recent results (9).
-- Group member lists are different. group_member_list has always OMITTED a blocked pair's row
-- entirely ("neither side lists the other"), so a group admin blocked by a member does not see that
-- member on the group screen and cannot remove them there. That predates this file and is unchanged
-- (see NOT HERE).
-- The other way round, a participant the organizer blocked loses the organizer card and the "chat
-- with organizer" button, which already happens when the organizer embed is null.
--
-- CLIENTS. Nothing to change, and build 17 is covered: every screen involved already renders a null
-- name or avatar, and no client writes `blocks` except through block_user / unblock_user.
--
-- ADVISOR. is_blocked_with is a new SECURITY DEFINER function in `public` that authenticated may
-- execute, so the security advisor gains ONE expected WARN (lint 0029,
-- authenticated_security_definer_function_executable), and it has a /rest/v1/rpc/is_blocked_with
-- endpoint. That is the same standing as the other RLS helpers (is_community_member,
-- event_is_visible): a policy can only call what its role may execute. It leaks nothing new (see 1);
-- a bystander gets false for both people in a pair, and anon gets "permission denied". Nothing else
-- here is new: every other function is CREATE OR REPLACE of a live one.
--
-- GRANTS. CREATE OR REPLACE keeps a function's ACL. Each one is restated anyway, so this file means
-- the same thing wherever it runs:
--   * signed-in only: list_followers, list_following, event_roster_csv, incoming_partner_requests,
--     player_recent_results, organizer_remove_from_team, organizer_revoke_invitation;
--   * no API role: the three trigger functions and _participant_label (0094/0122's rule for
--     internal helpers).
-- Nothing 0136 revoked is granted back.
--
-- COST. A SECURITY DEFINER function is never inlined, so the policies call it once per row they
-- test: about 9 µs a call. A lookup by id or an embed tests one row, so the cost is nothing.
-- A filter Postgres cannot apply before RLS (useSearchProfiles' ilike is not leakproof) tests every
-- row it scans: about 0.2 s per 20,000 profiles in a sandbox, against 0.03 s before. That is fine at
-- today's size. If it ever matters, the fix is a set-returning helper in a schema PostgREST does not
-- expose, evaluated once per query. It must not live in public, where any user could call it to
-- list who blocked them. The functions in (6)–(9) make one such call per row they return or write:
-- a roster, a request list, a match.
--
-- NOT HERE (separate changes):
--   * invite_to_group / invite_to_community refusing an invitee blocked either way with 'blocked',
--     as invite_to_event does: 0141 section 6 (see CHECKED).
--   * group_member_list omits a blocked pair instead of masking it, so a group admin cannot remove,
--     from the group screen, a member who blocked them. If admins should be able to act on that row,
--     the follow-up is to mask rather than omit when the caller is a group admin.
--   * Account deletion keeping the blocks other people placed on the account: 0143, with the
--     delete-account edge function.
--   * Activity entries and notifications written before a block keep the name they were written
--     with. Scrubbing them when a block is placed would be a data change of its own.
--   * The service role (seeds, tests) can still insert a block directly and skip block_user's follow
--     delete. Re-running this file deletes any such edge (4).

-- 1. The helper, and "profiles: read" ------------------------------------------------------------
create or replace function public.is_blocked_with(p_other uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  -- Either direction, always relative to the caller. When auth.uid() is null (anon, service_role,
  -- a trigger outside a request), nothing matches, so the answer is false.
  select exists (
    select 1 from public.blocks b
     where (b.blocker_id = auth.uid() and b.blocked_id = p_other)
        or (b.blocker_id = p_other and b.blocked_id = auth.uid())
  );
$$;
comment on function public.is_blocked_with(uuid) is
  'True when the caller and p_other are blocked in either direction. Caller-relative; used by the profiles and follows policies and by the name-returning functions in 0140.';
-- Postgres grants EXECUTE to PUBLIC on every new function (and 0030's default privileges add anon
-- and authenticated). Named explicitly so the result is the same whatever the defaults are.
revoke execute on function public.is_blocked_with(uuid) from public, anon;
grant  execute on function public.is_blocked_with(uuid) to authenticated;

drop policy if exists "profiles: read" on public.profiles;
create policy "profiles: read" on public.profiles for select to authenticated
  using (not public.is_blocked_with(id));

-- 2. list_followers / list_following ---------------------------------------------------------------
-- The live bodies (0102), with the p_user predicate added. search_path stays as it was.
create or replace function public.list_followers(
  p_user   uuid,
  p_search text    default null,
  p_limit  integer default 20,
  p_offset integer default 0
)
returns table (id uuid, full_name text, avatar_url text, is_following boolean, is_followed_by boolean)
language sql stable security definer set search_path = public
as $$
  select p.id, p.full_name, p.avatar_url,
         exists (select 1 from follows f2 where f2.follower_id = auth.uid() and f2.followee_id = p.id),
         exists (select 1 from follows f2 where f2.follower_id = p.id and f2.followee_id = auth.uid())
  from follows f
  join profiles p on p.id = f.follower_id
  where f.followee_id = p_user
    and (p_search is null or p.full_name ilike '%' || p_search || '%')
    -- Each listed person, either direction (0102).
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
    -- The person whose list it is, either direction (0140), the same as get_player_profile.
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p_user)
         or (b.blocker_id = p_user and b.blocked_id = auth.uid())
    )
  order by p.full_name
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

create or replace function public.list_following(
  p_user   uuid,
  p_search text    default null,
  p_limit  integer default 20,
  p_offset integer default 0
)
returns table (id uuid, full_name text, avatar_url text, is_following boolean, is_followed_by boolean)
language sql stable security definer set search_path = public
as $$
  select p.id, p.full_name, p.avatar_url,
         exists (select 1 from follows f2 where f2.follower_id = auth.uid() and f2.followee_id = p.id),
         exists (select 1 from follows f2 where f2.follower_id = p.id and f2.followee_id = auth.uid())
  from follows f
  join profiles p on p.id = f.followee_id
  where f.follower_id = p_user
    and (p_search is null or p.full_name ilike '%' || p_search || '%')
    -- Each listed person, either direction (0102).
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
    -- The person whose list it is, either direction (0140), the same as get_player_profile.
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p_user)
         or (b.blocker_id = p_user and b.blocked_id = auth.uid())
    )
  order by p.full_name
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

revoke execute on function public.list_followers(uuid, text, integer, integer) from public, anon;
grant  execute on function public.list_followers(uuid, text, integer, integer) to authenticated;
revoke execute on function public.list_following(uuid, text, integer, integer) from public, anon;
grant  execute on function public.list_following(uuid, text, integer, integer) to authenticated;

-- 3. follows: read ---------------------------------------------------------------------------------
drop policy if exists "follows: read" on public.follows;
create policy "follows: read" on public.follows for select to authenticated
  using (not public.is_blocked_with(follower_id) and not public.is_blocked_with(followee_id));

-- 4. follows: insert, and the edges that got in before it ------------------------------------------
drop policy if exists "follows: insert" on public.follows;
create policy "follows: insert" on public.follows for insert to authenticated
  with check (follower_id = auth.uid() and not public.is_blocked_with(followee_id));

-- The same delete block_user runs when a block is placed, for every pair at once. Only edges a
-- direct insert slipped past a block: block_user removed everything else at block time.
delete from public.follows f
 using public.blocks b
 where (b.blocker_id = f.follower_id and b.blocked_id = f.followee_id)
    or (b.blocker_id = f.followee_id and b.blocked_id = f.follower_id);

-- 5. blocks: the blocker reads, block_user / unblock_user write ------------------------------------
drop policy if exists "blocks: all" on public.blocks;
drop policy if exists "blocks: read" on public.blocks;
create policy "blocks: read" on public.blocks for select to authenticated
  using (blocker_id = auth.uid());
-- ALL covers MAINTAIN where the server has it (17+) and is valid on older servers too. SELECT goes
-- back to both API roles: anon has no policy, so it still reads nothing, without an error.
revoke all on public.blocks from public, anon, authenticated;
grant select on public.blocks to anon, authenticated;

-- 6. event_roster_csv ------------------------------------------------------------------------------
-- The live body, with the name masked.
create or replace function public.event_roster_csv(p_event_id uuid)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_fee numeric; v_body text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  v_fee := case when v_ev.entrance_fee_enabled then coalesce(v_ev.entrance_fee_amount, 0) else 0 end;

  select string_agg(
           -- 0140: no name for a member blocked with the organizer either way, which is what the
           -- downloaded CSV (buildRosterCsv, from the roster embed) writes for them.
           _csv_field(case when is_blocked_with(ep.user_id) then ''
                           else coalesce(pr.full_name, ep.guest_name, '') end) || ',' ||
           (case when ep.user_id is not null then 'member' else 'manual' end) || ',' ||
           ep.status || ',' || lower(ep.is_standby::text) || ',' ||
           coalesce(ep.joined_at::text,'') || ',' || coalesce(ep.confirmed_at::text,'') || ',' ||
           lower(ep.has_paid::text) || ',' || coalesce(ep.paid_at::text,'') || ',' || trim_scale(v_fee)::text,
           E'\n' order by ep.joined_at asc)
    into v_body
  from event_participants ep
  left join profiles pr on pr.id = ep.user_id
  where ep.event_id = p_event_id;

  return 'name,user_type,status,is_standby,joined_at,confirmed_at,has_paid,paid_at,fee_amount'
         || coalesce(E'\n' || v_body, '');
end; $$;
revoke execute on function public.event_roster_csv(uuid) from public, anon;
grant  execute on function public.event_roster_csv(uuid) to authenticated;

-- 7. incoming_partner_requests ---------------------------------------------------------------------
-- The live body, with requester_name and requester_avatar masked in both branches.
create or replace function public.incoming_partner_requests()
returns table (kind text, request_id uuid, entity_id uuid, entity_name text, requester_id uuid,
               requester_name text, requester_avatar text, created_at timestamptz, starts_at timestamptz,
               venue_name text, venue_address text, manual_location_name text, manual_location_address text)
language sql stable security definer set search_path = public
as $$
  -- 0140: no name or avatar for a requester blocked with the caller either way. The row stays, so
  -- it can still be answered.
  select 'event'::text, pr.id, e.id, e.name, p.id,
         case when is_blocked_with(p.id) then null else p.full_name end,
         case when is_blocked_with(p.id) then null else p.avatar_url end,
         pr.created_at,
         e.starts_at, v.name, v.address, e.manual_location_name, e.manual_location_address
  from partner_requests pr
  join events e   on e.id = pr.event_id
  join profiles p on p.id = pr.requester_id
  left join venues v on v.id = e.venue_id
  where pr.target_id = auth.uid() and pr.status = 'pending'
  union all
  select 'community'::text, jr.id, c.id, c.name, p.id,
         case when is_blocked_with(p.id) then null else p.full_name end,
         case when is_blocked_with(p.id) then null else p.avatar_url end,
         jr.created_at,
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
revoke execute on function public.incoming_partner_requests() from public, anon;
grant  execute on function public.incoming_partner_requests() to authenticated;

-- 8. The organizer's activity feed -----------------------------------------------------------------
-- Live bodies. The only change in each is that the name is not read when the event's organizer
-- (the one reader of event_activity) and the named player are blocked either way.
create or replace function public._activity_on_participant()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_actor uuid := auth.uid(); v_org uuid; v_row event_participants%rowtype;
        v_action text; v_name text;
begin
  if TG_OP = 'DELETE' then v_row := OLD; else v_row := NEW; end if;
  if v_row.user_id is null or v_actor is null then return null; end if;
  select organizer_id into v_org from events where id = v_row.event_id;
  if v_org is null then return null; end if;
  if v_actor = v_org and v_row.user_id <> v_org then return null; end if;

  if TG_OP = 'INSERT' then
    v_action := case NEW.status when 'confirmed' then 'joined' when 'waiting_list' then 'waitlist_joined' end;
  elsif TG_OP = 'UPDATE' then
    if NEW.status is not distinct from OLD.status then return null; end if;
    v_action := case
      when NEW.status = 'confirmed' and OLD.status = 'waiting_list' then 'waitlist_claimed'
      when NEW.status = 'confirmed' then 'joined'
      when NEW.status = 'waiting_list' then 'waitlist_joined' end;
  else
    -- Only the player's own leave: a partner dropped with them is told by partner_left.
    if v_actor <> OLD.user_id then return null; end if;
    v_action := 'left';
  end if;
  if v_action is null then return null; end if;

  -- 0140: no name for a player blocked with the organizer either way.
  if not notif_blocked(v_org, v_row.user_id) then
    select full_name into v_name from profiles where id = v_row.user_id;
  end if;
  perform _log_activity(v_row.event_id, v_row.user_id, v_action,
    jsonb_strip_nulls(jsonb_build_object(
      'target_name', v_name,
      'status', case when TG_OP = 'DELETE' then OLD.status end,
      'by', case when v_actor <> v_row.user_id then v_actor end)));
  return null;
end; $$;

create or replace function public._activity_on_invitation()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_actor uuid := auth.uid(); v_org uuid; v_name text;
begin
  if NEW.invitee_id is null then return null; end if;
  select organizer_id into v_org from events where id = NEW.event_id;
  if v_org is null then return null; end if;
  -- 0140: no name for an invitee blocked with the organizer either way.
  if not notif_blocked(v_org, NEW.invitee_id) then
    select full_name into v_name from profiles where id = NEW.invitee_id;
  end if;
  if TG_OP = 'INSERT' then
    -- Only an invitation the caller sends (or the scheduler, with no JWT): a partner's place reset
    -- to "invited" after the leaver took the team out (_reset_invitation_after_leave) is not one.
    if NEW.status = 'pending' and (v_actor is null or v_actor = NEW.invited_by) then
      perform _log_activity(NEW.event_id, NEW.invited_by, 'invited', jsonb_build_object('target_name', v_name));
    end if;
    return null;
  end if;
  if OLD.status <> 'pending' or NEW.status = OLD.status then return null; end if;
  -- The organizer accepting on someone's behalf (organizer_confirm_invitee) logs 'confirmed'.
  if v_actor is null or (v_actor = v_org and NEW.invitee_id <> v_org) then return null; end if;
  if NEW.status = 'accepted' then
    perform _log_activity(NEW.event_id, NEW.invitee_id, 'invite_accepted', jsonb_build_object('target_name', v_name));
  elsif NEW.status = 'declined' then
    perform _log_activity(NEW.event_id, NEW.invitee_id, 'invite_declined', jsonb_build_object('target_name', v_name));
  end if;
  return null;
end; $$;

create or replace function public._activity_on_partner_request()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_req text; v_tgt text; v_org uuid;
begin
  -- 0140: no name for either player when they are blocked with the organizer either way.
  select organizer_id into v_org from events where id = NEW.event_id;
  if not notif_blocked(v_org, NEW.requester_id) then
    select full_name into v_req from profiles where id = NEW.requester_id;
  end if;
  if not notif_blocked(v_org, NEW.target_id) then
    select full_name into v_tgt from profiles where id = NEW.target_id;
  end if;
  if NEW.status = 'pending' and (TG_OP = 'INSERT' or OLD.status <> 'pending') then
    perform _log_activity(NEW.event_id, NEW.requester_id, 'partner_invite_sent', jsonb_build_object('target_name', v_tgt));
  elsif TG_OP = 'UPDATE' and OLD.status = 'pending' and NEW.status = 'accepted' then
    perform _log_activity(NEW.event_id, NEW.target_id, 'partner_invite_accepted', jsonb_build_object('target_name', v_req));
  elsif TG_OP = 'UPDATE' and OLD.status = 'pending' and NEW.status = 'declined' and not NEW.closed_by_system then
    perform _log_activity(NEW.event_id, NEW.target_id, 'partner_invite_declined', jsonb_build_object('target_name', v_req));
  end if;
  return null;
end; $$;

-- The organizer's roster actions. _participant_label is only ever written into target_name.
create or replace function public._participant_label(p_pid uuid)
returns text
language sql stable security definer set search_path = public
as $$
  -- 0140: no label for a member blocked with the event's organizer either way. A guest has no
  -- user_id, so no block can match them.
  select case when notif_blocked(e.organizer_id, ep.user_id) then null
              else coalesce(p.full_name, ep.guest_name) end
  from event_participants ep
  join events e on e.id = ep.event_id
  left join profiles p on p.id = ep.user_id where ep.id = p_pid;
$$;

create or replace function public.organizer_remove_from_team(p_event_id uuid, p_participant_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform _organizer_roster_guard(p_event_id);                                        -- NEW (B2; was the bare lock)
  if not exists (select 1 from event_participants where id = p_participant_id and event_id = p_event_id) then
    raise exception 'participant_not_found' using errcode='P0001'; end if;           -- NEW (B3)
  perform _clear_team_slot(p_event_id, p_participant_id);
  update event_participants
    set status='invited', confirmed_at=null, waiting_list_position=null, is_standby=false
    where id = p_participant_id and event_id = p_event_id;
  -- 0140: v_user is the organizer; no name for a member blocked with them either way.
  insert into event_activity (event_id, actor_id, action, detail)
  select p_event_id, v_user, 'team_removed', jsonb_build_object('target_name',
           case when notif_blocked(v_user, ep.user_id) then null else coalesce(p.full_name, ep.guest_name) end)
  from event_participants ep left join profiles p on p.id = ep.user_id where ep.id = p_participant_id;
end; $$;

create or replace function public.organizer_revoke_invitation(p_event_id uuid, p_invitation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid(); v_inv event_invitations%rowtype; v_name text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from events where id = p_event_id and deleted_at is null) then
    raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform _organizer_roster_guard(p_event_id);

  select * into v_inv from event_invitations
    where id = p_invitation_id and event_id = p_event_id and status = 'pending' for update;
  if v_inv.id is null then raise exception 'invitation_not_found' using errcode='P0001'; end if;
  if v_inv.invitee_id is not null and exists (
       select 1 from event_participants where event_id = p_event_id and user_id = v_inv.invitee_id) then
    raise exception 'invitee_in_roster' using errcode='P0001'; end if;

  -- 0140: v_user is the organizer; no name for an invitee blocked with them either way.
  select case when notif_blocked(v_user, v_inv.invitee_id) then null
              else coalesce(p.full_name, v_inv.invitee_name) end into v_name
    from (select 1) one left join profiles p on p.id = v_inv.invitee_id;

  delete from event_invitations where id = v_inv.id;
  if v_inv.invitee_id is not null then
    -- Its Join CTA would now answer invitation_not_found: settled, not deleted (it happened).
    update notifications set cta_done = true, read_at = coalesce(read_at, now())
      where event_id = p_event_id and user_id = v_inv.invitee_id and type = 'event_invite' and not cta_done;
  end if;
  perform _log_activity(p_event_id, v_user, 'removed',
    jsonb_build_object('target_name', v_name, 'mode', 'invitation'));
end; $$;

revoke execute on function public._activity_on_participant() from public, anon, authenticated;
revoke execute on function public._activity_on_invitation() from public, anon, authenticated;
revoke execute on function public._activity_on_partner_request() from public, anon, authenticated;
revoke execute on function public._participant_label(uuid) from public, anon, authenticated;
revoke execute on function public.organizer_remove_from_team(uuid, uuid) from public, anon;
grant  execute on function public.organizer_remove_from_team(uuid, uuid) to authenticated;
revoke execute on function public.organizer_revoke_invitation(uuid, uuid) from public, anon;
grant  execute on function public.organizer_revoke_invitation(uuid, uuid) to authenticated;

-- 9. player_recent_results -------------------------------------------------------------------------
-- The live body (0113), with each co-player's name masked.
create or replace function public.player_recent_results(p_user uuid, p_limit integer default 5)
returns table (match_id uuid, event_id uuid, event_name text, played_at timestamptz, court_label text,
               side_a_score integer, side_b_score integer, player_side text,
               side_a_names text[], side_b_names text[])
language sql stable security definer set search_path = public
as $$
  with mine as (
    select m.id, m.event_id, m.court_id, m.court_number,
           m.side_a_score, m.side_b_score, m.submitted_at, mp.side
    from match_players mp
    join event_participants ep on ep.id = mp.participant_id and ep.user_id = p_user
    join event_matches m       on m.id = mp.match_id
    where m.status = 'played'
      and m.side_a_score is not null
      and m.side_b_score is not null
      and event_is_visible(m.event_id, auth.uid())
      and not exists (
        select 1 from blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = p_user)
           or (b.blocker_id = p_user and b.blocked_id = auth.uid())
      )
  ),
  names as (
    select mp.match_id, mp.side,
           -- A roster can hold guests, who have a name but no account. 0140: a co-player blocked
           -- with the viewer either way reads '—' and sorts last, as in event_result_summary.
           array_agg(case when is_blocked_with(ep.user_id) then '—'
                          else coalesce(p.full_name, ep.guest_name, '—') end
                     order by case when is_blocked_with(ep.user_id) then null
                                   else coalesce(p.full_name, ep.guest_name) end) as names
    from match_players mp
    join event_participants ep on ep.id = mp.participant_id
    left join profiles p       on p.id = ep.user_id
    where mp.match_id in (select id from mine)
    group by mp.match_id, mp.side
  )
  select mine.id, mine.event_id, e.name,
         coalesce(mine.submitted_at, e.starts_at),
         coalesce(ct.name, 'Court ' || mine.court_number),
         mine.side_a_score, mine.side_b_score, mine.side,
         coalesce(na.names, '{}'), coalesce(nb.names, '{}')
  from mine
  join events e      on e.id = mine.event_id
  left join courts ct on ct.id = mine.court_id
  left join names na on na.match_id = mine.id and na.side = 'a'
  left join names nb on nb.match_id = mine.id and nb.side = 'b'
  order by coalesce(mine.submitted_at, e.starts_at) desc
  limit greatest(p_limit, 0);
$$;
revoke execute on function public.player_recent_results(uuid, integer) from public, anon;
grant  execute on function public.player_recent_results(uuid, integer) to authenticated;

-- Self-check, in the spirit of 0094/0097/0101/0132–0136. Catalog state only, plus one invariant on
-- existing rows: proving the exploits fail needs several users and a block, which is what the REST
-- test (infra/supabase/tests/block-symmetry.test.mjs) does on a scratch stack. The hosted database
-- is updated by pasting this file into the dashboard SQL editor, which runs the paste as one
-- transaction: if this raises, nothing above it lands. Function bodies are compared with comments
-- stripped and whitespace collapsed, so a commented-out or one-directional predicate fails, and so
-- does any function put back to its live (pre-0140) body.
do $$
declare
  v_src text;
  v_fn text;
  v_bad text[] := '{}';
  v_role text;
  v_priv text;
  v_pred constant text :=
    'and not exists \( select 1 from blocks b where \(b\.blocker_id = auth\.uid\(\) and b\.blocked_id = p_user\) '
    || 'or \(b\.blocker_id = p_user and b\.blocked_id = auth\.uid\(\)\) \)';
begin
  -- 1. The helper exists, runs as the owner with a pinned search_path, and checks BOTH directions
  --    against the caller. One direction only (the 0055 bug, moved into a function) fails here.
  if not exists (
    select 1 from pg_proc p
     where p.oid = 'public.is_blocked_with(uuid)'::regprocedure
       and p.prosecdef and p.provolatile = 's'
       and pg_get_userbyid(p.proowner) = 'postgres'
       and p.proconfig @> array['search_path=""']
  ) then
    raise exception 'is_blocked_with is missing, not SECURITY DEFINER/STABLE, not owned by postgres or has no empty search_path';
  end if;
  select btrim(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
    into v_src from pg_proc where oid = 'public.is_blocked_with(uuid)'::regprocedure;
  if v_src is distinct from
       'select exists ( select 1 from public.blocks b where (b.blocker_id = auth.uid() and b.blocked_id = p_other) '
       || 'or (b.blocker_id = p_other and b.blocked_id = auth.uid()) );' then
    raise exception 'is_blocked_with no longer checks both directions against the caller (body: %)', v_src;
  end if;
  if has_function_privilege('anon', 'public.is_blocked_with(uuid)', 'execute') then
    raise exception 'anon (or PUBLIC) can execute is_blocked_with';
  end if;
  if not has_function_privilege('authenticated', 'public.is_blocked_with(uuid)', 'execute') then
    raise exception 'authenticated cannot execute is_blocked_with: every profiles and follows read would fail';
  end if;

  -- 1, 3, 4. The three policies are exactly what this file wrote: permissive, authenticated only,
  --          and NOT is_blocked_with(…). An inverted policy (without the NOT) fails the anchored
  --          pattern. pg_get_expr prints `public.` only when public is not on the search_path, so
  --          it is optional.
  if not exists (
    select 1 from pg_policy
     where polrelid = 'public.profiles'::regclass and polname = 'profiles: read' and polcmd = 'r'
       and polpermissive and polroles = array['authenticated'::regrole]::oid[]
       and pg_get_expr(polqual, polrelid) ~ '^\(NOT (public\.)?is_blocked_with\(id\)\)$'
  ) then
    raise exception '"profiles: read" is missing, not scoped to authenticated, or is not exactly NOT is_blocked_with(id)';
  end if;
  if not exists (
    select 1 from pg_policy
     where polrelid = 'public.follows'::regclass and polname = 'follows: read' and polcmd = 'r'
       and polpermissive and polroles = array['authenticated'::regrole]::oid[]
       and pg_get_expr(polqual, polrelid)
           ~ '^\(\(NOT (public\.)?is_blocked_with\(follower_id\)\) AND \(NOT (public\.)?is_blocked_with\(followee_id\)\)\)$'
  ) then
    raise exception '"follows: read" is missing, not scoped to authenticated, or does not hide edges touching a blocked pair at both ends';
  end if;
  if not exists (
    select 1 from pg_policy
     where polrelid = 'public.follows'::regclass and polname = 'follows: insert' and polcmd = 'a'
       and polpermissive and polroles = array['authenticated'::regrole]::oid[]
       and pg_get_expr(polwithcheck, polrelid)
           ~ '^\(\(follower_id = auth\.uid\(\)\) AND \(NOT (public\.)?is_blocked_with\(followee_id\)\)\)$'
  ) then
    raise exception '"follows: insert" is missing, not scoped to authenticated, or lets a blocked pair follow each other';
  end if;
  -- Permissive policies OR together: a second SELECT (or ALL) policy would hand the rows back, and
  -- a second INSERT (or ALL) policy would let the blocked insert through.
  if (select count(*) from pg_policy where polrelid = 'public.profiles'::regclass and polcmd in ('r', '*')) <> 1
     or (select count(*) from pg_policy where polrelid = 'public.follows'::regclass and polcmd in ('r', '*')) <> 1
     or (select count(*) from pg_policy where polrelid = 'public.follows'::regclass and polcmd in ('a', '*')) <> 1 then
    raise exception 'a second SELECT/INSERT/ALL policy on profiles or follows would OR the blocked rows back in';
  end if;
  -- No policy outside blocks itself may subquery blocks directly: under the caller's RLS it only
  -- sees the caller's own blocks, which is the bug (1) fixed.
  if exists (
    select 1 from pg_policy pol
     where pol.polrelid <> 'public.blocks'::regclass
       and (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ~* '\mblocks\M'
            or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~* '\mblocks\M')
  ) then
    raise exception 'a policy still reads blocks under the caller''s RLS: use is_blocked_with instead';
  end if;
  -- (4)'s delete ran: no follow edge joins two people blocked in either direction.
  if exists (
    select 1 from public.follows f
      join public.blocks b on (b.blocker_id = f.follower_id and b.blocked_id = f.followee_id)
                           or (b.blocker_id = f.followee_id and b.blocked_id = f.follower_id)
  ) then
    raise exception 'a follow edge still joins a blocked pair';
  end if;

  -- 2. list_followers / list_following return nothing when the caller and p_user are blocked either
  --    way — NOT EXISTS, both directions, joined by OR.
  foreach v_fn in array array['public.list_followers(uuid,text,integer,integer)',
                              'public.list_following(uuid,text,integer,integer)'] loop
    select regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')
      into v_src from pg_proc where oid = v_fn::regprocedure;
    if v_src !~ v_pred then
      raise exception '% lost the block check against p_user', v_fn;
    end if;
  end loop;

  -- 5. blocks: one policy, the blocker reading their own rows, and no write privilege for either API
  --    role, so block_user / unblock_user are the only way in or out.
  if (select count(*) from pg_policy where polrelid = 'public.blocks'::regclass) <> 1
     or not exists (
       select 1 from pg_policy
        where polrelid = 'public.blocks'::regclass and polname = 'blocks: read' and polcmd = 'r'
          and polpermissive and polroles = array['authenticated'::regrole]::oid[]
          and pg_get_expr(polqual, polrelid) = '(blocker_id = auth.uid())'
     ) then
    raise exception 'blocks must have exactly one policy, "blocks: read" (SELECT, authenticated, blocker_id = auth.uid()): a write policy lets a block skip block_user''s follow delete';
  end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_priv in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege(v_role, 'public.blocks', v_priv) then
        v_bad := v_bad || format('%s can %s blocks', v_role, v_priv);
      end if;
    end loop;
    if current_setting('server_version_num')::int >= 170000
       and has_table_privilege(v_role, 'public.blocks', 'MAINTAIN') then
      v_bad := v_bad || format('%s can MAINTAIN blocks', v_role);
    end if;
    if has_any_column_privilege(v_role, 'public.blocks', 'INSERT')
       or has_any_column_privilege(v_role, 'public.blocks', 'UPDATE') then
      v_bad := v_bad || format('%s holds a column INSERT/UPDATE grant on blocks', v_role);
    end if;
  end loop;
  if not has_table_privilege('authenticated', 'public.blocks', 'SELECT') then
    v_bad := v_bad || 'authenticated lost SELECT on blocks'::text;
  end if;
  -- …and the two writers still get past both: owned by postgres, SECURITY DEFINER, signed-in.
  foreach v_fn in array array['public.block_user(uuid)', 'public.unblock_user(uuid)'] loop
    if not exists (select 1 from pg_proc p where p.oid = v_fn::regprocedure and p.prosecdef
                     and pg_get_userbyid(p.proowner) = 'postgres')
       or not has_function_privilege('authenticated', v_fn, 'execute') then
      v_bad := v_bad || format('%s is no longer a signed-in, postgres-owned SECURITY DEFINER writer', v_fn);
    end if;
  end loop;
  if cardinality(v_bad) > 0 then
    raise exception 'blocks write path: %', array_to_string(v_bad, '; ');
  end if;

  -- 6–9. Each name-returning body masks with the block predicate this file wrote, and has no other
  --      read of the name. A body put back to its live (pre-0140) text fails here.
  select regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g') into v_src
    from pg_proc where oid = 'public.event_roster_csv(uuid)'::regprocedure;
  if v_src !~ '_csv_field\(case when (public\.)?is_blocked_with\(ep\.user_id\) then '''' else coalesce\(pr\.full_name, ep\.guest_name, ''''\) end\)'
     or (length(v_src) - length(replace(v_src, 'pr.full_name', ''))) / length('pr.full_name') <> 1 then
    raise exception 'event_roster_csv names a member blocked with the organizer (6)';
  end if;

  select regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g') into v_src
    from pg_proc where oid = 'public.incoming_partner_requests()'::regprocedure;
  if (length(v_src) - length(replace(v_src, 'case when is_blocked_with(p.id) then null else p.full_name end', '')))
       / length('case when is_blocked_with(p.id) then null else p.full_name end') <> 2
     or (length(v_src) - length(replace(v_src, 'case when is_blocked_with(p.id) then null else p.avatar_url end', '')))
       / length('case when is_blocked_with(p.id) then null else p.avatar_url end') <> 2
     or (length(v_src) - length(replace(v_src, 'p.full_name', ''))) / length('p.full_name') <> 2
     or (length(v_src) - length(replace(v_src, 'p.avatar_url', ''))) / length('p.avatar_url') <> 2 then
    raise exception 'incoming_partner_requests names a requester blocked with the caller, in one branch or both (7)';
  end if;

  foreach v_fn in array array['public._activity_on_participant()', 'public._activity_on_invitation()',
                              'public._activity_on_partner_request()'] loop
    select regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g') into v_src
      from pg_proc where oid = v_fn::regprocedure;
    -- Every read of a name sits directly under an `if not notif_blocked(v_org, <that player>)`.
    if (length(v_src) - length(replace(v_src, 'select full_name into', ''))) / length('select full_name into')
       <> (select count(*) from regexp_matches(v_src,
             'if not notif_blocked\(v_org, (v_row\.user_id|NEW\.invitee_id|NEW\.requester_id|NEW\.target_id)\) then select full_name into v_[a-z]+ from profiles where id = \1; end if;', 'g'))
       or v_src !~ 'notif_blocked\(v_org, ' then
      raise exception '% writes the name of a player blocked with the organizer into the activity feed (8)', v_fn;
    end if;
  end loop;
  select regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g') into v_src
    from pg_proc where oid = 'public._participant_label(uuid)'::regprocedure;
  if v_src !~ '^ ?select case when notif_blocked\(e\.organizer_id, ep\.user_id\) then null else coalesce\(p\.full_name, ep\.guest_name\) end from event_participants ep join events e on e\.id = ep\.event_id ' then
    raise exception '_participant_label names a member blocked with the organizer (8)';
  end if;
  select regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g') into v_src
    from pg_proc where oid = 'public.organizer_remove_from_team(uuid,uuid)'::regprocedure;
  if v_src !~ '''target_name'', case when notif_blocked\(v_user, ep\.user_id\) then null else coalesce\(p\.full_name, ep\.guest_name\) end\)'
     or (length(v_src) - length(replace(v_src, 'p.full_name', ''))) / length('p.full_name') <> 1 then
    raise exception 'organizer_remove_from_team names a member blocked with the organizer (8)';
  end if;
  select regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g') into v_src
    from pg_proc where oid = 'public.organizer_revoke_invitation(uuid,uuid)'::regprocedure;
  if v_src !~ 'select case when notif_blocked\(v_user, v_inv\.invitee_id\) then null else coalesce\(p\.full_name, v_inv\.invitee_name\) end into v_name'
     or (length(v_src) - length(replace(v_src, 'p.full_name', ''))) / length('p.full_name') <> 1 then
    raise exception 'organizer_revoke_invitation names an invitee blocked with the organizer (8)';
  end if;

  select regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g') into v_src
    from pg_proc where oid = 'public.player_recent_results(uuid,integer)'::regprocedure;
  if v_src !~ ('array_agg\(case when is_blocked_with\(ep\.user_id\) then ''—'' else coalesce\(p\.full_name, ep\.guest_name, ''—''\) end '
               || 'order by case when is_blocked_with\(ep\.user_id\) then null else coalesce\(p\.full_name, ep\.guest_name\) end\)')
     or (length(v_src) - length(replace(v_src, 'p.full_name', ''))) / length('p.full_name') <> 2
     or v_src !~ v_pred then
    raise exception 'player_recent_results names a co-player blocked with the viewer, or lost its p_user block check (9)';
  end if;

  -- Grants, as the header's GRANTS lists them. Nothing 0136 revoked is back.
  foreach v_fn in array array['public.list_followers(uuid,text,integer,integer)',
                              'public.list_following(uuid,text,integer,integer)',
                              'public.event_roster_csv(uuid)', 'public.incoming_partner_requests()',
                              'public.player_recent_results(uuid,integer)',
                              'public.organizer_remove_from_team(uuid,uuid)',
                              'public.organizer_revoke_invitation(uuid,uuid)'] loop
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'anon (or PUBLIC) can execute %', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'authenticated lost %, which the apps call', v_fn;
    end if;
  end loop;
  foreach v_fn in array array['public._activity_on_participant()', 'public._activity_on_invitation()',
                              'public._activity_on_partner_request()', 'public._participant_label(uuid)'] loop
    if has_function_privilege('anon', v_fn, 'execute') or has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'an API role can execute the internal %', v_fn;
    end if;
  end loop;
end $$;
