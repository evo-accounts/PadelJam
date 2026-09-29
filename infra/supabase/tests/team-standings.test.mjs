// infra/supabase/tests/team-standings.test.mjs
//
// Migration 0125 (UX Audit — Manage Event, plan PR "0125 — team standings": D10, D11, UX-MEVT-27,
// IP-19). A team event's standings() lists teams; finish_event / set_event_ranking give both players
// of a pair the pair's placement in the group ranking; a guest is skipped without re-ranking anyone;
// Classic is unchanged. The roster, teams and scored matches are written with the service role — the
// round engine is not what is under test — and the event is finished by its organizer through
// PostgREST, the path the app takes.
import { user, rpc, anonRpc, sel, insert, patch, assert, run } from './lib.mjs';

const hoursFromNow = (h) => new Date(Date.now() + h * 36e5).toISOString();
const tag = () => Math.random().toString(36).slice(2, 8);

const payload = (groupId, over) => ({
  group_id: groupId, event_type: 'americano', specification: 'team', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: `Standings ${tag()}`, venue_id: null,
  manual_location_name: 'Court', manual_location_address: 'Somewhere', has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 2, starts_at: hoursFromNow(72), duration_minutes: 90,
  allow_standby: false, standby_spots: null, is_private: false, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});

/** Organizer (the community admin) + community on Pro + a public group with `members`. */
async function group(t, members = []) {
  const admin = await user(`${t}-admin`);
  const communityId = await rpc(admin.jwt, 'create_community_with_personal_tenant', {
    p_name: `Standings ${t} ${Date.now().toString(36)}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  await insert('community_subscriptions', { community_id: communityId, dimension: 'community', plan_id: 'community_pro', status: 'active', provider: 'manual' });
  const groupId = await rpc(admin.jwt, 'create_group', {
    p_community_id: communityId, p_name: 'Standings', p_description: null, p_is_private: false, p_thumbnail_path: null,
  });
  for (const u of members) {
    await insert('community_members', { community_id: communityId, user_id: u.id, role: 'member' });
    await rpc(u.jwt, 'join_group', { p_group_id: groupId, p_ack: true });
  }
  return { admin, groupId };
}

/** Seat `players` (users, or { guest: 'Name' }) as confirmed participants; returns their ids in order. */
async function seat(ev, players) {
  const ids = [];
  for (const p of players) {
    const row = p.guest
      ? { event_id: ev, guest_name: p.guest, status: 'confirmed' }
      : { event_id: ev, user_id: p.id, status: 'confirmed' };
    const [r] = await insert('event_participants', row);
    ids.push(r.id);
  }
  return ids;
}

/** Scored rounds: `rounds` is a list of rounds, each a list of [sideA ids, sideB ids, scoreA, scoreB]. */
async function play(ev, rounds) {
  for (const [i, matches] of rounds.entries()) {
    const [round] = await insert('event_rounds', { event_id: ev, round_number: i + 1, status: 'completed' });
    for (const [j, [a, b, sa, sb]] of matches.entries()) {
      const [m] = await insert('event_matches', {
        event_id: ev, round_id: round.id, court_number: j + 1, match_number: j + 1,
        side_a_score: sa, side_b_score: sb, status: 'played',
      });
      await insert('match_players', [
        ...a.map((pid) => ({ match_id: m.id, participant_id: pid, side: 'a' })),
        ...b.map((pid) => ({ match_id: m.id, participant_id: pid, side: 'b' })),
      ]);
    }
  }
}

const results = (ev) =>
  sel('group_event_results', `event_id=eq.${ev}&select=user_id,final_placement,ranking_points,wins,losses`);
const byUser = (rows) => Object.fromEntries(rows.map((r) => [r.user_id, r]));

/**
 * A ranked team event on two courts, four pairs, one of them a guest + an account holder:
 *   T1 (a, b)   R1 16–8 v T2, R2 12–12 v T3  → 28 pts, 1-1-0
 *   T2 (c, d)   R1 8–16 v T1, R2 19–5 v T4   → 27 pts, 1-0-1
 *   T3 (e, f)   R1 10–14 v T4, R2 12–12 v T1 → 22 pts, 0-1-1
 *   T4 (guest, g) R1 14–10 v T3, R2 5–19 v T2 → 19 pts, 1-0-1
 */
async function teamEvent(t) {
  const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const us = {};
  for (const n of names) us[n] = await user(`${t}-${n}`, { name: `${t} ${n.toUpperCase()}` });
  const { admin, groupId } = await group(t, Object.values(us));
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: payload(groupId) });
  const [pa, pb, pc, pd, pe, pf, pguest, pg] = await seat(ev, [
    us.a, us.b, us.c, us.d, us.e, us.f, { guest: `${t} Guest` }, us.g,
  ]);
  const teams = await insert('event_teams', [
    { event_id: ev, team_number: 1, player_a_id: pa, player_b_id: pb, is_confirmed: true },
    { event_id: ev, team_number: 2, player_a_id: pc, player_b_id: pd, is_confirmed: true },
    { event_id: ev, team_number: 3, player_a_id: pe, player_b_id: pf, is_confirmed: true },
    { event_id: ev, team_number: 4, player_a_id: pguest, player_b_id: pg, is_confirmed: true },
  ]);
  const team = Object.fromEntries(teams.map((tm) => [tm.team_number, tm.id]));
  await patch('events', `id=eq.${ev}`, { status: 'in_progress', counts_for_ranking: true });
  await play(ev, [
    [[[pa, pb], [pc, pd], 16, 8], [[pe, pf], [pguest, pg], 10, 14]],
    [[[pa, pb], [pe, pf], 12, 12], [[pc, pd], [pguest, pg], 19, 5]],
  ]);
  return { admin, us, ev, team, pids: { pa, pb, pc, pd, pe, pf, pguest, pg } };
}

// ---------------------------------------------------------------------------------------------
// standings()
// ---------------------------------------------------------------------------------------------
await run('D11: a team event\'s standings are one row per pair, ranked on the pair\'s result', async () => {
  const t = `ts${tag()}`;
  const { admin, us, ev, team, pids } = await teamEvent(t);
  const rows = await rpc(admin.jwt, 'standings', { p_event_id: ev });
  assert(rows.length === 4, `four team rows, got ${rows.length}`);
  assert(rows.every((r) => r.is_team), 'every row is a team row');
  const by = Object.fromEntries(rows.map((r) => [r.team_number, r]));
  const expect = {
    1: { entity: team[1], points: 28, wins: 1, draws: 1, losses: 0, rank: 1, a: pids.pa, b: pids.pb },
    2: { entity: team[2], points: 27, wins: 1, draws: 0, losses: 1, rank: 2, a: pids.pc, b: pids.pd },
    3: { entity: team[3], points: 22, wins: 0, draws: 1, losses: 1, rank: 3, a: pids.pe, b: pids.pf },
    4: { entity: team[4], points: 19, wins: 1, draws: 0, losses: 1, rank: 4, a: pids.pguest, b: pids.pg },
  };
  for (const [n, e] of Object.entries(expect)) {
    const r = by[n];
    assert(r, `team ${n} has a row`);
    assert(r.entity_id === e.entity, `team ${n}: entity_id is the event_teams id`);
    assert(r.points === e.points && r.wins === e.wins && r.draws === e.draws && r.losses === e.losses,
      `team ${n}: the pair's result counted once per match (${JSON.stringify(r)})`);
    assert(r.rank === e.rank, `team ${n}: rank ${e.rank}, got ${r.rank}`);
    assert(r.participant_a_id === e.a && r.participant_b_id === e.b, `team ${n}: both participant ids`);
  }
  // Identity columns, for a caller who can see the event.
  assert(by[1].user_a_id === us.a.id && by[1].user_b_id === us.b.id, 'both user ids');
  assert(by[1].name_a === `${t} A` && by[1].name_b === `${t} B`, 'both names');
  assert(by[4].user_a_id === null && by[4].name_a === `${t} Guest`, 'a guest: no user id, the guest name');
  assert(by[4].user_b_id === us.g.id && by[4].name_b === `${t} G`, "the guest's partner is named");

  // Anonymous callers keep the ranking but get no identities.
  const anon = await anonRpc('standings', { p_event_id: ev });
  assert(anon.length === 4 && anon.every((r) => r.user_a_id === null && r.user_b_id === null
    && r.name_a === null && r.name_b === null), 'anon: no user ids or names');
  assert(anon.every((r) => r.participant_a_id && r.participant_b_id), 'anon: participant ids still returned');

  // A block hides the blocked player's name (the profiles read policy), and only theirs.
  const outsider = await user(`${t}-x`);
  await insert('blocks', { blocker_id: outsider.id, blocked_id: us.a.id });
  const seen = Object.fromEntries((await rpc(outsider.jwt, 'standings', { p_event_id: ev })).map((r) => [r.team_number, r]));
  assert(seen[1].name_a === null && seen[1].name_b === `${t} B`, 'blocked partner unnamed, the other named');
});

