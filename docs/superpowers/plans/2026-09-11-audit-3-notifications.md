# Notifications N3, N4, N7 and Waiting-List Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three new notification types exist with real emitters: the organizer learns when a player confirms (`participant_confirmed`), the first waiting-list player is offered a freed spot and confirms it manually (`waitlist_spot`, JM-08), and players learn when results are out (`results_published`). Both clients render them, the waitlist one with a "Confirm spot" CTA.

**Architecture:** One migration extends the type constraint, adds a trigger for confirmations, a helper that offers a freed spot, redefines `leave_event`, `organizer_remove_participant` and `finish_event` to call the emitters, and adds `claim_waitlist_spot`. The clients extend the CTA type list and the completion mutation; the push function gains copy for the new types.

**Tech Stack:** PLpgSQL, Node 22 RPC tests (`infra/supabase/tests/lib.mjs`), TypeScript, vitest, react-native, Next.js, Deno edge function, i18next.

**Spec:** `docs/superpowers/specs/2026-09-11-audit-content-seed-design.md` section 3. One refinement over the spec: when a claim fails with `spot_taken`, the row is marked read and an inline error line says the spot is gone; the row is not marked done, because "done" renders as "Confirmed".

**Prerequisites:** local stack running; `infra/supabase/tests/lib.mjs` present (from the archive-guard PR; if missing, create it from Task 1 of `docs/superpowers/plans/2026-09-11-audit-1-archive-guard.md`). Branch: `git fetch origin && git checkout -b feat/audit-notifications origin/main`.

---

### Task 1: Failing RPC tests

**Files:**
- Create: `infra/supabase/tests/notifications.test.mjs`

- [ ] **Step 1: Write the tests**

