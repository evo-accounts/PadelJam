// infra/supabase/tests/engine-pairs.test.mjs
//
// Migration 0126: the round engine forms pairs by the event's modality (UX-MEVT-23/25/27,
// UX-LIVE-20, IN-PROGRESS §5.4). A team event's pair is never split; a mixed event's side is always
// one man and one woman; below capacity the engine seats what fills a court and rests the rest
// fairly (whole teams, balanced men / women); Up & Down brings its resters back in. The roster is
// written with the service role (guests with a gender); the organizer starts the event and adds
// rounds through PostgREST, the path the app takes.
import { user, rpc, sel, insert, expectError, assert, run } from './lib.mjs';

const hoursFromNow = (h) => new Date(Date.now() + h * 36e5).toISOString();
const tag = () => Math.random().toString(36).slice(2, 8);

const payload = (groupId, over) => ({
  group_id: groupId, event_type: 'mexicano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: `Engine ${tag()}`, venue_id: null,
  manual_location_name: 'Court', manual_location_address: 'Somewhere', has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 2, starts_at: hoursFromNow(72), duration_minutes: 90,
  allow_standby: true, standby_spots: 4, is_private: false, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});

/** An organizer, their community's general group, and an event with `over`. */
async function event(t, over) {
  const org = await user(`${t}-org`);
  const communityId = await rpc(org.jwt, 'create_community_with_personal_tenant', {
    p_name: `Engine ${t} ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  const [general] = await sel('groups', `community_id=eq.${communityId}&is_general=eq.true&select=id`);
  const ev = await rpc(org.jwt, 'create_event', { p_payload: payload(general.id, over) });
  return { org, ev };
}

/** Confirmed guests, one per gender given ('male' | 'female'), in join order. */
async function guests(ev, genders) {
  const ids = [];
  for (const [i, g] of genders.entries()) {
    const [r] = await insert('event_participants', {
      event_id: ev, guest_name: `G${i + 1}`, guest_gender: g, status: 'confirmed',
      confirmed_at: new Date().toISOString(),
    });
    ids.push(r.id);
  }
  return ids;
}

/** Confirmed pairs from consecutive ids: [[a, b], [c, d], …]. */
async function teams(ev, ids) {
  const pairs = [];
  for (let i = 0; i + 1 < ids.length; i += 2) pairs.push([ids[i], ids[i + 1]]);
  await insert('event_teams', pairs.map(([a, b], i) => ({
    event_id: ev, team_number: i + 1, player_a_id: a, player_b_id: b, is_confirmed: true,
  })));
  return pairs;
}

/** Every round: its matches' sides and its resters. */
async function rounds(ev) {
  const rows = await sel('event_rounds',
    `event_id=eq.${ev}&order=round_number.asc&select=id,round_number,round_rest(participant_id),` +
    'event_matches(id,court_number,status,match_players(participant_id,side))');
  return rows.map((r) => ({
    n: r.round_number,
    rests: r.round_rest.map((x) => x.participant_id),
    matches: r.event_matches
      .sort((a, b) => a.court_number - b.court_number)
      .map((m) => ({
        id: m.id, court: m.court_number,
        a: m.match_players.filter((p) => p.side === 'a').map((p) => p.participant_id),
        b: m.match_players.filter((p) => p.side === 'b').map((p) => p.participant_id),
      })),
  }));
}

/** Score the last round (side a wins on odd courts, side b on even — so both move), then add one. */
async function nextRound(org, ev) {
  const all = await rounds(ev);
  for (const m of all[all.length - 1].matches) {
    const aWins = m.court % 2 === 1;
    await rpc(org.jwt, 'submit_score', { p_match_id: m.id, p_side_a: aWins ? 6 : 2, p_side_b: aWins ? 2 : 6 });
  }
  await rpc(org.jwt, 'generate_next_round', { p_event_id: ev });
}

/** No one twice in a round, and everyone plays or rests. */
function checkRound(r, everyone) {
  const seen = [...r.matches.flatMap((m) => [...m.a, ...m.b]), ...r.rests];
  assert(new Set(seen).size === seen.length, `round ${r.n}: nobody twice (${seen.length})`);
  assert(seen.length === everyone.length, `round ${r.n}: everyone plays or rests (${seen.length}/${everyone.length})`);
  for (const m of r.matches) assert(m.a.length === 2 && m.b.length === 2, `round ${r.n}: two a side`);
}

const key = (side) => [...side].sort().join('|');
const counts = (list) => list.reduce((acc, x) => ((acc[x] = (acc[x] ?? 0) + 1), acc), {});

// ---------------------------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------------------------
for (const type of ['mexicano', 'up_and_down']) {
  await run(`team ${type}: 5 pairs on 2 courts — pairs never split, a whole team rests, rests rotate`, async () => {
    const t = `tm${tag()}`;
    const { org, ev } = await event(t, { event_type: type, specification: 'team', num_courts: 2 });
    const ids = await guests(ev, Array(10).fill('male'));
    const pairs = await teams(ev, ids);
    const pairKeys = new Set(pairs.map(key));
    await rpc(org.jwt, 'start_event', { p_event_id: ev });
    for (let i = 0; i < 4; i++) await nextRound(org, ev);

    const all = await rounds(ev);
    assert(all.length === 5, `five rounds, got ${all.length}`);
    const restedTeams = [];
    for (const r of all) {
      checkRound(r, ids);
      assert(r.matches.length === 2, `round ${r.n}: both courts used`);
      for (const m of r.matches) {
        assert(pairKeys.has(key(m.a)) && pairKeys.has(key(m.b)), `round ${r.n} court ${m.court}: sides are event pairs`);
      }
      assert(r.rests.length === 2 && pairKeys.has(key(r.rests)), `round ${r.n}: one whole team rests`);
      restedTeams.push(key(r.rests));
    }
    const c = counts(restedTeams);
    assert(Object.keys(c).length === 5 && Object.values(c).every((n) => n === 1),
      `each team rests exactly once over 5 rounds (${JSON.stringify(c)})`);
  });
}

await run('team, below capacity: 3 pairs on 2 courts play one court, the resting team comes back', async () => {
  const t = `tb${tag()}`;
  const { org, ev } = await event(t, { event_type: 'up_and_down', specification: 'team', num_courts: 2 });
  const ids = await guests(ev, Array(6).fill('female'));
  const pairs = await teams(ev, ids);
  const pairKeys = new Set(pairs.map(key));
  await rpc(org.jwt, 'start_event', { p_event_id: ev });
  for (let i = 0; i < 2; i++) await nextRound(org, ev);
  const all = await rounds(ev);
  const rested = [];
  for (const r of all) {
    checkRound(r, ids);
    assert(r.matches.length === 1, `round ${r.n}: one court (largest multiple of 4)`);
    assert(pairKeys.has(key(r.matches[0].a)) && pairKeys.has(key(r.matches[0].b)), `round ${r.n}: pair v pair`);
    rested.push(key(r.rests));
  }
  assert(new Set(rested).size === 3, `every team rests once over 3 rounds (${rested.join(' / ')})`);
});

// ---------------------------------------------------------------------------------------------
// Mixed
// ---------------------------------------------------------------------------------------------
for (const type of ['mexicano', 'up_and_down']) {
  await run(`mixed ${type}: 4 men + 4 women on 2 courts — every side one man and one woman`, async () => {
    const t = `mx${tag()}`;
    const { org, ev } = await event(t, { event_type: type, specification: 'mixed', num_courts: 2 });
    const ids = await guests(ev, ['male', 'female', 'male', 'female', 'male', 'female', 'male', 'female']);
    const gender = Object.fromEntries(ids.map((id, i) => [id, i % 2 === 0 ? 'male' : 'female']));
    await rpc(org.jwt, 'start_event', { p_event_id: ev });
    for (let i = 0; i < 3; i++) await nextRound(org, ev);
    for (const r of await rounds(ev)) {
      checkRound(r, ids);
      assert(r.matches.length === 2 && r.rests.length === 0, `round ${r.n}: everyone plays`);
      for (const m of r.matches) for (const side of [m.a, m.b]) {
        const g = side.map((p) => gender[p]).sort().join(',');
        assert(g === 'female,male', `round ${r.n} court ${m.court}: a man and a woman a side (${g})`);
      }
    }
  });
}

await run('mixed, below capacity: 3 men + 3 women on 2 courts — one court, a man and a woman rest, fairly', async () => {
  const t = `mb${tag()}`;
  const { org, ev } = await event(t, { event_type: 'mexicano', specification: 'mixed', num_courts: 2 });
  const ids = await guests(ev, ['male', 'female', 'male', 'female', 'male', 'female']);
  const gender = Object.fromEntries(ids.map((id, i) => [id, i % 2 === 0 ? 'male' : 'female']));
  await rpc(org.jwt, 'start_event', { p_event_id: ev });
  for (let i = 0; i < 2; i++) await nextRound(org, ev);
  const restCount = {};
  for (const r of await rounds(ev)) {
    checkRound(r, ids);
    assert(r.matches.length === 1, `round ${r.n}: one court`);
    for (const side of [r.matches[0].a, r.matches[0].b]) {
      assert(side.map((p) => gender[p]).sort().join(',') === 'female,male', `round ${r.n}: mixed side`);
    }
    assert(r.rests.map((p) => gender[p]).sort().join(',') === 'female,male', `round ${r.n}: a man and a woman rest`);
    for (const p of r.rests) restCount[p] = (restCount[p] ?? 0) + 1;
  }
  assert(Object.keys(restCount).length === 6 && Object.values(restCount).every((n) => n === 1),
    `everyone rests once over 3 rounds (${JSON.stringify(restCount)})`);
});

// ---------------------------------------------------------------------------------------------
// Classic
// ---------------------------------------------------------------------------------------------
await run('classic up & down with stand-by: the round-1 rester comes back, rests are written and rotate', async () => {
  const t = `cu${tag()}`;
  const { org, ev } = await event(t, { event_type: 'up_and_down', specification: 'classic', num_courts: 1 });
  const ids = await guests(ev, Array(5).fill('male'));
  await rpc(org.jwt, 'start_event', { p_event_id: ev });
  for (let i = 0; i < 4; i++) await nextRound(org, ev);
  const all = await rounds(ev);
  const restCount = {};
  for (const r of all) {
    checkRound(r, ids);
    assert(r.rests.length === 1, `round ${r.n}: one rests`);
    restCount[r.rests[0]] = (restCount[r.rests[0]] ?? 0) + 1;
  }
  const r1Rester = all[0].rests[0];
  assert(all[1].matches[0].a.concat(all[1].matches[0].b).includes(r1Rester), 'the round-1 rester plays round 2');
  assert(Object.keys(restCount).length === 5, `everyone rests once over 5 rounds (${JSON.stringify(restCount)})`);
});

await run('classic mexicano: 8 on 2 courts, round 2 is 1 + 4 v 2 + 3 by standing (unchanged)', async () => {
  const t = `cm${tag()}`;
  const { org, ev } = await event(t, { event_type: 'mexicano', specification: 'classic', num_courts: 2 });
  const ids = await guests(ev, Array(8).fill('male'));
  await rpc(org.jwt, 'start_event', { p_event_id: ev });
  await nextRound(org, ev);
  const [, r2] = await rounds(ev);
  checkRound(r2, ids);
  const st = await rpc(org.jwt, 'standings', { p_event_id: ev });
  const rank = Object.fromEntries(st.map((s) => [s.entity_id, s.rank]));
  // Court 1 holds the four best; its sides mix a top-2 player with a bottom-2 player.
  const c1 = [...r2.matches[0].a, ...r2.matches[0].b];
  const c2 = [...r2.matches[1].a, ...r2.matches[1].b];
  assert(Math.max(...c1.map((p) => rank[p])) <= Math.min(...c2.map((p) => rank[p])), 'court 1 holds the top four');
});

// ---------------------------------------------------------------------------------------------
// A client-built (Americano) schedule
// ---------------------------------------------------------------------------------------------
const plan = (matches, rests = []) => [{
  round_number: 1, status: 'pending', rests,
  matches: matches.map(([a, b], i) => ({ court_number: i + 1, match_number: i + 1, side_a: a, side_b: b })),
}];

await run('americano team: a schedule that splits a pair is refused; the pairs\' schedule starts', async () => {
  const t = `at${tag()}`;
  const { org, ev } = await event(t, { event_type: 'americano', specification: 'team', num_courts: 1 });
  const [a, b, c, d] = await guests(ev, ['male', 'male', 'male', 'male']);
  await teams(ev, [a, b, c, d]);
  await expectError(() => rpc(org.jwt, 'start_event', { p_event_id: ev, p_rounds: plan([[[a, c], [b, d]]]) }),
    'invalid_rounds');
  await rpc(org.jwt, 'start_event', { p_event_id: ev, p_rounds: plan([[[b, a], [c, d]]]) });
  const [r1] = await rounds(ev);
  assert(key(r1.matches[0].a) === key([a, b]), 'the pair plays together');
});

await run('americano mixed: a side of two men is refused; man + woman sides start', async () => {
  const t = `am${tag()}`;
  const { org, ev } = await event(t, { event_type: 'americano', specification: 'mixed', num_courts: 1 });
  const [m1, w1, m2, w2] = await guests(ev, ['male', 'female', 'male', 'female']);
  await expectError(() => rpc(org.jwt, 'start_event', { p_event_id: ev, p_rounds: plan([[[m1, m2], [w1, w2]]]) }),
    'invalid_rounds');
  await rpc(org.jwt, 'start_event', { p_event_id: ev, p_rounds: plan([[[m1, w2], [m2, w1]]]) });
});

await run('event_engine_roster: the organizer gets genders and teams; anyone else is refused', async () => {
  const t = `er${tag()}`;
  const { org, ev } = await event(t, { event_type: 'americano', specification: 'team', num_courts: 1 });
  const [a, b, c, d] = await guests(ev, ['male', 'female', 'male', 'female']);
  const [p1] = await teams(ev, [a, b, c, d]);
  const rows = await rpc(org.jwt, 'event_engine_roster', { p_event_id: ev });
  assert(rows.length === 4, `four confirmed rows, got ${rows.length}`);
  const byId = Object.fromEntries(rows.map((r) => [r.participant_id, r]));
  assert(byId[a].gender === 'male' && byId[b].gender === 'female', 'guest genders');
  assert(byId[a].team_id && byId[a].team_id === byId[b].team_id && byId[a].team_number === 1, 'a and b share team 1');
  assert(byId[c].team_number === 2, 'c is in team 2');
  assert(p1[0] === a, 'fixture sanity');
  const stranger = await user(`${t}-x`);
  await expectError(() => rpc(stranger.jwt, 'event_engine_roster', { p_event_id: ev }), 'forbidden');
});