// ---------------------------------------------------------------------------------------------
// finish_event / set_event_ranking → group_event_results
// ---------------------------------------------------------------------------------------------
await run('D11/D10: finishing gives both players the pair\'s placement; the guest is skipped, nobody re-ranked', async () => {
  const t = `tf${tag()}`;
  const { admin, us, ev } = await teamEvent(t);
  await rpc(admin.jwt, 'finish_event', { p_event_id: ev });
  const rows = await results(ev);
  assert(rows.length === 7, `seven account holders ranked (guest skipped), got ${rows.length}`);
  const r = byUser(rows);
  const want = [
    [us.a, 1, 100, 1, 0], [us.b, 1, 100, 1, 0],
    [us.c, 2, 75, 1, 1], [us.d, 2, 75, 1, 1],
    [us.e, 3, 60, 0, 1], [us.f, 3, 60, 0, 1],
    [us.g, 4, 50, 1, 1], // D10: the guest's partner keeps the pair's real placement
  ];
  for (const [u, place, pts, w, l] of want) {
    const row = r[u.id];
    assert(row, `a result row for ${u.id}`);
    assert(row.final_placement === place && row.ranking_points === pts,
      `placement ${place} / ${pts} pts, got ${row.final_placement} / ${row.ranking_points}`);
    assert(row.wins === w && row.losses === l, `wins/losses are the team's (${w}/${l}), got ${row.wins}/${row.losses}`);
  }

  // set_event_ranking off → on re-runs the same per-player insert.
  await rpc(admin.jwt, 'set_event_ranking', { p_event_id: ev, p_enabled: false });
  assert((await results(ev)).length === 0, 'ranking off removes the rows');
  await rpc(admin.jwt, 'set_event_ranking', { p_event_id: ev, p_enabled: true });
  const again = byUser(await results(ev));
  assert(Object.keys(again).length === 7, 'ranking on writes the seven rows again');
  for (const [u, place, pts, w, l] of want) {
    const row = again[u.id];
    assert(row.final_placement === place && row.ranking_points === pts && row.wins === w && row.losses === l,
      `set_event_ranking matches finish_event for ${u.id}`);
  }

  // The community post's summary names each pair.
  const summary = await rpc(us.a.jwt, 'event_result_summary', { p_event_id: ev });
  assert(summary.length === 4, `four summary rows, got ${summary.length}`);
  assert(summary[0].rank === 1 && summary[0].name === `${t} A & ${t} B` && summary[0].points === 28, 'first pair by name');
  assert(summary[3].name === `${t} Guest & ${t} G`, 'a guest pair is named too');
});