```js
// infra/supabase/tests/notifications.test.mjs
import { user, rpc, sel, del, expectError, assert, run } from './lib.mjs';

const hoursFromNow = (h) => new Date(Date.now() + h * 3600_000).toISOString();

async function groupFor(owner) {
  const communityId = await rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: 'Notif Club', p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  const [general] = await sel('groups', `community_id=eq.${communityId}&is_general=eq.true&select=id`);
  return general.id;
}
const payload = (groupId, over) => ({
  group_id: groupId, event_type: 'mexicano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: 'Notif Event', venue_id: null,
  manual_location_name: 'Arena', manual_location_address: null, has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: hoursFromNow(48), duration_minutes: 90, allow_standby: false, standby_spots: null,
  is_private: false, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});
const notifs = (userId, type, eventId) =>
  sel('notifications', `user_id=eq.${userId}&type=eq.${type}&event_id=eq.${eventId}&select=id,ref_id,cta_done,read_at`);

await run('organizer is notified once per player who confirms', async () => {
  const org = await user('org');
  const groupId = await groupFor(org);
  const p1 = await user('p1');
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, {}) });
  await del('event_invitations', `event_id=eq.${eventId}`);
  await rpc(p1.jwt, 'join_event', { p_event_id: eventId });
  const rows = await notifs(org.id, 'participant_confirmed', eventId);
  assert(rows.length === 1, `one participant_confirmed for the organizer, got ${rows.length}`);
});

await run('organizer playing their own event does not notify themselves', async () => {
  const org = await user('org2');
  const groupId = await groupFor(org);
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, { organizer_role: 'organizing_and_playing' }) });
  const rows = await notifs(org.id, 'participant_confirmed', eventId);
  assert(rows.length === 0, 'no self-notification');
});

await run('a freed confirmed spot is offered to the first waiter, who claims it', async () => {
  const org = await user('org3');
  const groupId = await groupFor(org);
  const players = [];
  for (const i of [0, 1, 2, 3]) players.push(await user(`c${i}`));
  const w1 = await user('w1');
  const w2 = await user('w2');
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, {}) });
  await del('event_invitations', `event_id=eq.${eventId}`);
  for (const p of players) await rpc(p.jwt, 'join_event', { p_event_id: eventId });
  assert((await rpc(w1.jwt, 'join_event', { p_event_id: eventId })) === 'waiting_list', 'w1 waits');
  assert((await rpc(w2.jwt, 'join_event', { p_event_id: eventId })) === 'waiting_list', 'w2 waits');

  await rpc(players[0].jwt, 'leave_event', { p_event_id: eventId });
  const offered = await notifs(w1.id, 'waitlist_spot', eventId);
  assert(offered.length === 1, `w1 offered once, got ${offered.length}`);
  assert((await notifs(w2.id, 'waitlist_spot', eventId)).length === 0, 'w2 not offered');

  // Leaving again before the claim must not duplicate the offer.
  await rpc(players[1].jwt, 'leave_event', { p_event_id: eventId });
  assert((await notifs(w1.id, 'waitlist_spot', eventId)).length === 1, 'still one offer for w1');

  assert((await rpc(w1.jwt, 'claim_waitlist_spot', { p_event_id: eventId })) === 'confirmed', 'w1 confirmed');
  const [w1row] = await sel('event_participants', `event_id=eq.${eventId}&user_id=eq.${w1.id}&select=status,waiting_list_position`);
  assert(w1row.status === 'confirmed' && w1row.waiting_list_position === null, 'w1 row confirmed');
  const [w2row] = await sel('event_participants', `event_id=eq.${eventId}&user_id=eq.${w2.id}&select=status,waiting_list_position`);
  assert(w2row.status === 'waiting_list' && w2row.waiting_list_position === 1, 'w2 renumbered to 1');
  // w1's claim freed nothing, but the second leave did: w2 must now hold an offer of their own.
  assert((await notifs(w2.id, 'waitlist_spot', eventId)).length === 1, 'w2 offered after w1 claimed');
});

await run('claiming with no free spot raises spot_taken; non-waiters are refused', async () => {
  const org = await user('org4');
  const groupId = await groupFor(org);
  const players = [];
  for (const i of [0, 1, 2, 3]) players.push(await user(`d${i}`));
  const w1 = await user('w3');
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, {}) });
  await del('event_invitations', `event_id=eq.${eventId}`);
  for (const p of players) await rpc(p.jwt, 'join_event', { p_event_id: eventId });
  await rpc(w1.jwt, 'join_event', { p_event_id: eventId });
  await expectError(() => rpc(w1.jwt, 'claim_waitlist_spot', { p_event_id: eventId }), 'spot_taken');
  await expectError(() => rpc(players[0].jwt, 'claim_waitlist_spot', { p_event_id: eventId }), 'not_on_waiting_list');
});

await run('organizer removal also offers the spot', async () => {
  const org = await user('org5');
  const groupId = await groupFor(org);
  const players = [];
  for (const i of [0, 1, 2, 3]) players.push(await user(`e${i}`));
  const w1 = await user('w4');
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, {}) });
  await del('event_invitations', `event_id=eq.${eventId}`);
  for (const p of players) await rpc(p.jwt, 'join_event', { p_event_id: eventId });
  await rpc(w1.jwt, 'join_event', { p_event_id: eventId });
  const [row] = await sel('event_participants', `event_id=eq.${eventId}&user_id=eq.${players[0].id}&select=id`);
  await rpc(org.jwt, 'organizer_remove_participant', { p_participant_id: row.id, p_mode: 'from_event' });
  assert((await notifs(w1.id, 'waitlist_spot', eventId)).length === 1, 'offered after removal');
});

await run('finishing notifies every confirmed player including an organizer who played', async () => {
  const org = await user('org6');
  const groupId = await groupFor(org);
  const players = [];
  for (const i of [0, 1, 2]) players.push(await user(`f${i}`));
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, { organizer_role: 'organizing_and_playing', starts_at: hoursFromNow(8) }) });
  await del('event_invitations', `event_id=eq.${eventId}`);
  for (const p of players) await rpc(p.jwt, 'join_event', { p_event_id: eventId });
  await rpc(org.jwt, 'start_event', { p_event_id: eventId });
  const rounds = await sel('event_rounds', `event_id=eq.${eventId}&select=id`);
  const matches = await sel('event_matches', `round_id=eq.${rounds[0].id}&select=id`);
  for (const m of matches) await rpc(org.jwt, 'submit_score', { p_match_id: m.id, p_side_a: 24, p_side_b: 16, p_not_played: false });
  await rpc(org.jwt, 'finish_event', { p_event_id: eventId, p_finish_message: null, p_counts_override: true });
  for (const p of [...players, org]) {
    assert((await notifs(p.id, 'results_published', eventId)).length === 1, `results_published for ${p.id}`);
  }
});

await run('finishing does not notify an organizer who did not play', async () => {
  const org = await user('org7');
  const groupId = await groupFor(org);
  const players = [];
  for (const i of [0, 1, 2, 3]) players.push(await user(`g${i}`));
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, { starts_at: hoursFromNow(8) }) });
  await del('event_invitations', `event_id=eq.${eventId}`);
  for (const p of players) await rpc(p.jwt, 'join_event', { p_event_id: eventId });
  await rpc(org.jwt, 'start_event', { p_event_id: eventId });
  const rounds = await sel('event_rounds', `event_id=eq.${eventId}&select=id`);
  const matches = await sel('event_matches', `round_id=eq.${rounds[0].id}&select=id`);
  for (const m of matches) await rpc(org.jwt, 'submit_score', { p_match_id: m.id, p_side_a: 24, p_side_b: 16, p_not_played: false });
  await rpc(org.jwt, 'finish_event', { p_event_id: eventId, p_finish_message: null, p_counts_override: true });
  assert((await notifs(org.id, 'results_published', eventId)).length === 0, 'organizer not notified');
  assert((await notifs(players[0].id, 'results_published', eventId)).length === 1, 'player notified');
});
```

