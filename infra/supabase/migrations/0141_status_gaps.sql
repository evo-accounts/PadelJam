-- Six gaps in SECURITY DEFINER bodies: checks on status, archive state, blocks and "who is asking"
-- that the bodies skipped. Found in the same triage as 0135/0136, each reproduced in a throwaway
-- copy of the schema (begin … rollback). A definer body runs as the tables' owner, so RLS and
-- grants do not apply inside it: whatever the body does not check, nobody checks. Every function
-- replaced below is its LIVE definition (pg_get_functiondef on a database with 0132–0136 applied —
-- accept_invitation and invite_to_community are 0135's merged bodies, c6d0e20f) with the check
-- added and nothing else changed, except that each now pins `search_path = public, pg_temp`
-- (pg_temp last, so a temporary object can never shadow a table these bodies name).
--
-- 1. post_event_result — a result post skipped "posts: create" and the archive (LOW).
--    It checked only that the caller organizes the event, then inserted into community_posts as the
--    owner, so the policy's can_create_post(community_id) — an admin, or a member while the
--    community's create_posts toggle is on — never ran. An organizer who had LEFT or been removed
--    from the community, or a member of a community whose admins switched member posts off, could
--    still put a post in its feed. It did not look at archived_at either, so an organizer — admin or
--    plain member — could post into an ARCHIVED community (UX-COMM-24: "nothing can be changed while
--    archived"). Reproduced all three. Now the organizer must be able to post there by the same rule
--    as any other post, and the community must not be archived. The refusal is the existing
--    'forbidden': the mobile share sheet ("Post to community feed") and the web completed-event page
--    ("Share results") both translate it already ("You do not have permission to perform this
--    action."). Neither app hides the button when the organizer cannot post — mobile even offers it
--    to non-organizers, who already get this same refusal today — so shipped builds show the
--    message, not a dead end.
--    Two more holes in the same body, closed here too:
--    * It never read events.deleted_at, so the organizer of a completed event that had been
--      soft-deleted could still post its result — a card 0139 renders as "result unavailable" the
--      moment it lands. Reproduced. Now refused right after the lookup, with the code finish_event
--      uses for a deleted event, 'event_not_found' (mapPgError knows it).
--    * 'already_posted' counted ANY post naming the event. Until 0137 any member who could post
--      could write kind = 'result' and any result_event_id, and an admin could rewrite any post,
--      author_id included, so a row planted before 0137 stopped that event's organizer for good.
--      Now only a post 0139's _event_result_posted_to would trust blocks a new one: kind 'result',
--      written by the event's organizer, in the event's own community, and never updated
--      (updated_at = created_at: trg_community_posts_updated_at stamps every UPDATE, and 0137 took
--      UPDATE away from the API roles, so only a pre-0137 edit — an admin re-signing a post, say —
--      fails it). The two rules must move together: a post that cannot unlock the result must not
--      lock the organizer out of posting the real one, and the one residual 0139 names (a pre-0137
--      re-sign that also reset created_at, leaving equal stamps) passes both alike, so a change to
--      either rule belongs in both files. An untrusted row stays in the feed reading
--      "result unavailable" until someone deletes it (0139's NOT HERE: the PR's read-only
--      pre-check lists them). community_posts has no unique index on result_event_id, so the
--      organizer's new row cannot hit a constraint. Local has 0 such rows; hosted is unchecked.
--
-- 2. generate_next_round — a round could be added to a FINISHED or DELETED event (LOW, integrity).
--    Nothing read events.status or deleted_at, so once the last round was scored the organizer could
--    add a new active round, with pending matches, to a completed event (finish_event then refused to
--    run again), or to an in-progress event that had been soft-deleted. Reproduced both. Now the
--    event must be in progress and not deleted, re-read under the lock, with the codes finish_event
--    uses (event_not_found / event_not_in_progress; both apps translate the second). The function
--    also takes finish_event's own lock, so a "Next round" and a "Finish" tapped together cannot
--    both pass the check: whichever runs second sees the other's result.
--    LOCK ORDER, from a scan of every advisory lock in public: start_event takes 'event_roster:' then
--    'event:'; generate_next_round now takes 'event:' then 'event:finish:'; finish_event takes only
--    'event:finish:'. Nothing finish_event calls or fires (events/group_event_results/notifications
--    triggers) takes an advisory lock, and generate_next_round does no write before it holds both,
--    so no function waits on 'event:' or 'event_roster:' while holding 'event:finish:' — there is no
--    cycle. (submit_score's 'match:' lock is never held together with any of these.)
--
-- 3. join_community / accept_invitation / accept_group_invitation — archived communities (LOW).
--    UX-COMM-24: an archived community or group is visible to its admins only and "nothing can be
--    changed while archived". RLS hides them, but these three bodies never looked: anyone holding
--    the id joined an archived public community, a request went into an archived request-to-join
--    queue, and a pending invitation — community or group — could still be accepted after the
--    archive. Reproduced all of them. 0135 already refuses join_group here; these now refuse the
--    same way, with the same 'forbidden', before anything is written. Pending invitations and
--    requests are left exactly as they were, so they work again if the community is unarchived.
--    Non-invitees still get 'invitation_not_found' first, so the archive is not revealed to them.
--    'forbidden', NOT 'community_not_found', on purpose: it is what join_group answers since 0135,
--    and it is the only one of the two any client words ('community_not_found' has no copy in either
--    app). The cost: someone already holding a community's id can tell an archived community
--    ('forbidden') from a live private one ('invite_required'). That is the archive state only — no
--    member, post or event — and joining an archived community used to SUCCEED.
--
-- 4. may_invite_to_group(g, u) — a private-group membership oracle (LOW).
--    The client asks "may I invite into this group" (packages/api useCanInviteToGroup, passing its
--    own uid), but the function answered for ANY u: a signed-in outsider who could not see a
--    private group at all got true for its admin, and — because invite_members defaults to on —
--    for its plain members too. Reproduced. The rule itself must keep answering for someone other
--    than the caller: accept_invitation (0135) judges a private group by the invitation's INVITER,
--    while the invitee is the one calling. So the rule moves, unchanged, into an internal
--    _may_invite_to_group that no API role can execute, and may_invite_to_group — the name the
--    shipped apps call with { g, u } — becomes the API's view of it: false unless u is the caller.
--    accept_invitation now calls the internal one; invite_to_community and invite_to_group pass
--    auth.uid() and keep calling the public one, which answers them exactly as before (section 6
--    replaces both, for blocks only, and keeps those calls as they are).
--
-- 5. is_group_admin(g, u) — the admin half of the same oracle, open even to ANON (LOW).
--    It is an RLS helper, so 0136 left it executable by anon and authenticated, and it answered for
--    any u: anon, seeing no row of a private group, still learned who administers it. Same shape of
--    fix: the rule moves, unchanged, into an internal _is_group_admin, and is_group_admin(g, u)
--    answers only for the caller. Every caller was checked against the live catalog and passes the
--    caller: the policies "groups: update" and "group_invitations: read" (is_group_admin(…, auth.uid()));
--    start_new_season, archive_group, remove_group_member, group_member_list (v_user := auth.uid()),
--    add_group_admins (v_uid := auth.uid()), unarchive_group and my_groups (auth.uid()) — their answers
--    do not change, and anon's policy evaluation still gets false without an error. The one caller
--    that passed someone else was the rule in section 4, which now calls _is_group_admin directly —
--    otherwise, while the community's invite_members toggle is off, an admin's invitation into a
--    private group would silently stop landing (with it on, the admin still passes as a group
--    member). Nothing outside SQL called is_group_admin before this file: no client, seed, edge
--    function or test.
--
-- 6. invite_to_community / invite_to_group — invitations across a block (LOW).
--    invite_to_event refuses an invitee either side has blocked, with 'blocked' (0122), and blocks
--    are symmetric, admins and organizers included (product call). The community and group
--    invitations never looked: an admin — or a member, while invite_members is on — could invite
--    someone who had blocked them, or whom they had blocked, and the invitee got the notification.
--    Reproduced, both directions, for both functions. Now both refuse the way invite_to_event does:
--    the same helper (notif_blocked, which reads both directions), the same 'blocked', checked
--    before anything is written. invite_to_community takes a list, and like invite_to_event's list
--    one blocked invitee refuses the whole call — nobody in it is invited — rather than a silent
--    partial send. invite_to_group checks before its "already in" shortcut, as invite_to_event
--    checks before its "already invited" one. The pickers rarely offer such a person (0140 hides
--    them from the invite search, and block_user drops the follows), so this mostly closes a direct
--    RPC call. Clients: mapPgError already maps 'blocked'; the event screens word it ("This player
--    cannot be invited."), and the community and group invite screens show their generic error
--    (t(code, { defaultValue: unknown_error })) until they get that string — a client change.
--    Both bodies are the live ones (invite_to_community 0135's, invite_to_group 0107's) with the
--    check added and search_path pinned; both still pass the caller's own id to the public
--    may_invite_to_group (section 4).
--
-- RE-APPLYING 0135 AFTER THIS FILE BREAKS INVITATIONS. 0135's accept_invitation calls the PUBLIC
-- may_invite_to_group(gr.id, v_inviter); after 0141 that answers false for anyone but the caller,
-- so re-running 0135 (here or on hosted) would silently drop every private group from accepted
-- invitations — and 0135's own self-check would not notice. Re-running 0135 would also put back
-- its invite_to_community, without section 6's block check. Never re-run 0135 after 0141. If
-- 0135's accept_invitation or invite_to_community ever changes, rebuild this file's copy from the
-- new live body.
--
-- BEFORE A HOSTED PASTE, compare the starting bodies (read-only):
--   select proname, md5(prosrc) from pg_proc where pronamespace = 'public'::regnamespace
--      and proname in ('post_event_result','generate_next_round','join_community','accept_invitation',
--                      'accept_group_invitation','may_invite_to_group','is_group_admin',
--                      'invite_to_community','invite_to_group') order by 1;
--   local: accept_group_invitation 7dd5b2d66d096cbbfddaea1abb16251f, accept_invitation
--   29e03a564b436e1a7752ba0d6a11c8e7, generate_next_round dd4be981ee18fe48970e835f123b73b3,
--   invite_to_community c4099d8362bc2dcb8fe8bf16023ef635, invite_to_group
--   acc16dee78d366601b2fc170b73adf48, is_group_admin d797fdab802614c57ef4669a28552660,
--   join_community ef8e52bb59dd8a698a757ea162ffb2a3, may_invite_to_group
--   987c3ef937a7f6d18aa8b3da39428946, post_event_result 861480d8b02fb26ed1ce2696d8adf4cc.
--   A mismatch means hosted drifted from the repo: stop and diff before pasting, because CREATE OR
--   REPLACE would overwrite whatever is there. prosrc keeps comments, so a mismatch can be
--   comment-only (a scratch copy of invite_to_community without 0135's two comment lines hashes
--   to 3ae3780d…) — the diff tells.
--
-- NOT HERE (separate changes):
--   * events in an archived community: archive_community stamps the groups but, unlike archive_group,
--     neither cancels scheduled events nor stops their series, so members can still join, start,
--     score and finish events there;
--   * the admin-side writes into an archived community — invite_to_community, invite_to_group,
--     accept_join_request — and direct "posts: create" inserts (can_create_post has no archive check).
--     Section 6 replaces the first two for blocks only and adds no archive check;
--   * invitations sent BEFORE a block: they stay pending, and the invitee can still accept or decline
--     them, as with event invitations — invite_to_event, too, refuses only new ones;
--   * event_is_visible(e, u) and is_event_organizer(e, u): the same kind of anon-reachable per-user
--     answer as section 5, but event_is_visible is called widely, so its callers need an audit first;
--   * a completed event of an archived GROUP in a live community can still be posted: the feed is
--     the community's, and the community is not archived;
--   * re-scoring after finish through submit_score — kept on purpose (product decision).

-- 5. is_group_admin -------------------------------------------------------------------------------
-- The live rule, word for word, under an internal name. Created first: everything below calls it.
create or replace function _is_group_admin(g uuid, u uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from groups gr
    join community_members cm
      on cm.community_id = gr.community_id and cm.user_id = u and cm.role = 'admin'
    where gr.id = g
      and (gr.is_private = false
           or exists (select 1 from group_members gm where gm.group_id = g and gm.user_id = u))
  );
$$;

-- The policies' and the RPCs' view: the same answer for the caller, false for anyone else and for
-- no session. CASE, not AND, so the rule is not even evaluated for someone else's id.
create or replace function is_group_admin(g uuid, u uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case when u = auth.uid() then _is_group_admin(g, u) else false end;
$$;

-- 4. may_invite_to_group --------------------------------------------------------------------------
-- 0107's rule under an internal name, asking the internal admin rule: it is called for the
-- invitation's INVITER, who is not the caller, so the public is_group_admin would answer false.
create or replace function _may_invite_to_group(g uuid, u uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select _is_group_admin(g, u)
      or (exists (select 1 from group_members where group_id = g and user_id = u)
          and coalesce((select cp.invite_members from community_permissions cp
                        join groups gr on gr.community_id = cp.community_id
                        where gr.id = g), false));
$$;

-- The API's view (useCanInviteToGroup, invite_to_community, invite_to_group): unchanged for the caller.
create or replace function may_invite_to_group(g uuid, u uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case when u = auth.uid() then _may_invite_to_group(g, u) else false end;
$$;

-- 3 + 4. accept_invitation ------------------------------------------------------------------------
-- 0135's body: the archive check after the invitation lookup, and the private-group filter asking
-- the internal rule (it judges the INVITER, who is not the caller).
create or replace function accept_invitation(p_invitation_id uuid, p_ack boolean default false)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_cid uuid; v_user uuid := auth.uid(); v_groups uuid[]; v_inviter uuid;
begin
  select community_id, group_ids, inviter_id into v_cid, v_groups, v_inviter
    from community_invitations where id = p_invitation_id and invitee_id = v_user and status='pending';
  if v_cid is null then raise exception 'invitation_not_found' using errcode='P0001'; end if;
  if exists (select 1 from communities c where c.id = v_cid and c.archived_at is not null) then
    raise exception 'forbidden' using errcode='P0001';                                             -- UX-COMM-24
  end if;
  if rules_ack_required(v_cid, p_ack) then
    raise exception 'rules_acknowledgement_required' using errcode='P0001';
  end if;
  perform add_member_to_community(v_cid, v_user, p_ack);
  insert into group_members (group_id, user_id)
    select gr.id, v_user from groups gr
     where gr.id = any(coalesce(v_groups, '{}')) and gr.community_id = v_cid and gr.archived_at is null
       and (not gr.is_private or _may_invite_to_group(gr.id, v_inviter))
    on conflict do nothing;
  update community_invitations set status='accepted', accepted_at=now() where id = p_invitation_id;
end; $$;

-- 3. join_community -------------------------------------------------------------------------------
-- 0099's body (unchanged by 0135), with archived_at read alongside privacy and refused before the
-- rules prompt — nobody is asked to acknowledge the rules of a community they cannot join. Covers
-- all three branches, the private one before it reaches accept_invitation.
create or replace function join_community(p_community_id uuid, p_ack boolean default false)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_privacy text; v_rules boolean; v_archived timestamptz; v_user uuid := auth.uid(); v_invitation uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select privacy, cancellation_rules_enabled, archived_at into v_privacy, v_rules, v_archived
    from communities where id = p_community_id;
  if v_privacy is null then raise exception 'community_not_found' using errcode='P0001'; end if;
  if v_archived is not null then raise exception 'forbidden' using errcode='P0001'; end if;      -- UX-COMM-24
  if v_rules and not p_ack then
    raise exception 'rules_acknowledgement_required' using errcode='P0001';
  end if;

  if v_privacy = 'public' then
    perform add_member_to_community(p_community_id, v_user, p_ack);  -- member cap trigger may raise P0001
    return 'joined';
  elsif v_privacy = 'request_to_join' then
    -- A cancelled request is re-opened, with a fresh created_at so it sorts into the admin queue
    -- as the new request it is. A DECLINED one is not: an admin answered, and the requester
    -- tapping the button again does not overturn it (0028 behaved this way too, by accident).
    insert into community_join_requests (community_id, user_id, rules_acknowledged)
      values (p_community_id, v_user, p_ack)
      on conflict (community_id, user_id) do update
        set rules_acknowledged = excluded.rules_acknowledged,
            status             = 'pending',
            created_at         = now(),
            responded_at       = null,
            responded_by       = null
        where community_join_requests.status in ('pending', 'cancelled');
    return 'requested';
  else -- private
    select id into v_invitation from community_invitations
      where community_id = p_community_id and invitee_id = v_user and status = 'pending';
    if v_invitation is null then raise exception 'invite_required' using errcode='P0001'; end if;
    perform accept_invitation(v_invitation, p_ack);
    return 'joined';
  end if;
end; $$;

-- 3. accept_group_invitation ----------------------------------------------------------------------
-- 0099's body, with join_group's archive check (0135) after the invitation check.
create or replace function accept_group_invitation(p_group_id uuid, p_ack boolean default false)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_cid uuid; v_group_archived timestamptz;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from group_invitations
                 where group_id=p_group_id and invitee_id=v_user and status='pending') then
    raise exception 'invitation_not_found' using errcode='P0001';
  end if;
  select community_id, archived_at into v_cid, v_group_archived from groups where id = p_group_id;
  if v_group_archived is not null
     or exists (select 1 from communities c where c.id = v_cid and c.archived_at is not null) then
    raise exception 'forbidden' using errcode='P0001';                                             -- UX-COMM-24
  end if;
  if rules_ack_required(v_cid, p_ack) then
    raise exception 'rules_acknowledgement_required' using errcode='P0001';
  end if;
  perform record_community_entry(v_cid, v_user, p_ack);                      -- GR-10
  insert into group_members (group_id, user_id) values (p_group_id, v_user)
    on conflict (group_id, user_id) do nothing;
  update group_invitations set status='accepted', responded_at=now()
    where group_id=p_group_id and invitee_id=v_user and status='pending';
end; $$;

-- 1. post_event_result ----------------------------------------------------------------------------
-- 0075's body, with the soft-delete refusal after the lookup, the "posts: create" rule and the
-- archive checked once the community is known, and 'already_posted' counting only a post
-- _event_result_posted_to (0139) would trust.
create or replace function post_event_result(p_event_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_community uuid; v_post uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.deleted_at is not null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.status <> 'completed' then raise exception 'not_completed' using errcode='P0001'; end if;
  v_community := event_group_community(p_event_id);
  if v_community is null then raise exception 'no_community' using errcode='P0001'; end if;
  -- The insert below runs as the owner, so "posts: create" does not; this is its rule.
  if not can_create_post(v_community) then raise exception 'forbidden' using errcode='P0001'; end if;
  if exists (select 1 from communities c where c.id = v_community and c.archived_at is not null) then
    raise exception 'forbidden' using errcode='P0001';                                             -- UX-COMM-24
  end if;
  -- Only what this function writes counts — the conditions _event_result_posted_to trusts, minus
  -- status, deletion and membership. A row planted before 0137 no longer locks the organizer out.
  if exists (select 1 from community_posts cp
              where cp.result_event_id = p_event_id
                and cp.kind = 'result'
                and cp.author_id = v_ev.organizer_id
                and cp.community_id = v_community
                and cp.updated_at = cp.created_at) then
    raise exception 'already_posted' using errcode='P0001'; end if;

  insert into community_posts (community_id, author_id, kind, result_event_id)
  values (v_community, v_user, 'result', p_event_id)
  returning id into v_post;
  return v_post;
end; $$;

-- 2. generate_next_round --------------------------------------------------------------------------
-- 0126's body, with finish_event's lock and its soft-delete/status checks after the existing lock.
create or replace function generate_next_round(p_event_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_ev events%rowtype;
  v_prev_round_id uuid;
  v_prev_rn int;
  v_new_round_id uuid;
  v_prev_courts int;                                                                  -- NEW
  v_units jsonb;                                                                      -- NEW
  v_placed jsonb;                                                                     -- NEW
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.event_type = 'americano' then raise exception 'not_applicable' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event:'||p_event_id::text, 0));
  -- finish_event's lock too, then the row as it is now: a round is added only to a live event that
  -- is still in progress, and a Finish racing this call waits for it (or this call sees its result).
  perform pg_advisory_xact_lock(hashtextextended('event:finish:'||p_event_id::text, 0));
  select * into v_ev from events where id = p_event_id;
  if v_ev.deleted_at is not null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.status <> 'in_progress' then raise exception 'event_not_in_progress' using errcode='P0001'; end if;

  select id, round_number into v_prev_round_id, v_prev_rn
    from event_rounds where event_id = p_event_id
    order by round_number desc limit 1;
  if v_prev_round_id is null then raise exception 'no_current_round' using errcode='P0001'; end if;
  if exists (select 1 from event_matches m where m.round_id = v_prev_round_id and m.status = 'pending') then
    raise exception 'round_not_scored' using errcode='P0001';
  end if;

  if v_ev.event_type = 'mexicano' then
    -- Ranked by the event standings (a team event ranks teams, 0125); fewest rests rest first.
    select coalesce(jsonb_agg(jsonb_build_object('players', to_jsonb(q.players), 'pool', q.pool,
                                                 'ord', q.ord, 'rest_ord', q.rest_ord)), '[]'::jsonb)
      into v_units
    from (
      select u.players, u.pool,
             row_number() over (order by coalesce(s.rank, 2147483647), u.team_number, u.joined_at, u.unit_id) as ord,
             row_number() over (order by u.rests, u.team_number, u.joined_at, u.unit_id) as rest_ord
      from _engine_units(p_event_id) u
      left join standings(p_event_id) s on s.entity_id = u.unit_id
    ) q;
    v_placed := _engine_place(_engine_mode(p_event_id), 'mexicano', v_ev.num_courts, v_units);

  elsif v_ev.event_type = 'up_and_down' then
    -- Winners of court K go to K - 1, losers to K + 1; the winners of court 1 and the losers of the
    -- last court stay. Units that did not play last round rejoin at the middle court. Court order:
    -- target court, then the court they came from, winners first — so the pair that moved together
    -- stays together (side a: the pair from the court above, side b: the pair from below).
    select count(*) into v_prev_courts from event_matches where round_id = v_prev_round_id;
    select coalesce(jsonb_agg(jsonb_build_object('players', to_jsonb(q.players), 'pool', q.pool,
                                                 'ord', q.ord, 'rest_ord', q.rest_ord)), '[]'::jsonb)
      into v_units
    from (
      select u.players, u.pool,
             row_number() over (order by
               case when pl.court is null then greatest(1, (v_prev_courts + 1) / 2)
                    when pl.won then greatest(pl.court - 1, 1)
                    else least(pl.court + 1, v_prev_courts) end,
               coalesce(pl.court, 2147483647),
               case when pl.court is null then 2 when pl.won then 0 else 1 end,
               u.team_number, u.joined_at, u.unit_id) as ord,
             row_number() over (order by u.rests, u.team_number, u.joined_at, u.unit_id) as rest_ord
      from _engine_units(p_event_id) u
      left join lateral (
        select min(m.court_number) as court,
               bool_or(mp.side = case when coalesce(m.side_a_score, 0) >= coalesce(m.side_b_score, 0)
                                      then 'a' else 'b' end) as won
        from match_players mp join event_matches m on m.id = mp.match_id
        where m.round_id = v_prev_round_id and mp.participant_id = any(u.players)
      ) pl on true
    ) q;
    v_placed := _engine_place(_engine_mode(p_event_id), 'ladder', v_ev.num_courts, v_units);

  else
    raise exception 'not_applicable' using errcode='P0001';
  end if;

  update event_rounds set status = 'completed' where id = v_prev_round_id;

  insert into event_rounds (event_id, round_number, status, generated_at)
  values (p_event_id, v_prev_rn + 1, 'active', now())
  returning id into v_new_round_id;

  perform _persist_round_matches(p_event_id, v_new_round_id, v_placed->'arrangement');

  insert into round_rest (round_id, participant_id)
  select v_new_round_id, x::uuid from jsonb_array_elements_text(v_placed->'rests') x;

  return v_new_round_id;
end; $$;

-- 6. invite_to_community --------------------------------------------------------------------------
-- 0135's body, with invite_to_event's block check on each invitee before its row is written.
create or replace function invite_to_community(p_community_id uuid, p_invitee_ids uuid[], p_group_ids uuid[] default '{}'::uuid[])
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid;
begin
  if not (is_community_admin(p_community_id)
          or (is_community_member(p_community_id)
              and coalesce((select invite_members from community_permissions where community_id=p_community_id),false)))
  then raise exception 'forbidden' using errcode='P0001'; end if;
  -- Every group named must be a live group of THIS community, and a private one only if the
  -- inviter may invite into it — the same rule invite_to_group applies (may_invite_to_group).
  if exists (
    select 1 from unnest(coalesce(p_group_ids, '{}')) as g(id)
     where not exists (select 1 from groups gr
                        where gr.id = g.id and gr.community_id = p_community_id and gr.archived_at is null
                          and (not gr.is_private or may_invite_to_group(gr.id, auth.uid())))
  ) then
    raise exception 'forbidden' using errcode='P0001';
  end if;
  foreach v_uid in array p_invitee_ids loop
    if notif_blocked(auth.uid(), v_uid) then raise exception 'blocked' using errcode='P0001'; end if;
    insert into community_invitations (community_id, inviter_id, invitee_id, group_ids)
      values (p_community_id, auth.uid(), v_uid, coalesce(p_group_ids,'{}'))
      on conflict (community_id, invitee_id) do update
        set status      = 'pending',
            inviter_id  = excluded.inviter_id,
            group_ids   = excluded.group_ids,
            created_at  = now(),
            declined_at = null
        where community_invitations.status = 'declined';
  end loop;
end; $$;

-- 6. invite_to_group ------------------------------------------------------------------------------
-- 0107's body, with invite_to_event's block check after the permission check and before the
-- "already in" shortcut (invite_to_event checks before its "already invited" one).
create or replace function invite_to_group(p_group_id uuid, p_invitee_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not may_invite_to_group(p_group_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if notif_blocked(v_user, p_invitee_id) then raise exception 'blocked' using errcode='P0001'; end if;
  -- Already in: nothing to do.
  if exists (select 1 from group_members where group_id=p_group_id and user_id=p_invitee_id) then
    return;
  end if;
  -- A spent invitation (accepted then left, or declined) is replaced, not kept: the unique key
  -- would otherwise swallow the new one, and the notification fires on INSERT only.
  delete from group_invitations
    where group_id=p_group_id and invitee_id=p_invitee_id and status <> 'pending';
  insert into group_invitations (group_id, inviter_id, invitee_id)
    values (p_group_id, v_user, p_invitee_id) on conflict (group_id, invitee_id) do nothing;
end; $$;

-- Grants. CREATE OR REPLACE keeps an existing function's ACL, so the replaced functions keep what
-- 0094/0135/0136 left them; restated so the outcome does not depend on how each grant arrived.
-- is_group_admin stays open to anon as well: two RLS policies call it, and policies apply to every
-- role (0136 kept it for that reason). The two NEW internal helpers arrive with 0030's default
-- grants (PUBLIC, anon, authenticated) — or with none, if default privileges have been closed by
-- then — and must end with none either way: the definer bodies that call them run as the owner.
revoke execute on function _is_group_admin(uuid, uuid) from public, anon, authenticated;
revoke execute on function _may_invite_to_group(uuid, uuid) from public, anon, authenticated;
revoke execute on function is_group_admin(uuid, uuid) from public, anon, authenticated;
grant execute on function is_group_admin(uuid, uuid) to anon, authenticated;
revoke execute on function may_invite_to_group(uuid, uuid) from public, anon;
grant execute on function may_invite_to_group(uuid, uuid) to authenticated;
revoke execute on function accept_invitation(uuid, boolean) from public, anon;
grant execute on function accept_invitation(uuid, boolean) to authenticated;
revoke execute on function join_community(uuid, boolean) from public, anon;
grant execute on function join_community(uuid, boolean) to authenticated;
revoke execute on function accept_group_invitation(uuid, boolean) from public, anon;
grant execute on function accept_group_invitation(uuid, boolean) to authenticated;
revoke execute on function post_event_result(uuid) from public, anon;
grant execute on function post_event_result(uuid) to authenticated;
revoke execute on function generate_next_round(uuid) from public, anon;
grant execute on function generate_next_round(uuid) to authenticated;
revoke execute on function invite_to_community(uuid, uuid[], uuid[]) from public, anon;
grant execute on function invite_to_community(uuid, uuid[], uuid[]) to authenticated;
revoke execute on function invite_to_group(uuid, uuid) from public, anon;
grant execute on function invite_to_group(uuid, uuid) to authenticated;

-- Self-check, in the spirit of 0094/0097/0101/0132–0136. Catalog state, plus one read-only probe of
-- the two "only for the caller" wrappers: proving the refusals needs several users, communities and
-- a played event, which is what the REST test (infra/supabase/tests/status-gaps.test.mjs) does on a
-- scratch stack — a hosted paste must not create and tear down communities. The editor runs the
-- whole paste as one transaction, so if this raises, nothing above it lands.
do $$
declare
  v_fn regprocedure;
  v_src text;
  v_g uuid;
  v_u uuid;
begin
  -- 1. post_event_result: both checks, after the community is known and before the insert; the
  --    soft-delete refusal; and 'already_posted' counting only what _event_result_posted_to trusts.
  v_src := (select prosrc from pg_proc where oid = 'public.post_event_result(uuid)'::regprocedure);
  if v_src !~ 'v_community := event_group_community.*if not can_create_post\(v_community\) then raise exception ''forbidden''.*insert into community_posts'
     or v_src !~ 'c\.id = v_community and c\.archived_at is not null\) then\s+raise exception ''forbidden''.*insert into community_posts' then
    raise exception '0141: post_event_result lost the "posts: create" or the archived-community check';
  end if;
  if v_src !~ 'if v_ev\.deleted_at is not null then raise exception ''event_not_found''.*insert into community_posts' then
    raise exception '0141: post_event_result posts the result of a soft-deleted event';
  end if;
  if v_src !~ 'from community_posts cp\s+where cp\.result_event_id = p_event_id\s+and cp\.kind = ''result''\s+and cp\.author_id = v_ev\.organizer_id\s+and cp\.community_id = v_community\s+and cp\.updated_at = cp\.created_at\) then\s+raise exception ''already_posted''.*insert into community_posts' then
    raise exception '0141: post_event_result''s already_posted counts a post _event_result_posted_to would not trust, so a planted row locks the organizer out';
  end if;

  -- 2. generate_next_round: finish_event's lock, then the soft-delete and status checks on the row
  --    as re-read under it, all before the first write.
  v_src := (select prosrc from pg_proc where oid = 'public.generate_next_round(uuid)'::regprocedure);
  if v_src !~ 'hashtextextended\(''event:''\|\|p_event_id::text, 0\).*hashtextextended\(''event:finish:''\|\|p_event_id::text, 0\)\);\s+select \* into v_ev from events where id = p_event_id;\s+if v_ev\.deleted_at is not null then raise exception ''event_not_found''.*if v_ev\.status <> ''in_progress'' then raise exception ''event_not_in_progress''.*update event_rounds set status = ''completed''' then
    raise exception '0141: generate_next_round lost the finish lock, or its deleted/in-progress checks under it';
  end if;

  -- 3. The archive checks, each before anything is written.
  if (select prosrc from pg_proc where oid = 'public.join_community(uuid,boolean)'::regprocedure)
       !~ 'if v_archived is not null then raise exception ''forbidden''.*rules_acknowledgement_required.*add_member_to_community'
     or (select prosrc from pg_proc where oid = 'public.accept_invitation(uuid,boolean)'::regprocedure)
       !~ 'invitation_not_found.*c\.id = v_cid and c\.archived_at is not null\) then\s+raise exception ''forbidden''.*add_member_to_community'
     or (select prosrc from pg_proc where oid = 'public.accept_group_invitation(uuid,boolean)'::regprocedure)
       !~ 'invitation_not_found.*v_group_archived is not null\s+or exists \(select 1 from communities c where c\.id = v_cid and c\.archived_at is not null\) then\s+raise exception ''forbidden''.*record_community_entry' then
    raise exception '0141: an archived-community check is missing from join_community, accept_invitation or accept_group_invitation';
  end if;

  -- 4 + 5. The public names answer only for the caller; the rules live in the internal helpers, and
  --    the internal ones never go through a public wrapper (that would answer false for the inviter).
  if (select prosrc from pg_proc where oid = 'public.is_group_admin(uuid,uuid)'::regprocedure)
       !~ 'case when u = auth\.uid\(\) then _is_group_admin\(g, u\) else false end'
     or (select prosrc from pg_proc where oid = 'public.may_invite_to_group(uuid,uuid)'::regprocedure)
       !~ 'case when u = auth\.uid\(\) then _may_invite_to_group\(g, u\) else false end' then
    raise exception '0141: is_group_admin or may_invite_to_group answers for someone other than the caller';
  end if;
  v_src := (select prosrc from pg_proc where oid = 'public._may_invite_to_group(uuid,uuid)'::regprocedure);
  if v_src !~ '\m_is_group_admin\(g, u\)' or v_src ~ '(^|[^_[:alnum:]])is_group_admin\(' then
    raise exception '0141: _may_invite_to_group must ask _is_group_admin, not the caller-only is_group_admin';
  end if;
  v_src := (select prosrc from pg_proc where oid = 'public.accept_invitation(uuid,boolean)'::regprocedure);
  if v_src !~ '\m_may_invite_to_group\(gr\.id, v_inviter\)' or v_src ~ '(^|[^_[:alnum:]])may_invite_to_group\(' then
    raise exception '0141: accept_invitation must judge private groups by the inviter through _may_invite_to_group';
  end if;
  if (select prosrc from pg_proc where oid = 'public._is_group_admin(uuid,uuid)'::regprocedure)
       !~ 'cm\.user_id = u and cm\.role = ''admin''.*gm\.user_id = u' then
    raise exception '0141: _is_group_admin does not carry the group-admin rule';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public._is_group_admin(uuid,uuid)'::regprocedure)
     or not (select prosecdef from pg_proc where oid = 'public._may_invite_to_group(uuid,uuid)'::regprocedure) then
    raise exception '0141: the internal group rules must stay SECURITY DEFINER like the functions they replace';
  end if;

  -- 6. Both invitation writers refuse an invitee either side has blocked, before anything is
  --    written, and still ask the public may_invite_to_group about the caller only.
  v_src := (select prosrc from pg_proc where oid = 'public.invite_to_community(uuid,uuid[],uuid[])'::regprocedure);
  if v_src !~ 'foreach v_uid in array p_invitee_ids loop\s+if notif_blocked\(auth\.uid\(\), v_uid\) then raise exception ''blocked''.*insert into community_invitations'
     or v_src !~ 'may_invite_to_group\(gr\.id, auth\.uid\(\)\)' then
    raise exception '0141: invite_to_community invites across a block, or asks may_invite_to_group about someone other than the caller';
  end if;
  v_src := (select prosrc from pg_proc where oid = 'public.invite_to_group(uuid,uuid)'::regprocedure);
  if v_src !~ 'may_invite_to_group\(p_group_id, v_user\).*if notif_blocked\(v_user, p_invitee_id\) then raise exception ''blocked''.*from group_members.*delete from group_invitations.*insert into group_invitations' then
    raise exception '0141: invite_to_group invites across a block (or checks it after writing)';
  end if;
  if (select prosrc from pg_proc where oid = 'public.notif_blocked(uuid,uuid)'::regprocedure)
       !~ 'blocker_id = u1 and blocked_id = u2.*blocker_id = u2 and blocked_id = u1' then
    raise exception '0141: notif_blocked no longer reads blocks in both directions, which section 6 relies on';
  end if;

  -- The wrappers in action, read-only, where there is data to read (none on a fresh stack): for a
  -- real admin of a public group who is not this session's user (a paste has no JWT at all), the
  -- public names must say false while the internal rules still say true.
  select gr.id, cm.user_id into v_g, v_u
    from groups gr join community_members cm on cm.community_id = gr.community_id and cm.role = 'admin'
   where not gr.is_private and cm.user_id is distinct from auth.uid()
   limit 1;
  if v_g is not null then
    if is_group_admin(v_g, v_u) or may_invite_to_group(v_g, v_u) then
      raise exception '0141: is_group_admin or may_invite_to_group answered for a user who is not the caller';
    end if;
    if not _is_group_admin(v_g, v_u) or not _may_invite_to_group(v_g, v_u) then
      raise exception '0141: the internal group rules no longer recognise a community admin of a public group';
    end if;
  end if;

  -- Grants. The internal helpers: nobody but the owner (and service_role). is_group_admin: both API
  -- roles, for its RLS policies. The eight API functions: signed-in only, as 0135/0136 left them.
  foreach v_fn in array array['public._is_group_admin(uuid,uuid)', 'public._may_invite_to_group(uuid,uuid)']::regprocedure[] loop
    if has_function_privilege('public', v_fn, 'execute')
       or has_function_privilege('anon', v_fn, 'execute')
       or has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception '0141: an API role can execute % — the membership oracle is back', v_fn;
    end if;
  end loop;
  if not has_function_privilege('anon', 'public.is_group_admin(uuid,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.is_group_admin(uuid,uuid)', 'execute') then
    raise exception '0141: an API role lost is_group_admin, which the groups and group_invitations policies call for every role';
  end if;
  foreach v_fn in array array[
    'public.post_event_result(uuid)', 'public.generate_next_round(uuid)',
    'public.join_community(uuid,boolean)', 'public.accept_invitation(uuid,boolean)',
    'public.accept_group_invitation(uuid,boolean)', 'public.may_invite_to_group(uuid,uuid)',
    'public.invite_to_community(uuid,uuid[],uuid[])', 'public.invite_to_group(uuid,uuid)'
  ]::regprocedure[] loop
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception '0141: anon can execute %', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception '0141: authenticated lost %, which signed-in screens call', v_fn;
    end if;
  end loop;

  -- Every function this file creates or replaces pins its search_path, pg_temp last.
  foreach v_fn in array array[
    'public.post_event_result(uuid)', 'public.generate_next_round(uuid)',
    'public.join_community(uuid,boolean)', 'public.accept_invitation(uuid,boolean)',
    'public.accept_group_invitation(uuid,boolean)', 'public.may_invite_to_group(uuid,uuid)',
    'public._may_invite_to_group(uuid,uuid)', 'public.is_group_admin(uuid,uuid)',
    'public._is_group_admin(uuid,uuid)', 'public.invite_to_community(uuid,uuid[],uuid[])',
    'public.invite_to_group(uuid,uuid)'
  ]::regprocedure[] loop
    if not exists (select 1 from pg_proc p, unnest(p.proconfig) c
                    where p.oid = v_fn and c = 'search_path=public, pg_temp') then
      raise exception '0141: % does not pin search_path = public, pg_temp', v_fn;
    end if;
  end loop;
end $$;