// ---------------------------------------------------------------------------------------------
// Classic is unchanged
// ---------------------------------------------------------------------------------------------
await run('Classic: individual rows, individual placements — unchanged', async () => {
  const t = `tc${tag()}`;
  const us = [];
  for (const n of ['a', 'b', 'c', 'd']) us.push(await user(`${t}-${n}`, { name: `${t} ${n.toUpperCase()}` }));
  const { admin, groupId } = await group(t, us);
  const ev = await rpc(admin.jwt, 'create_event', { p_payload: payload(groupId, { specification: 'classic', num_courts: 1 }) });
  const [pa, pb, pc, pd] = await seat(ev, us);
  await patch('events', `id=eq.${ev}`, { status: 'in_progress', counts_for_ranking: true });
  await play(ev, [[[[pa, pb], [pc, pd], 15, 9]], [[[pa, pc], [pb, pd], 10, 14]]]);

  const rows = await rpc(admin.jwt, 'standings', { p_event_id: ev });
  assert(rows.length === 4 && rows.every((r) => !r.is_team && r.team_number === null), 'four individual rows');
  const by = Object.fromEntries(rows.map((r) => [r.entity_id, r]));
  // a 15+10=25 (1-0-1), b 15+14=29 (2-0-0), c 9+10=19 (0-0-2), d 9+14=23 (1-0-1)
  const want = [[pa, 25, 2], [pb, 29, 1], [pc, 19, 4], [pd, 23, 3]];
  for (const [pid, pts, rank] of want) {
    assert(by[pid].points === pts && by[pid].rank === rank, `${pid}: ${pts} pts rank ${rank}, got ${by[pid].points} / ${by[pid].rank}`);
    assert(by[pid].participant_a_id === pid && by[pid].participant_b_id === null, 'participant_a_id is the entity');
  }
  assert(by[pb].wins === 2 && by[pb].losses === 0 && by[pc].losses === 2, 'individual wins/losses');
  assert(by[pa].name_a === `${t} A` && by[pa].user_a_id === us[0].id && by[pa].name_b === null, 'the player is named');

  await rpc(admin.jwt, 'finish_event', { p_event_id: ev });
  const r = byUser(await results(ev));
  assert(Object.keys(r).length === 4, 'four result rows');
  assert(r[us[1].id].final_placement === 1 && r[us[1].id].ranking_points === 100, 'b first');
  assert(r[us[0].id].final_placement === 2 && r[us[0].id].ranking_points === 75, 'a second');
  assert(r[us[3].id].final_placement === 3 && r[us[2].id].final_placement === 4, 'd third, c fourth');
  assert(r[us[1].id].wins === 2 && r[us[2].id].losses === 2, 'individual wins/losses recorded');
});