- [ ] **Step 2: Run, expect failure**

Run: `node infra/supabase/tests/notifications.test.mjs`
Expected: the first case fails with `one participant_confirmed for the organizer, got 0`.

---

### Task 2: Migration

**Files:**
- Create: `infra/supabase/migrations/0093_notifications_confirm_waitlist_results.sql`

`leave_event` is copied from `0047_roster_rpcs.sql` lines 50 to 101, `organizer_remove_participant` from `0081_activity_logging.sql` lines 226 to 258, `finish_event` from `0048_match_engine_rpcs.sql` lines 394 to 441. Only the marked lines are new.

- [ ] **Step 1: Write the migration**

```sql
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
    return;                                                        -- an unanswered offer already stands
  end if;
  if p_actor is not null and notif_blocked(v_uid, p_actor) then return; end if;
  select full_name into v_actor from profiles where id = p_actor;
  select name into v_name from events where id = p_event_id;
  insert into notifications (user_id, type, actor_id, event_id, ref_id, actor_name, entity_name)
  values (v_uid, 'waitlist_spot', p_actor, p_event_id, v_pid, v_actor, v_name);
end; $$;

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
  -- Offers are deduplicated per waiter, so a second spot freed while the first offer stood was
  -- never announced. Now that this waiter has moved on, pass any remaining free spot down the list.
  if v_confirmed + 1 < event_capacity(p_event_id) then perform notify_waitlist_spot(p_event_id, v_user); end if;
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
  select full_name into v_actor from profiles where id = v_user;
  insert into notifications (user_id, type, actor_id, event_id, actor_name, entity_name)
  select ep.user_id, 'results_published', v_user, p_event_id, v_actor, v_ev.name
  from event_participants ep
  where ep.event_id = p_event_id and ep.status = 'confirmed' and ep.user_id is not null
    and not notif_blocked(ep.user_id, v_user);
end; $$;
```

- [ ] **Step 2: Apply and run the tests**

Run:
```bash
pnpm dlx supabase@latest --workdir infra db reset
node infra/supabase/tests/notifications.test.mjs
```
Expected: seven `✔`.

- [ ] **Step 3: Run the older RPC tests too**

Run: `node infra/supabase/tests/archive-guard.test.mjs && node infra/supabase/tests/mixed-start.test.mjs`
Expected: all `✔` (they exist if the earlier PRs merged; skip any that is absent).

- [ ] **Step 4: Commit**

