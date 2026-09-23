// infra/supabase/tests/badge-facts.test.mjs
//
// Migration 0105 — the counters behind the badge catalogue.
//
// Through PostgREST with real user JWTs, never the service key: `player_badge_facts` is
// `security definer`, so the block rule written INTO its body is the only fence there is, and a
// test running as service-role cannot see that fence fall.
//
// The two assertions worth reading are the last two: that a blocked viewer gets nothing, and that
// the numbers agree with `get_player_profile`. The second is the whole reason the function returns
// two different "matches played" — a badge that contradicts the figure printed beside it on the
// same screen is worse than no badge.
import { user, rpc, anonRpc, insert, assert, run } from './lib.mjs';

const facts = async (u, target) => (await rpc(u.jwt, 'player_badge_facts', { p_user: target }))[0];
const profile = async (u, target) => (await rpc(u.jwt, 'get_player_profile', { p_target: target }))[0];

await run('a brand-new account reads as all zeros, not nulls', async () => {
  const u = await user('badgeZero');
  const f = await facts(u, u.id);
  assert(f, 'a row comes back for a user with no history');
  for (const k of [
    'matches_scored', 'matches_won', 'ranked_events_finished', 'event_wins',
    'longest_win_streak', 'longest_week_streak', 'distinct_partners', 'max_wins_with_partner',
    'following_count', 'followers_count', 'events_attended', 'events_organised',
    'communities_joined', 'communities_created', 'largest_community_created', 'groups_joined',
  ]) {
    assert(f[k] === 0, `${k} is 0, got ${JSON.stringify(f[k])}`);
  }
  // Rank is 1-based and everyone has one; age is a real number of days.
  assert(f.signup_rank >= 1, `signup_rank is at least 1, got ${f.signup_rank}`);
  assert(f.account_age_days >= 0, `account_age_days is not negative, got ${f.account_age_days}`);
  // Only placement may legitimately be null — a player with no ranked event has no best position.
  assert(f.best_placement === null, 'best_placement is null with no ranked events');
});

await run('creating a community moves exactly the counters it should', async () => {
  const u = await user('badgeFounder');
  const before = await facts(u, u.id);
  assert(before.communities_created === 0, 'starts at zero');

  await rpc(u.jwt, 'create_community_with_personal_tenant', {
    p_name: 'Badge Club', p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });

  const after = await facts(u, u.id);
  assert(after.communities_created === 1, `communities_created 1, got ${after.communities_created}`);
  assert(after.communities_joined === 1, `the creator is also a member, got ${after.communities_joined}`);
  assert(after.largest_community_created === 1, `one member so far, got ${after.largest_community_created}`);
  // The auto-created general group is not a group the player chose to join.
  assert(after.groups_joined === 0, `general group excluded, got ${after.groups_joined}`);
  // Nothing about playing changed.
  assert(after.matches_scored === 0 && after.events_attended === 0, 'play counters untouched');
});

await run('follows land on following_count, and the other direction on followers_count', async () => {
  const a = await user('badgeFollowA');
  const b = await user('badgeFollowB');
  await insert('follows', { follower_id: a.id, followee_id: b.id });

  const fa = await facts(a, a.id);
  const fb = await facts(b, b.id);
  assert(fa.following_count === 1, `A follows 1, got ${fa.following_count}`);
  assert(fa.followers_count === 0, `A has 0 followers, got ${fa.followers_count}`);
  assert(fb.followers_count === 1, `B has 1 follower, got ${fb.followers_count}`);
  assert(fb.following_count === 0, `B follows 0, got ${fb.following_count}`);
});

await run('a block hides the facts in BOTH directions', async () => {
  const viewer = await user('badgeViewer');
  const subject = await user('badgeSubject');

  // Community membership, NOT a follow. `block_user` deletes follow edges in both directions, so a
  // follow would be gone after the unblock and could not prove the counters came back — it would
  // look like the block was still in force. Membership survives a block, so it isolates the thing
  // under test: the predicate inside the function, not a side effect of the RPC that sets it up.
  const cid = await rpc(subject.jwt, 'create_community_with_personal_tenant', {
    p_name: 'Blocked Facts Club', p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  assert(cid, 'the community was created');

  const open = await facts(viewer, subject.id);
  assert(open.communities_created === 1, `readable before the block, got ${open.communities_created}`);

  // The VIEWER blocks the subject.
  await rpc(viewer.jwt, 'block_user', { p_target: subject.id });
  const blocked = await facts(viewer, subject.id);
  assert(blocked.communities_created === 0, 'blocked: counters collapse to zero');
  assert(blocked.communities_joined === 0, 'blocked: every counter, not just one');

  // And symmetrically — the SUBJECT reading the VIEWER gets the same nothing. This is the half a
  // one-directional predicate would let through, and the half `profiles` RLS gets right for free
  // while a definer function has to be told.
  const reverse = await facts(subject, viewer.id);
  assert(reverse.signup_rank === 0, `blocked the other way too, got signup_rank ${reverse.signup_rank}`);

  await rpc(viewer.jwt, 'unblock_user', { p_target: subject.id });
  const reopened = await facts(viewer, subject.id);
  assert(reopened.communities_created === 1, 'unblocking restores the counters');
});

await run('the counters agree with get_player_profile, so a badge cannot contradict the stat card', async () => {
  const u = await user('badgeParity');
  const other = await user('badgeParityOther');
  await insert('follows', { follower_id: other.id, followee_id: u.id });

  const f = await facts(u, u.id);
  const p = await profile(u, u.id);
  assert(p, 'the profile row comes back');
  assert(
    f.ranked_events_finished === Number(p.played_matches),
    `ranked_events_finished ${f.ranked_events_finished} === played_matches ${p.played_matches}`,
  );
  assert(
    (f.best_placement ?? null) === (p.best_position ?? null),
    `best_placement ${f.best_placement} === best_position ${p.best_position}`,
  );
  assert(
    f.followers_count === Number(p.followers_count),
    `followers_count ${f.followers_count} === ${p.followers_count}`,
  );
});

await run('the function is not callable by anon', async () => {
  // `anonRpc`, not `rpc(null, ...)`. The plain helper falls back to the SERVICE key, which bypasses
  // grants altogether — so it can neither prove a function is closed to anon nor that a pre-auth
  // one is open to it. This is the same distinction `internal-rpc-privileges.test.mjs` exists for,
  // and 0030's default privileges mean a bare `create or replace` re-grants execute to anon unless
  // the revoke/grant pair is re-issued.
  let refused = false;
  try {
    await anonRpc('player_badge_facts', { p_user: '00000000-0000-0000-0000-000000000000' });
  } catch {
    refused = true;
  }
  assert(refused, 'anon cannot execute player_badge_facts');
});
