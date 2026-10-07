-- An event's result is shown only to people who may see that event. Before this file, two
-- SECURITY DEFINER reads handed it to anyone signed in who knew the event's id. Found while
-- triaging Supabase's SECURITY DEFINER warnings, each reproduced in a throwaway copy of the schema
-- (begin … rollback), and fixed together because they are the same read.
--
-- ORDER: THIS FILE APPLIES AFTER 0137 (community content stays put), and 0137 is what makes the
-- posted-result rule below sound. The rule trusts a result post only when the event's ORGANIZER
-- wrote it. Before 0137, "posts: update" let a community admin rewrite any post in their community,
-- author_id included: an admin who was not in a private group could re-sign their own post as the
-- organizer with kind = 'result' and the private event's id, and the whole community would then
-- read that event's ranked names (reproduced, with this file's functions in place and 0137 not).
-- 0137 drops that policy and takes UPDATE away from anon and authenticated, and "posts: create"
-- pins author_id to the caller for everyone, admins included. 0137 also stops clients writing
-- kind = 'result' or a result_event_id at all (column-level INSERT grant, and the policy wants
-- kind = 'user' and result_event_id is null), so from then on a post naming an event comes only
-- from post_event_result or the service role. The self-check at the end refuses to run unless the
-- two locks this rule leans on (no UPDATE, author pinned on INSERT) are in place, so a hosted paste
-- in the wrong order lands nothing.
--
-- WHO MAY SEE AN EVENT'S RESULT. One rule, used by both reads below:
--   * anyone event_is_visible() lets see the event (organizer, participants, invitees, group
--     members of a non-private event, any signed-in user for a public community's public group);
--   * a member of the community the organizer POSTED the result to. Product call (2026-10-07):
--     keep it. Web PostCard.tsx documents it — "a community member who never joined the group
--     therefore gets the ranking but not the event" — and the organizer chose to publish it there;
--   * the event's organizer, even after the event is soft-deleted (see 2, internal callers).
-- Names are then hidden for anyone either side has blocked, as standings() already did.
--
-- 1. event_result_summary(uuid) — names of private events and of people who blocked you (LOW).
--    standings() masks identities: nothing when event_is_visible() is false, and no name for a
--    player either side has blocked. event_result_summary called standings(), then joined
--    event_participants and profiles AGAIN on the participant ids and returned full_name, gated
--    only on membership of the event's community — for ANY event id, posted or not, deleted or
--    not. So any community member could read the ranked names of a private event, or of an event
--    in a private group they are not in, and the name of a player who had blocked them.
--    Reproduced: a private event in a private group, a viewer who is only a community member,
--    Alice has blocked the viewer — `select count(*) from events` = 0 and standings() named
--    nobody, but event_result_summary returned 'Alice Hidden|16'.
--    Now it answers only within the rule above (the community-membership gate stays as well, so
--    nobody gains anything), and a blocked player's name reads '—', the way both clients already
--    render an unknown name — in a pair, "— & Bob", as the live Leaderboard shows it.
--
--    WHAT COUNTS AS POSTED. Until 0137, community_posts took kind = 'result' and any
--    result_event_id from any member who may post, so "a post names this event" alone would have
--    let a member plant a private event's id and then read its names. Worse, "posts: update" let a
--    community admin rewrite any post in their community, author_id included, so an admin could
--    turn their own post into one that reads as the ORGANIZER's result post (see ORDER above).
--    Rows of both kinds written before 0137 are still in the table. A post counts only if it is
--    exactly what post_event_result writes: kind 'result', authored by the event's organizer, in
--    the event's own community, for a completed, live event, and never UPDATEd since.
--      * Organizer, community, kind: a member's planted row fails these. From 0137 on nobody can
--        sign a post as someone else ("posts: create" pins author_id = auth.uid(); 0137 removed
--        UPDATE), so no new row can pass them, nor one let back in by a future INSERT grant.
--      * Never UPDATEd (updated_at = created_at): an admin's re-signed row passes the three above,
--        and fails this. post_event_result inserts once and both stamps default to the same now();
--        trg_community_posts_updated_at (0022, older than "posts: update" from 0024) sets
--        updated_at := now() on every UPDATE, so a re-sign — always a later request than the
--        post it rewrote — left a later updated_at. Nothing legitimately updates a post: no client
--        has ever called .update() on community_posts (checked in git history), and no function,
--        seed or edge function does. Locally every post has equal stamps. A future "edit result
--        post", or a service-role data fix that UPDATEs a result post, un-posts it — such a change
--        has to revisit this helper.
--      * What this cannot see: the old table-wide UPDATE grant also let that PATCH set created_at,
--        and the literal 'now' is the transaction's own timestamp, the value the trigger writes. A
--        re-sign that also sent created_at = 'now' left equal stamps, and nothing in the row tells
--        it apart from post_event_result's (reproduced: such a row still unlocks the names). The
--        pre-check under NOT HERE lists everything the rule can tell apart; this one residual case
--        needs someone who knew both tricks before 0137.
--    The rule lives in one internal helper, _event_result_posted_to, so the two reads cannot drift
--    apart, and the self-check asserts the policy shape and the trigger it depends on.
--
-- 2. standings(uuid) — any event's scoreboard to any signed-in caller (LOW).
--    The body masked only the identity columns; the score rows themselves (rank, points, W/D/L,
--    participant and team ids) came back for any event id — private, in a private group, or
--    soft-deleted. 0136 closed it to anon; this closes it to signed-in strangers: no rows unless
--    the caller may see the result (the rule above). The identity masking is unchanged.
--
--    INTERNAL CALLERS ARE UNAFFECTED, and that shapes the condition. standings() is also read by
--    other SECURITY DEFINER code, which passes through whatever session it runs in:
--      _event_player_results  <- finish_event, set_event_ranking, and the BEFORE INSERT trigger
--                                fill_group_result_win_loss on group_event_results
--      generate_next_round    (Mexicano ordering)
--      event_result_summary   (1, above)
--    finish_event, set_event_ranking and generate_next_round all refuse anyone but the event's
--    ORGANIZER, so the caller's uid is the organizer's, and the organizer branch keeps them reading
--    exactly what they read before. It also covers a soft-deleted event, which event_is_visible
--    alone would not: set_event_ranking does not check deleted_at (and the organizer always sees
--    their own scoreboard). A caller with NO session — a pg_cron job, a migration or seed running
--    as postgres, the service role (seeds, edge functions), or the trigger fired by any of them —
--    keeps the full scoreboard: `auth.uid() is null` and the caller's role is not anon or
--    authenticated. The role test is there so this branch is not the old anon leak with extra
--    steps: anon has no EXECUTE since 0136, but if a blanket grant ever came back, an anonymous
--    call (or an authenticated JWT with no sub) gets nothing rather than every scoreboard. Inside a
--    SECURITY DEFINER function current_user is always the owner, but the `role` setting still names
--    the caller's role (PostgREST sets it per request; cron, migrations and psql leave it 'none') —
--    checked on the local stack — and auth.role() reads the JWT's role, so both are tested.
--    pg_cron's only job today is materialize_due_occurrences, which never reads standings.
--
-- 3. player_badge_facts(uuid) — no session guard (defence in depth, no reach today).
--    With no session the block CTE was false, so a session-less call returned every counter for
--    any user id. Unreachable now (0105 revoked anon, and an authenticated JWT always carries a
--    sub), but a DROP + CREATE — which adding a badge counter to RETURNS TABLE forces — would come
--    back executable by anon under the default privileges this database has had so far (from 0142
--    on, new functions are closed by default, so a DROP + CREATE must restate `grant execute ... to
--    authenticated` instead). A missing
--    viewer now counts as blocked: the function returns the same zeros a blocked viewer gets. Every
--    real caller (usePlayerBadgeFacts, enabled only with a uid) is signed in, and nothing in SQL
--    calls it.
--
-- WHAT CHANGES FOR USERS (shipped build 17 included; no app change, no new build):
--   * a player who blocked the viewer, or whom the viewer blocked, reads '—' in a result card — in
--     the community feed, on the event page, AND on the organizer's own share card (the organizer
--     is the viewer there: mobile ShareResultsModal renders ResultCard, which reads
--     event_result_summary, and that card is captured as an image and shared outside the app).
--     Product call: blocks are symmetric, organizers and admins included, so the organizer's card
--     follows the same rule as everyone else's;
--   * a posted result whose event was soft-deleted shows "result unavailable" (event_is_visible's
--     deleted_at rule; the organizer still gets the standings);
--   * a "result" post a member planted before 0137, or one an admin re-signed as the organizer's,
--     shows "result unavailable" instead of the ranking — until the organizer posts the real result,
--     after which it repeats that ranking as a second card (delete such rows; see NOT HERE);
--   * a stranger calling standings or event_result_summary with an event id gets [].
-- Unchanged: the live leaderboard for the organizer, players, group members and public-community
-- viewers; posted result cards for community members, members outside a private group included;
-- badges for signed-in users; finish_event, set_event_ranking, generate_next_round, the win/loss
-- trigger, and service-role and cron calls. No new error codes.
--
-- GRANTS. CREATE OR REPLACE keeps a function's ACL, but each is restated so the outcome does not
-- depend on history: the three reads stay signed-in only, as 0136 left them; the new helper takes
-- any user id, so no API role may call it (0094's rule for internal helpers). Nothing 0136 revoked
-- is granted back.
--
-- search_path is `public, pg_temp`: temporary objects are looked up LAST, never first, in these
-- owner-privileged bodies.
--
-- NOT HERE (separate changes):
--   * Rows written before 0137 that this rule refuses. Each reads "result unavailable" in the
--     feed — or, once the organizer posts the real result, repeats that ranking as a second card —
--     until someone deletes it (the pre-check below lists them for a service-role delete). It no longer locks the organizer out: 0141 makes
--     post_event_result's 'already_posted' count only a post this rule would trust (the same
--     conditions, minus status, deletion and membership), so the organizer can still post the real
--     result. The two rules must move together — a post that cannot unlock the result must not
--     block the real one, and the residual above passes both alike — so a change to either belongs
--     in both files. 0137 stops new rows. Before or after the paste, list the old ones read-only
--     on hosted — every post naming an event that is not an organizer-written, never-updated
--     result post in that event's community:
--       select cp.id, cp.community_id, cp.author_id, cp.kind, cp.result_event_id,
--              cp.created_at, cp.updated_at
--         from community_posts cp
--         left join events e on e.id = cp.result_event_id
--         left join groups g on g.id = e.group_id
--        where cp.result_event_id is not null
--          and not (cp.kind = 'result' and cp.author_id is not distinct from e.organizer_id
--                   and cp.community_id is not distinct from g.community_id
--                   and cp.updated_at = cp.created_at);
--     Delete any rows it returns with the service role, so the feed stops showing them. (0 rows
--     locally.)
--   * player_recent_results (0113, the profile's recent results) names partners and opponents
--     with no block check against the viewer — it checks only the profile's subject. So a co-player
--     who blocked the viewer, and reads '—' in this file's summary, is still named on a shared
--     co-player's profile. Masking those names, with this file's predicate (either direction
--     between the viewer and that co-player; guests keep their guest_name), belongs to 0140 (block
--     symmetry), which owns blocks; it is not repeated here.
--   * authenticated still holds TRUNCATE on group_event_results (0137 cleaned community_posts).
--     PostgREST cannot issue it; a schema-wide grant clean-up can.
--
-- CLIENTS. Nothing to change. Both already handle an empty answer — web PostCard shows
-- "resultUnavailable", the live Leaderboard "standingsEmpty", mobile renders no rows — and '—'
-- is what they print for an unknown name.

-- The rule's posted half ----------------------------------------------------------------------
-- community_posts had no index on result_event_id: post_event_result's 'already_posted' check
-- and the helper below would scan every post. Partial, because almost every post is a user post.
-- Not CONCURRENTLY: the paste is one transaction, and community_posts is small.
create index if not exists community_posts_result_event_idx
  on community_posts (result_event_id) where result_event_id is not null;

create or replace function public._event_result_posted_to(p_event_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- True when p_user is a member of the community this event's result was posted to by its
  -- organizer. Every condition is one post_event_result guarantees, so a post a member wrote by
  -- hand (kind 'result' and a result_event_id were client-writable until 0137, and such rows
  -- remain) does not count, and neither does one an admin re-signed as the organizer's through
  -- the old "posts: update" (the updated_at line). Sound from 0137 on because nobody can sign a
  -- post as someone else: "posts: create" pins author_id to the caller, and 0137 took UPDATE away
  -- from the API roles.
  select exists (
    select 1
      from community_posts cp
      join events ev on ev.id = cp.result_event_id
      join groups g  on g.id  = ev.group_id
     where cp.result_event_id = p_event_id
       and cp.kind = 'result'
       and cp.author_id = ev.organizer_id    -- post_event_result: is_event_organizer(caller)
       and cp.community_id = g.community_id  -- post_event_result: event_group_community(event)
       and cp.updated_at = cp.created_at     -- post_event_result writes the row once, both stamps
                                             -- now(); trg_community_posts_updated_at re-stamps
                                             -- updated_at on every UPDATE, and nothing updates a
                                             -- post, so a row that was ever UPDATEd is not its row
       and ev.status = 'completed'           -- post_event_result: 'not_completed' otherwise
       and ev.deleted_at is null             -- event_is_visible's rule: a deleted event shows nothing
       and exists (select 1 from community_members cm
                    where cm.community_id = cp.community_id
                      and cm.user_id = p_user)  -- null p_user matches nobody
  );
$$;

-- 2. standings: rows only for a caller who may see the result ---------------------------------
-- Live definition (pg_get_functiondef, 0125's body) with two changes: the `gate` CTE and
-- `where gt.may_read`; plus the pinned search_path.
create or replace function public.standings(p_event_id uuid)
returns table(entity_id uuid, is_team boolean, points integer, wins integer, draws integer,
              losses integer, rank integer, team_number integer, participant_a_id uuid,
              participant_b_id uuid, user_a_id uuid, user_b_id uuid, name_a text, name_b text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ev as (
    select e.scoring_mode, e.specification = 'team' as team_event
    from events e where e.id = p_event_id
  ),
  viewer as (select auth.uid() as uid, event_is_visible(p_event_id, auth.uid()) as can_see),
  -- 0139: may the caller have the score rows at all? (can_see still decides the identity columns.)
  gate as (
    select (
         v.can_see                                    -- may see the event
      or is_event_organizer(p_event_id, v.uid)        -- its organizer, even once soft-deleted:
                                                      -- finish_event, set_event_ranking and
                                                      -- generate_next_round run as the organizer
      or _event_result_posted_to(p_event_id, v.uid)   -- its result was posted to the caller's
                                                      -- community (event_result_summary's rows)
      or (v.uid is null                               -- no session at all: cron, migrations, the
          and coalesce(current_setting('role', true), 'none') not in ('anon', 'authenticated')
          and coalesce(auth.role(), '') not in ('anon', 'authenticated'))
                                                      -- service role, triggers they fire — but
                                                      -- never an API role without a user
    ) as may_read
    from viewer v
  ),
  sides as (
    select m.id as match_id, mp.side, mp.participant_id,
           case mp.side when 'a' then m.side_a_score else m.side_b_score end as own,
           case mp.side when 'a' then m.side_b_score else m.side_a_score end as opp
    from event_matches m join match_players mp on mp.match_id = m.id
    where m.event_id = p_event_id and m.status = 'played'
  ),
  -- NEW: each player's pair, on a team event only.
  team_of as (
    select t.id as team_id, x.pid
    from event_teams t
    cross join lateral (values (t.player_a_id), (t.player_b_id)) as x(pid)
    where t.event_id = p_event_id and x.pid is not null
      and coalesce((select team_event from ev), false)
  ),
  -- NEW: one appearance per entity per match side — the two players of a pair on the same side of
  -- a match are ONE appearance of the team.
  appearances as (
    select distinct coalesce(tf.team_id, s.participant_id) as entity, (tf.team_id is not null) as team_row,
           s.match_id, s.side, s.own, s.opp
    from sides s left join team_of tf on tf.pid = s.participant_id
  ),
  agg as (
    select a.entity, a.team_row,
      coalesce(sum(coalesce(a.own, 0)), 0)::int as total_points,
      count(*) filter (where a.own > a.opp)::int as n_wins,
      count(*) filter (where a.own = a.opp)::int as n_draws,
      count(*) filter (where a.own < a.opp)::int as n_losses
    from appearances a group by a.entity, a.team_row
  ),
  scored as (
    select g.*,
      case (select scoring_mode from ev) when 'points' then g.total_points else 3 * g.n_wins + g.n_draws end as pts
    from agg g
  )
  select s.entity, s.team_row, s.pts, s.n_wins, s.n_draws, s.n_losses,
    rank() over (order by s.pts desc)::int,
    t.team_number,
    pa.id,
    pb.id,
    case when v.can_see then pa.user_id end,
    case when v.can_see then pb.user_id end,
    case when v.can_see then coalesce(
      case when not exists (select 1 from blocks b
                             where (b.blocker_id = v.uid and b.blocked_id = pa.user_id)
                                or (b.blocker_id = pa.user_id and b.blocked_id = v.uid))
           then pra.full_name end,
      pa.guest_name) end,
    case when v.can_see then coalesce(
      case when not exists (select 1 from blocks b
                             where (b.blocker_id = v.uid and b.blocked_id = pb.user_id)
                                or (b.blocker_id = pb.user_id and b.blocked_id = v.uid))
           then prb.full_name end,
      pb.guest_name) end
  from scored s
  cross join viewer v
  cross join gate gt
  left join event_teams t on s.team_row and t.id = s.entity
  left join event_participants pa on pa.id = case when s.team_row then t.player_a_id else s.entity end
  left join event_participants pb on s.team_row and pb.id = t.player_b_id
  left join profiles pra on pra.id = pa.user_id
  left join profiles prb on prb.id = pb.user_id
  where gt.may_read;
$$;

-- 1. event_result_summary: the same rule, the same block masking -------------------------------
-- Rewritten around standings() rather than patched: the old body's second, unmasked profiles join
-- WAS the leak. Rank, points, order, the pair form and the guest/'—' fallbacks are as before.
create or replace function public.event_result_summary(p_event_id uuid)
returns table(rank integer, name text, points integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with viewer as (
    select auth.uid() as uid
     where auth.uid() is not null
       -- Unchanged gate: a member of the event's community.
       and event_group_community(p_event_id) is not null
       and is_community_member(event_group_community(p_event_id))
       -- 0139: …who may see the event, or to whom its organizer posted the result.
       and (event_is_visible(p_event_id, auth.uid())
            or _event_result_posted_to(p_event_id, auth.uid()))
  ),
  -- Each side's display name, hidden ('—') when either side has blocked the other — standings()'s
  -- rule, for every viewer, the organizer included (their share card). A guest has no user_id, so
  -- no block can match them.
  named as (
    select s.rank, s.is_team, s.points,
           case when pa.id is null then null
                when exists (select 1 from blocks b
                              where (b.blocker_id = v.uid and b.blocked_id = pa.user_id)
                                 or (b.blocker_id = pa.user_id and b.blocked_id = v.uid))
                then '—'
                else coalesce(pra.full_name, pa.guest_name) end as name_a,
           case when pb.id is null then null
                when exists (select 1 from blocks b
                              where (b.blocker_id = v.uid and b.blocked_id = pb.user_id)
                                 or (b.blocker_id = pb.user_id and b.blocked_id = v.uid))
                then '—'
                else coalesce(prb.full_name, pb.guest_name) end as name_b
    from viewer v
    cross join standings(p_event_id) s
    left join event_participants pa on pa.id = s.participant_a_id
    left join event_participants pb on pb.id = s.participant_b_id
    left join profiles pra on pra.id = pa.user_id
    left join profiles prb on prb.id = pb.user_id
  )
  select n.rank,
         case when n.is_team
              then coalesce(nullif(concat_ws(' & ', n.name_a, n.name_b), ''), '—')
              else coalesce(n.name_a, '—') end as name,
         n.points
  from named n
  order by n.rank asc, name asc;
$$;

-- 3. player_badge_facts: no session counts as blocked -----------------------------------------
-- Live definition with one change: `auth.uid() is null or` in the `blocked` CTE; plus the pinned
-- search_path.
create or replace function public.player_badge_facts(p_user uuid)
returns table(matches_scored integer, matches_won integer, ranked_events_finished integer,
              best_placement integer, event_wins integer, longest_win_streak integer,
              longest_week_streak integer, distinct_partners integer, max_wins_with_partner integer,
              following_count integer, followers_count integer, events_attended integer,
              events_organised integer, communities_joined integer, communities_created integer,
              largest_community_created integer, groups_joined integer, signup_rank integer,
              account_age_days integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with
  -- The block rule, applied by hand because definer bypassed the policy that normally carries it.
  -- Every CTE below is empty when this is true, so a blocked viewer gets zeros rather than facts.
  -- 0139: so does a caller with no session. Every real caller is signed in; without this, a
  -- session-less call (anon, should a grant ever come back) read every counter of any user.
  blocked as (
    select auth.uid() is null or exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p_user)
         or (b.blocker_id = p_user     and b.blocked_id = auth.uid())
    ) as yes
  ),
  -- Every scored match this player was in, with whether they won it and when it happened.
  played as (
    select mm.id,
           mm.event_id,
           mp.side,
           mp.participant_id,
           coalesce(mm.submitted_at, e.starts_at) as at,
           case
             when (mp.side = 'a' and mm.side_a_score > mm.side_b_score)
               or (mp.side = 'b' and mm.side_b_score > mm.side_a_score)
             then 1 else 0
           end as won
    from match_players mp
    join event_participants ep on ep.id = mp.participant_id and ep.user_id = p_user
    join event_matches mm      on mm.id = mp.match_id
    join events e              on e.id = mm.event_id
    where mm.status = 'played'
      and mm.side_a_score is not null
      and mm.side_b_score is not null
      and e.deleted_at is null
      and not (select yes from blocked)
  ),
  -- Longest run of consecutive wins, ordered by time. Gaps and islands: subtracting a per-value
  -- row number from the global one gives a constant per run.
  win_runs as (
    select count(*) as len
    from (
      select won,
             row_number() over (order by at)
               - row_number() over (partition by won order by at) as grp
      from played
    ) s
    where won = 1
    group by won, grp
  ),
  -- Longest run of consecutive CALENDAR WEEKS containing at least one match. Truncated in UTC on
  -- purpose: the alternative is the database session's timezone, which would make a player's
  -- streak depend on which server answered.
  weeks as (
    select distinct date_trunc('week', (at at time zone 'UTC'))::date as wk from played
  ),
  week_runs as (
    select count(*) as len
    from (
      select wk, (wk - (row_number() over (order by wk) * interval '1 week'))::date as grp
      from weeks
    ) s
    group by grp
  ),
  -- Partners: anyone else on the SAME side of the SAME match. Guests have no user_id and are
  -- skipped — they are not a person you can be credited with playing alongside.
  partners as (
    select pep.user_id as partner_id, p.won
    from played p
    join match_players other on other.match_id = p.id
                            and other.side = p.side
                            and other.participant_id <> p.participant_id
    join event_participants pep on pep.id = other.participant_id
    where pep.user_id is not null and pep.user_id <> p_user
  ),
  -- Placement in every event, from `standings`' own logic with the window partitioned by event.
  agg as (
    select p.event_id, p.participant_id,
           coalesce(sum(coalesce(
             case when p.side = 'a' then mm.side_a_score else mm.side_b_score end, 0)), 0)::int as total_points,
           count(*) filter (where p.won = 1)::int as wins,
           count(*) filter (where mm.side_a_score = mm.side_b_score)::int as draws
    from played p
    join event_matches mm on mm.id = p.id
    group by p.event_id, p.participant_id
  ),
  -- Every participant of those events, so the rank is against the whole field and not just us.
  field as (
    select mm.event_id, mp.participant_id,
           coalesce(sum(coalesce(
             case when mp.side = 'a' then mm.side_a_score else mm.side_b_score end, 0)), 0)::int as total_points,
           count(*) filter (where (mp.side = 'a' and mm.side_a_score > mm.side_b_score)
                               or (mp.side = 'b' and mm.side_b_score > mm.side_a_score))::int as wins,
           count(*) filter (where mm.side_a_score = mm.side_b_score)::int as draws
    from event_matches mm
    join match_players mp on mp.match_id = mm.id
    where mm.event_id in (select event_id from agg)
      and mm.status = 'played'
      and mm.side_a_score is not null
      and mm.side_b_score is not null
    group by mm.event_id, mp.participant_id
  ),
  ranked as (
    select f.event_id, f.participant_id,
           rank() over (
             partition by f.event_id
             order by case ev.scoring_mode
                        when 'points' then f.total_points
                        else 3 * f.wins + f.draws
                      end desc
           )::int as place
    from field f
    join events ev on ev.id = f.event_id
  ),
  mine as (
    select r.place from ranked r join agg a on a.participant_id = r.participant_id and a.event_id = r.event_id
  )
  select
    (select count(*)::int from played),
    (select coalesce(sum(won), 0)::int from played),
    (select count(*)::int from group_event_results r where r.user_id = p_user and not (select yes from blocked)),
    (select min(r.final_placement)::int from group_event_results r where r.user_id = p_user and not (select yes from blocked)),
    (select count(*)::int from mine where place = 1),
    (select coalesce(max(len), 0)::int from win_runs),
    (select coalesce(max(len), 0)::int from week_runs),
    (select count(distinct partner_id)::int from partners),
    (select coalesce(max(c), 0)::int from (select count(*) as c from partners where won = 1 group by partner_id) s),
    (select count(*)::int from follows f where f.follower_id = p_user and not (select yes from blocked)),
    (select count(*)::int from follows f where f.followee_id = p_user and not (select yes from blocked)),
    (select count(*)::int
       from event_participants ep join events e on e.id = ep.event_id
      where ep.user_id = p_user and ep.status = 'confirmed'
        and e.status = 'completed' and e.deleted_at is null
        and not (select yes from blocked)),
    -- `events.organizer_id`, not a created_by — an event records who RUNS it, and 0044's
    -- `is_event_organizer` uses the same column.
    (select count(*)::int from events e
      where e.organizer_id = p_user and e.deleted_at is null and not (select yes from blocked)),
    (select count(*)::int
       from community_members cm join communities c on c.id = cm.community_id
      where cm.user_id = p_user and c.archived_at is null and not (select yes from blocked)),
    (select count(*)::int from communities c
      where c.created_by = p_user and c.archived_at is null and not (select yes from blocked)),
    (select coalesce(max(n), 0)::int from (
       select count(cm.user_id) as n
         from communities c left join community_members cm on cm.community_id = c.id
        where c.created_by = p_user and c.archived_at is null and not (select yes from blocked)
        group by c.id) s),
    -- A community's auto-created general group is not a group the player chose to join.
    (select count(*)::int
       from group_members gm join groups g on g.id = gm.group_id
      where gm.user_id = p_user and g.archived_at is null and not g.is_general
        and not (select yes from blocked)),
    -- Founding Jammer. Safe to compute on read: `soft_delete_account` bans rather than deletes and
    -- a hard delete is impossible (NOT NULL / RESTRICT foreign keys), so this ordering never shifts.
    --
    -- The block guard is a CASE here, not a WHERE, and that difference is a real bug that the
    -- test caught. `count(*) + 1` over a WHERE that excludes every row is `0 + 1` = 1 — the
    -- RAREST rank there is. A blocked viewer would have seen the subject as the very first user
    -- ever to sign up, which is the one value that unlocks Founding Jammer. Every other counter
    -- degrades safely to zero under a WHERE; this one degrades to a maximum.
    (select case when (select yes from blocked) then 0 else (
       select count(*) + 1 from profiles other
        where other.created_at < (select created_at from profiles where id = p_user)
     ) end)::int,
    -- Same reason it is a CASE: this one had no guard at all, so account age leaked past a block.
    (select case when (select yes from blocked) then 0 else (
       select (now()::date - p.created_at::date) from profiles p where p.id = p_user
     ) end)::int;
$$;

-- Grants -------------------------------------------------------------------------------------
-- The helper takes any user id: no API role may call it (definer callers run as the owner).
revoke execute on function public._event_result_posted_to(uuid, uuid) from public, anon, authenticated;
grant execute on function public._event_result_posted_to(uuid, uuid) to service_role;
-- The three reads stay exactly as 0136 left them: signed-in only.
revoke execute on function public.standings(uuid) from public, anon;
revoke execute on function public.event_result_summary(uuid) from public, anon;
revoke execute on function public.player_badge_facts(uuid) from public, anon;
grant execute on function public.standings(uuid) to authenticated;
grant execute on function public.event_result_summary(uuid) to authenticated;
grant execute on function public.player_badge_facts(uuid) to authenticated;

-- Self-check, in the spirit of 0094/0097/0101/0132–0136. Catalog state, plus the behaviour this
-- paste can observe without writing anything: it runs with no session, as an INTERNAL caller, and
-- briefly as signed-in users — a stranger (a random id that is nobody) and, where the database
-- already has them, a community member outside a private event and a viewer someone blocked. Only
-- the transaction-local JWT setting changes, and it is put back. Proving the exploits fail on
-- purpose-built data needs several users and communities, which is what the REST test
-- (infra/supabase/tests/event-result-visibility.test.mjs) does on a scratch stack — a hosted paste
-- must not create communities. The editor runs the whole paste as one transaction, so if this
-- raises, nothing above it lands. Run it as the default postgres role, never "impersonating" a user.
do $$
declare
  v_ev uuid;
  v_claims text;
  v_stranger uuid := gen_random_uuid();
  v_viewer uuid;
  v_hidden_name text;
begin
  -- 0137 first. The posted-result rule trusts author_id; that holds only while nobody can UPDATE a
  -- post and every INSERT policy pins author_id to the caller.
  if exists (select 1 from pg_policy
              where polrelid = 'public.community_posts'::regclass and polcmd in ('w', '*')) then
    raise exception '0139 needs 0137 first: community_posts still has an UPDATE policy, so an admin could re-sign a post as the organizer and publish a private result';
  end if;
  if has_any_column_privilege('anon', 'public.community_posts', 'update')
     or has_any_column_privilege('authenticated', 'public.community_posts', 'update') then
    raise exception '0139 needs 0137 first: an API role can still UPDATE community_posts';
  end if;
  if not exists (select 1 from pg_policy
                  where polrelid = 'public.community_posts'::regclass and polcmd = 'a')
     or exists (select 1 from pg_policy
                 where polrelid = 'public.community_posts'::regclass and polcmd = 'a' and polpermissive
                   and (coalesce(pg_get_expr(polwithcheck, polrelid), '') !~ '^\(\(author_id = auth\.uid\(\)\) AND '
                        or pg_get_expr(polwithcheck, polrelid) ~ ' OR ')) then
    raise exception 'a community_posts INSERT policy no longer pins author_id to the caller — anyone could sign a result post as the organizer';
  end if;

  -- Grants: the three reads signed-in only, the helper internal.
  if has_function_privilege('anon', 'public.standings(uuid)', 'execute')
     or has_function_privilege('anon', 'public.event_result_summary(uuid)', 'execute')
     or has_function_privilege('anon', 'public.player_badge_facts(uuid)', 'execute') then
    raise exception 'anon can execute standings, event_result_summary or player_badge_facts again';
  end if;
  if not (has_function_privilege('authenticated', 'public.standings(uuid)', 'execute')
          and has_function_privilege('authenticated', 'public.event_result_summary(uuid)', 'execute')
          and has_function_privilege('authenticated', 'public.player_badge_facts(uuid)', 'execute')) then
    raise exception 'authenticated lost standings, event_result_summary or player_badge_facts — the live leaderboard, result posts and badges would break';
  end if;
  if has_function_privilege('anon', 'public._event_result_posted_to(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._event_result_posted_to(uuid,uuid)', 'execute') then
    raise exception 'an API role can execute _event_result_posted_to, which answers for any user id';
  end if;

  -- All four are SECURITY DEFINER with the pinned path.
  if (select count(*) from pg_proc p
       where p.oid in ('public.standings(uuid)'::regprocedure,
                       'public.event_result_summary(uuid)'::regprocedure,
                       'public.player_badge_facts(uuid)'::regprocedure,
                       'public._event_result_posted_to(uuid,uuid)'::regprocedure)
         and p.prosecdef
         and 'search_path=public, pg_temp' = any(p.proconfig)) <> 4 then
    raise exception 'one of standings, event_result_summary, player_badge_facts, _event_result_posted_to is not security definer with search_path public, pg_temp';
  end if;

  -- The gates are in the bodies that run.
  if (select prosrc from pg_proc where oid = 'public.standings(uuid)'::regprocedure) !~ 'where gt\.may_read'
     or (select prosrc from pg_proc where oid = 'public.standings(uuid)'::regprocedure) !~ 'is_event_organizer\(p_event_id, v\.uid\)'
     or (select prosrc from pg_proc where oid = 'public.standings(uuid)'::regprocedure) !~ '_event_result_posted_to\(p_event_id, v\.uid\)'
     or (select prosrc from pg_proc where oid = 'public.standings(uuid)'::regprocedure) !~ 'not in \(''anon'', ''authenticated''\)' then
    raise exception 'standings() is missing its row gate';
  end if;
  if (select prosrc from pg_proc where oid = 'public.event_result_summary(uuid)'::regprocedure) !~ 'event_is_visible\(p_event_id, auth\.uid\(\)\)'
     or (select prosrc from pg_proc where oid = 'public.event_result_summary(uuid)'::regprocedure) !~ '_event_result_posted_to\(p_event_id, auth\.uid\(\)\)'
     or (select prosrc from pg_proc where oid = 'public.event_result_summary(uuid)'::regprocedure) !~ 'b\.blocker_id = pa\.user_id and b\.blocked_id = v\.uid' then
    raise exception 'event_result_summary() is missing its visibility gate or its block mask';
  end if;
  if (select prosrc from pg_proc where oid = 'public._event_result_posted_to(uuid,uuid)'::regprocedure) !~ 'cp\.author_id = ev\.organizer_id'
     or (select prosrc from pg_proc where oid = 'public._event_result_posted_to(uuid,uuid)'::regprocedure) !~ 'cp\.community_id = g\.community_id' then
    raise exception '_event_result_posted_to() would trust a result post its organizer did not write, or one posted to another community';
  end if;
  if (select prosrc from pg_proc where oid = 'public._event_result_posted_to(uuid,uuid)'::regprocedure) !~ 'and cp\.updated_at = cp\.created_at' then
    raise exception '_event_result_posted_to() would trust a result post that was UPDATEd after it was written — a pre-0137 admin re-sign as the organizer';
  end if;
  -- …and the stamp it reads: every UPDATE of a post must move updated_at.
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.community_posts'::regclass
                    and t.tgname = 'trg_community_posts_updated_at'
                    and t.tgenabled in ('O', 'A')
                    and pg_get_triggerdef(t.oid) ~ ' BEFORE UPDATE ON (public\.)?community_posts FOR EACH ROW EXECUTE FUNCTION (public\.)?set_updated_at\(\)$')
     or (select prosrc from pg_proc where oid = 'public.set_updated_at()'::regprocedure) !~ 'new\.updated_at := now\(\)' then
    raise exception 'trg_community_posts_updated_at no longer stamps updated_at on every UPDATE of community_posts — _event_result_posted_to could not tell a rewritten result post from the one post_event_result wrote';
  end if;
  if (select prosrc from pg_proc where oid = 'public.player_badge_facts(uuid)'::regprocedure) !~ 'select auth\.uid\(\) is null or exists' then
    raise exception 'player_badge_facts() lost its session guard';
  end if;
  if to_regclass('public.community_posts_result_event_idx') is null then
    raise exception 'community_posts_result_event_idx is missing — every result-visibility check would scan community_posts';
  end if;

  -- Behaviour, as this paste runs: no session, role postgres — an INTERNAL caller.
  -- A session-less internal caller still gets the full scoreboard (finish_event's trigger path,
  -- seeds, cron). Only checkable where some event has a scored match; a fresh reset has none.
  select m.event_id into v_ev
    from event_matches m join match_players mp on mp.match_id = m.id
   where m.status = 'played' limit 1;
  if v_ev is not null and not exists (select 1 from standings(v_ev)) then
    raise exception 'standings() returns nothing to a session-less internal caller — the group ranking would rank nobody';
  end if;
  -- The two viewer-facing reads give a session-less caller nothing.
  if v_ev is not null and exists (select 1 from event_result_summary(v_ev)) then
    raise exception 'event_result_summary() answers a caller with no session';
  end if;
  -- player_badge_facts with no session: every counter exactly 0 and best_placement NULL (min over
  -- nothing), for the nil id and for the oldest real user. Compared column by column with `=`, so
  -- a NULL from a reverted body — e.g. account_age_days for an id with no profile — fails the
  -- check instead of slipping through a NULL sum; and the nil id alone catches a revert even on a
  -- database with no profiles (signup_rank would be count(*) + 1 = 1).
  if exists (
       select 1
         from (select '00000000-0000-0000-0000-000000000000'::uuid
               union all
               (select id from profiles order by created_at limit 1)) s(u)
        where not exists (
                select 1 from player_badge_facts(s.u) f
                 where f.matches_scored = 0 and f.matches_won = 0 and f.ranked_events_finished = 0
                   and f.best_placement is null and f.event_wins = 0 and f.longest_win_streak = 0
                   and f.longest_week_streak = 0 and f.distinct_partners = 0
                   and f.max_wins_with_partner = 0 and f.following_count = 0
                   and f.followers_count = 0 and f.events_attended = 0 and f.events_organised = 0
                   and f.communities_joined = 0 and f.communities_created = 0
                   and f.largest_community_created = 0 and f.groups_joined = 0
                   and f.signup_rank = 0 and f.account_age_days = 0)) then
    raise exception 'player_badge_facts() still answers a caller with no session';
  end if;

  -- Behaviour as signed-in users. Each step below sets the transaction-local JWT setting, reads,
  -- and puts the setting back; each runs only where the database has the rows it needs (a fresh
  -- reset has none; hosted and a seeded stack do). They catch a gate or mask that is present in
  -- the text but does nothing, which the regexes above cannot. Which fence each one tests matters:
  -- event_result_summary takes its rows FROM standings(), so for "who may read this result" it is
  -- fenced twice (standings' row gate, then its own viewer gate) and a reverted summary alone still
  -- answers nothing there. The fence only the summary has is the block mask — step (c).
  v_claims := current_setting('request.jwt.claims', true);

  -- (a) A STRANGER (a random id that is nobody): a scored event they may not see (private, in a
  -- private group or community, or soft-deleted) gives no score rows and no summary. The old
  -- standings gave anyone signed in every row, so this catches standings' row gate.
  select m.event_id into v_ev
    from event_matches m
   where m.status = 'played' and not event_is_visible(m.event_id, v_stranger)
   limit 1;
  if v_ev is not null then
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
    if auth.uid() = v_stranger
       and (exists (select 1 from standings(v_ev)) or exists (select 1 from event_result_summary(v_ev))) then
      raise exception 'standings() or event_result_summary() answers a signed-in stranger for an event they may not see';
    end if;
    perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  end if;

  -- (b) A COMMUNITY MEMBER who may not see a scored event of their community (a private event, a
  -- private group they are not in) and to whom no result was posted: no score rows, no summary.
  -- The old summary's only gate was membership, so this is the case 0139 exists for; the stranger
  -- in (a) is not a member and never reached it. The organizer is left out: they keep standings
  -- of their own soft-deleted event.
  select e.id, cm.user_id into v_ev, v_viewer
    from events e
    join groups g on g.id = e.group_id
    join community_members cm on cm.community_id = g.community_id
   where exists (select 1 from event_matches m where m.event_id = e.id and m.status = 'played')
     and cm.user_id <> e.organizer_id
     and not event_is_visible(e.id, cm.user_id)
     and not _event_result_posted_to(e.id, cm.user_id)
   limit 1;
  if v_ev is not null then
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
    if auth.uid() = v_viewer
       and (exists (select 1 from standings(v_ev)) or exists (select 1 from event_result_summary(v_ev))) then
      raise exception 'standings() or event_result_summary() gives a community member the result of an event they may not see and that was not posted to them';
    end if;
    perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  end if;

  -- (c) The BLOCK MASK: a viewer who may read a result, and a scored player in it who blocked
  -- them or whom they blocked. That player's name must not be in the summary. Only pairs whose
  -- answer is unambiguous are used: no other entry of that event (player or guest) has a display
  -- name containing the hidden one, so a name part equal to it can only be that player's.
  select e.id, v.uid, pr.full_name into v_ev, v_viewer, v_hidden_name
    from blocks b
    cross join lateral (values (b.blocker_id, b.blocked_id), (b.blocked_id, b.blocker_id)) as v(uid, other)
    join event_participants ep on ep.user_id = v.other
    join events e on e.id = ep.event_id
    join groups g on g.id = e.group_id
    join profiles pr on pr.id = v.other
   where exists (select 1 from match_players mp join event_matches m on m.id = mp.match_id
                  where mp.participant_id = ep.id and m.status = 'played')
     and exists (select 1 from community_members cm
                  where cm.community_id = g.community_id and cm.user_id = v.uid)
     and (event_is_visible(e.id, v.uid) or _event_result_posted_to(e.id, v.uid))
     and pr.full_name is not null and pr.full_name <> '' and pr.full_name <> '—'
     and not exists (select 1 from event_participants o
                       left join profiles op on op.id = o.user_id
                      where o.event_id = e.id and o.id <> ep.id
                        and position(pr.full_name in coalesce(op.full_name, o.guest_name, '')) > 0)
   limit 1;
  if v_ev is not null then
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
    if auth.uid() = v_viewer
       and exists (select 1 from event_result_summary(v_ev) s
                    where v_hidden_name = any (string_to_array(s.name, ' & '))) then
      raise exception 'event_result_summary() names a player to a viewer either of them has blocked';
    end if;
    perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  end if;
end $$;