```bash
git add infra/supabase/migrations/0093_notifications_confirm_waitlist_results.sql infra/supabase/tests/notifications.test.mjs
git commit -m "feat(db): participant_confirmed, waitlist_spot and results_published notifications, claim_waitlist_spot"
```

---

### Task 3: RPC typing and error codes

**Files:**
- Modify: `packages/db/src/database.types.ts` (public `Functions` block; insert alphabetically, next to `can_create_community` at line 2346)
- Modify: `packages/api/src/client.ts` (`KNOWN`, events lines)
- Modify: `packages/api/src/client.test.ts`

- [ ] **Step 1: Type the RPC**

Add after the `can_review_community` entry (or wherever `cl…` sorts in that block):

```ts
      claim_waitlist_spot: { Args: { p_event_id: string }; Returns: string }
```

- [ ] **Step 2: Extend the mapper test**

```ts
  it('maps the waiting-list claim codes', () => {
    expect(mapPgError({ message: 'not_on_waiting_list' })).toBe('not_on_waiting_list');
    expect(mapPgError({ message: 'spot_taken' })).toBe('spot_taken');
  });
```

- [ ] **Step 3: Run, expect failure, then add the codes**

Run: `pnpm --filter @padel/api test -- client.test.ts` → the new case fails.

In `KNOWN`, change the line starting with `'event_full'`:

```ts
  'event_full', 'leave_deadline_passed', 'already_joined', 'not_invited', 'not_participant',
  'not_on_waiting_list', 'spot_taken',
```

- [ ] **Step 4: Run, expect pass, commit**

Run: `pnpm --filter @padel/api test -- client.test.ts && pnpm typecheck`

```bash
git add packages/db/src/database.types.ts packages/api/src/client.ts packages/api/src/client.test.ts
git commit -m "feat(api): type claim_waitlist_spot and map its codes"
```

---

### Task 4: CTA completion for waitlist_spot

**Files:**
- Modify: `packages/api/src/notifications/mutations.ts:58-86`
- Create: `packages/api/src/notifications/mutations.test.ts`

The RPC choice is pulled into a pure exported function so it can be unit tested without a client.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/notifications/mutations.test.ts
import { describe, expect, it } from 'vitest';
import { ctaCall, CTA_TYPES } from './mutations';
import type { NotificationRow } from './queries';

const base: NotificationRow = {
  id: 'n1', type: 'event_invite', actor_id: null, event_id: 'e1', group_id: null, community_id: null,
  ref_id: null, actor_name: null, entity_name: null, read_at: null, cta_done: false, created_at: '2026-01-01T00:00:00Z',
};

describe('ctaCall', () => {
  it('routes each CTA type to its RPC', () => {
    expect(ctaCall(base)).toEqual({ fn: 'accept_event_invitation', args: { p_event_id: 'e1' } });
    expect(ctaCall({ ...base, type: 'group_invite', event_id: null, group_id: 'g1' }))
      .toEqual({ fn: 'accept_group_invitation', args: { p_group_id: 'g1' } });
    expect(ctaCall({ ...base, type: 'community_invite', event_id: null, ref_id: 'inv1' }))
      .toEqual({ fn: 'accept_invitation', args: { p_invitation_id: 'inv1' } });
    expect(ctaCall({ ...base, type: 'waitlist_spot' }))
      .toEqual({ fn: 'claim_waitlist_spot', args: { p_event_id: 'e1' } });
  });
  it('returns null for non-CTA rows', () => {
    expect(ctaCall({ ...base, type: 'follow' })).toBeNull();
    expect(ctaCall({ ...base, type: 'waitlist_spot', event_id: null })).toBeNull();
  });
  it('lists the CTA types once for both clients', () => {
    expect([...CTA_TYPES]).toEqual(['event_invite', 'group_invite', 'community_invite', 'waitlist_spot']);
  });
});
```

If `NotificationRow` has fields beyond those in `base`, add them with `null`/`false` values so the object typechecks; check `packages/api/src/notifications/queries.ts:8-22`.

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter @padel/api test -- notifications/mutations.test.ts`

- [ ] **Step 3: Implement**

Replace the `useCompleteNotificationCta` block with:

```ts
/** Notification types that carry an inline CTA. Shared by mobile and web. */
export const CTA_TYPES: ReadonlySet<string> = new Set([
  'event_invite', 'group_invite', 'community_invite', 'waitlist_spot',
]);

/** Which RPC a CTA notification's button calls, or null when the row carries no CTA. */
export function ctaCall(
  n: NotificationRow,
): { fn: 'accept_event_invitation' | 'accept_group_invitation' | 'accept_invitation' | 'claim_waitlist_spot'; args: Record<string, string> } | null {
  // Arg names match the existing accept hooks exactly: event/group accept by
  // ENTITY id, community accepts by INVITATION id (ref_id).
  if (n.type === 'event_invite' && n.event_id) return { fn: 'accept_event_invitation', args: { p_event_id: n.event_id } };
  if (n.type === 'group_invite' && n.group_id) return { fn: 'accept_group_invitation', args: { p_group_id: n.group_id } };
  if (n.type === 'community_invite' && n.ref_id) return { fn: 'accept_invitation', args: { p_invitation_id: n.ref_id } };
  if (n.type === 'waitlist_spot' && n.event_id) return { fn: 'claim_waitlist_spot', args: { p_event_id: n.event_id } };
  return null;
}

// Acts on a CTA notification's button, then flips cta_done. A waiting-list claim that
// finds no free spot marks the row read (the offer is stale) and rethrows 'spot_taken'.
export const useCompleteNotificationCta = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (n: NotificationRow) => {
      const call = ctaCall(n);
      if (!call) throw new Error('not_a_cta_notification');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- args are shaped per-fn above
      const { error } = await db.rpc(call.fn, call.args as any);
      if (error) {
        const code = mapPgError(error) ?? 'unknown_error';
        if (code === 'spot_taken') {
          await db.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id);
          invalidate(qc);
        }
        throw new Error(code);
      }
      const { error: upErr } = await db
        .from('notifications')
        .update({ cta_done: true, read_at: new Date().toISOString() })
        .eq('id', n.id);
      if (upErr) throw upErr;
    },
    onSuccess: () => invalidate(qc),
  });
};
```

Add `import { mapPgError, useDb } from '../client';` in place of the existing `useDb` import at the top of the file.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @padel/api test && pnpm typecheck`
Expected: green. If `db.rpc(call.fn, …)` fails to typecheck because the union of arg shapes does not narrow, keep the `as any` cast with the eslint disable shown.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/notifications/mutations.ts packages/api/src/notifications/mutations.test.ts
git commit -m "feat(api): confirm-spot CTA calls claim_waitlist_spot"
```

---

### Task 5: Mobile notifications screen

**Files:**
- Modify: `apps/mobile/app/notifications/index.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts` (`mobileNotifications`, three locales; anchors: `event_updated` lines at 2862, 2891, 2920 and `joined` at 2846, 2875, 2904)

- [ ] **Step 1: Use the shared CTA list and per-type labels**

Change the import line to include the shared set:

```ts
import {
  CTA_TYPES,
  useClearAll,
  useCompleteNotificationCta,
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  usePartnerRequestSummary,
  type NotificationRow,
} from '@padel/api';
```

Delete the local `const CTA_TYPES = [...]` line.

Add two helpers below `targetHref`:

```ts
function ctaLabel(t: (k: string) => string, type: string): string {
  return type === 'waitlist_spot' ? t('confirmSpot') : t('join');
}
function ctaDoneLabel(t: (k: string) => string, type: string): string {
  return type === 'waitlist_spot' ? t('spotConfirmed') : t('joined');
}
```

Replace the `renderItem` row's `trailing` and `trailingLabel` props:

```tsx
              trailing={
                CTA_TYPES.has(item.type) ? (
                  item.cta_done ? (
                    <Text variant="hint" tone="success">{ctaDoneLabel(t, item.type)}</Text>
                  ) : (
                    <Button label={ctaLabel(t, item.type)} size="sm" onPress={() => completeCta.mutate(item)} />
                  )
                ) : null
              }
              trailingLabel={
                CTA_TYPES.has(item.type) && item.cta_done ? ctaDoneLabel(t, item.type) : undefined
              }
```

Above the `{list.isLoading ? (` line add the inline error:

```tsx
      {completeCta.isError ? (
        <Text variant="caption" tone="destructive" style={styles.empty} accessibilityRole="alert">
          {t(completeCta.error instanceof Error ? completeCta.error.message : 'unknown_error', { defaultValue: t('respondError') })}
        </Text>
      ) : null}
```

If `Text`'s `tone` prop has no `destructive` value (check `apps/mobile/components/ui/Text.tsx`), use `style={[styles.empty, { color: colors.destructive }]}` instead of `tone`.

- [ ] **Step 2: Add copy**

In each locale of `mobileNotifications`, after `joined`:

pt-PT:
```ts
    confirmSpot: 'Confirmar vaga',
    spotConfirmed: 'Confirmado',
    spot_taken: 'Essa vaga já foi ocupada.',
    not_on_waiting_list: 'Já não estás na lista de espera.',
    event_closed: 'As inscrições para este evento já fecharam.',
```
pt-BR:
```ts
    confirmSpot: 'Confirmar vaga',
    spotConfirmed: 'Confirmado',
    spot_taken: 'Essa vaga já foi ocupada.',
    not_on_waiting_list: 'Você não está mais na lista de espera.',
    event_closed: 'As inscrições para este evento já fecharam.',
```
en:
```ts
    confirmSpot: 'Confirm spot',
    spotConfirmed: 'Confirmed',
    spot_taken: 'That spot has already been taken.',
    not_on_waiting_list: 'You are no longer on the waiting list.',
    event_closed: 'Joining has closed for this event.',
```

After `event_updated` in each locale:

pt-PT:
```ts
    participant_confirmed: '{{actor}} confirmou presença em {{entity}}',
    waitlist_spot: 'Abriu uma vaga em {{entity}}',
    results_published: 'Os resultados de {{entity}} já estão disponíveis',
```
pt-BR:
```ts
    participant_confirmed: '{{actor}} confirmou presença em {{entity}}',
    waitlist_spot: 'Abriu uma vaga em {{entity}}',
    results_published: 'Os resultados de {{entity}} já estão disponíveis',
```
en:
```ts
    participant_confirmed: '{{actor}} confirmed for {{entity}}',
    waitlist_spot: 'A spot opened in {{entity}}',
    results_published: 'Results for {{entity}} are out',
```

- [ ] **Step 3: Check and commit**

Run: `pnpm i18n:check && pnpm --filter mobile typecheck && pnpm --filter mobile lint`

```bash
git add apps/mobile/app/notifications/index.tsx apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): render the three new notification types with a Confirm spot CTA"
```

---

### Task 6: Web notification item

**Files:**
- Modify: `apps/web/src/components/notifications/NotificationItem.tsx`
- Modify: `apps/web/src/lib/i18n-web.ts` (`webNotifications`, three locales; anchors: `event_updated` and `joined` in each block starting at lines 1949, 1980, 2010)

- [ ] **Step 1: Use the shared CTA list**

Change the api import to `import { CTA_TYPES, useMarkRead, useCompleteNotificationCta, type NotificationRow } from '@padel/api';` and delete the local `const CTA_TYPES = new Set([...])`.

Replace the CTA block at the end of the component:

```tsx
      {CTA_TYPES.has(n.type) ? (
        n.cta_done ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {n.type === 'waitlist_spot' ? t('spotConfirmed') : t('joined')}
          </span>
        ) : (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                completeCta.mutate(n);
              }}
            >
              {n.type === 'waitlist_spot' ? t('confirmSpot') : t('join')}
            </Button>
            {completeCta.isError ? (
              <span role="alert" className="text-xs text-destructive">
                {t(completeCta.error instanceof Error ? completeCta.error.message : 'unknown_error', { defaultValue: t('respondError') })}
              </span>
            ) : null}
          </div>
        )
      ) : null}
```

- [ ] **Step 2: Add the same copy as mobile**

In each locale of `webNotifications`, after `joined`: the five keys `confirmSpot`, `spotConfirmed`, `spot_taken`, `not_on_waiting_list`, `event_closed` with the strings from Task 5 Step 2. After `event_updated`: `participant_confirmed`, `waitlist_spot`, `results_published` with the strings from Task 5 Step 2.

- [ ] **Step 3: Check and commit**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`

```bash
git add apps/web/src/components/notifications/NotificationItem.tsx apps/web/src/lib/i18n-web.ts
git commit -m "feat(web): render the three new notification types with a Confirm spot CTA"
```

---

### Task 7: Push copy

**Files:**
- Modify: `infra/supabase/functions/send-push/index.ts:7-19`

- [ ] **Step 1: Add the cases**

Replace the `render` function:

```ts
// Server-side copy for each notification type (mirrors the in-app notification lines).
function render(n: { type: string; actor_name: string | null; entity_name: string | null }): { title: string; body: string } {
  const actor = n.actor_name ?? 'Someone';
  const entity = n.entity_name ?? '';
  switch (n.type) {
    case 'follow': return { title: 'Padel Jam', body: `${actor} followed you` };
    case 'event_invite': return { title: 'Event invite', body: `${actor} invited you to ${entity}` };
    case 'group_invite': return { title: 'Group invite', body: `${actor} invited you to ${entity}` };
    case 'community_invite': return { title: 'Community invite', body: `${actor} invited you to ${entity}` };
    case 'community_request_accepted': return { title: 'Request accepted', body: `Your request to join ${entity} was accepted` };
    case 'follow_joined_event': return { title: 'Padel Jam', body: `${actor} joined ${entity}` };
    case 'event_cancelled': return { title: 'Event cancelled', body: `${entity} was cancelled` };
    case 'event_updated': return { title: 'Event updated', body: `${entity} was updated — check the new details` };
    case 'participant_confirmed': return { title: 'Player confirmed', body: `${actor} confirmed for ${entity}` };
    case 'waitlist_spot': return { title: 'A spot opened', body: `A spot opened in ${entity} — confirm it before it goes` };
    case 'results_published': return { title: 'Results are out', body: `Results for ${entity} are out` };
    default: return { title: 'Padel Jam', body: 'You have a new notification' };
  }
}
```

- [ ] **Step 2: Type-check the function with Deno if available**

Run: `which deno && deno check infra/supabase/functions/send-push/index.ts || echo "deno not installed; skipped"`

- [ ] **Step 3: Commit**

```bash
git add infra/supabase/functions/send-push/index.ts
git commit -m "feat(push): copy for the new notification types"
```

---

### Task 8: Verification and PR

- [ ] **Step 1: Repo checks**

Run: `pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test`

- [ ] **Step 2: Fresh reset and the RPC suite**

Run:
```bash
pnpm dlx supabase@latest --workdir infra db reset
node infra/supabase/tests/notifications.test.mjs
```
Expected: seven `✔`.

- [ ] **Step 3: Simulator walk**

Seed with `pnpm seed:e2e`. Log in as `maria@padeljam.test` / `demo1234`. In the E2E seed, `Waitlist Only` (E9) is full with joao, sofia and rita confirmed. As `alex@…` join it (lands on the waiting list), then as `joao@…` leave it. Back as alex, open Notifications: a row "A spot opened in Waitlist Only" with a Confirm spot button. Tap it: the row reads "Confirmed" and the event detail shows "You're going".

- [ ] **Step 4: PR**

```bash
git push -u origin feat/audit-notifications
gh pr create --title "feat: participant confirmed, waiting-list spot and results notifications (JM-08)" --body "$(cat <<'EOF'
Implements section 3 of docs/superpowers/specs/2026-09-11-audit-content-seed-design.md.

- 0093: three new notification types; trigger on confirmations; freed confirmed spots are offered to the first waiter (no auto-confirmation); claim_waitlist_spot; results_published on finish
- CTA_TYPES and ctaCall() shared by mobile and web; Confirm spot CTA; inline error when the spot is gone
- send-push copy for the new types plus the two existing ones that fell through to the default

Deployment note: the hosted project needs the migration pasted in the SQL editor and send-push redeployed by an owner.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
