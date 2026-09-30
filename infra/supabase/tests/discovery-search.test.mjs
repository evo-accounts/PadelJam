// infra/supabase/tests/discovery-search.test.mjs
//
// Migration 0129 — server-side discovery search, suggestions and For-you terms (UX Audit — Home &
// Explore, decisions D1, D2, D4, D6, D7, D8, D9, D13; bug B3).
//
// Every call goes through PostgREST with a real user's JWT: the search functions are `security
// definer`, so the predicates inside them are the only fence. Each run searches for its own random
// token, so rows left behind by earlier runs or other files never match.
import { user, rpc, anonRpc, insert, sel, patch, expectError, assert, run } from './lib.mjs';

const letters = () => Array.from({ length: 6 }, () => 'bcdfghjklmnpqrstvwxz'[Math.floor(Math.random() * 20)]).join('');
/** A fresh search token per test: letters only, so it is its own word, and it never collides with
 *  an earlier run's rows or with another test's (a community's general group carries its name). */
const newTok = () => `zq${letters()}`;
const DAY = 864e5;
const at = (ms) => new Date(Date.now() + ms).toISOString();

const LISBON = [38.7223, -9.1393];
const PORTO = [41.1579, -8.6291];

const community = (owner, name, privacy = 'public', extra = {}) =>
  rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: name, p_type: 'club', p_country: 'PT', p_privacy: privacy, ...extra,
  });
const generalGroup = async (cid) => (await sel('groups', `community_id=eq.${cid}&is_general=eq.true&select=id`))[0].id;
const locate = (u, [lat, lng]) => rpc(u.jwt, 'set_my_location', { p_lat: lat, p_lng: lng, p_text: 'Lisbon, PT' });

const eventPayload = (groupId, over) => ({
  group_id: groupId, event_type: 'americano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: `Ev ${letters()}`, venue_id: null,
  manual_location_name: 'Court', manual_location_address: 'Street', has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: at(3 * DAY), duration_minutes: 90,
  allow_standby: false, standby_spots: null, is_private: false, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});

const search = (u, fn, q, extra = {}) => rpc(u.jwt, fn, { p_q: q, p_limit: 100, p_offset: 0, ...extra });
const ids = (rows) => rows.map((r) => r.id ?? r.event?.id);

await run('search_players: accent/case-insensitive match, total_count, self and blocks excluded, viewer_state', async () => {
  const TOK = newTok();
  const [viewer, a, b, blocker, blocked] = await Promise.all([
    user('ds-pv'), user('ds-pa', { name: `Ágata ${TOK}` }), user('ds-pb', { name: `Bruno ${TOK}x` }),
    user('ds-pk', { name: `Kim ${TOK}` }), user('ds-pd', { name: `Dora ${TOK}` }),
  ]);
  // Not onboarded: never found.
  const ghost = await user('ds-pg', { name: `Ghost ${TOK}` });
  await patch('profiles', `id=eq.${ghost.id}`, { onboarded_at: null });
  // The viewer's own name matches too, and must still be left out.
  await patch('profiles', `id=eq.${viewer.id}`, { full_name: `Viewer ${TOK}` });

  await rpc(blocker.jwt, 'block_user', { p_target: viewer.id }); // they blocked me
  await rpc(viewer.jwt, 'block_user', { p_target: blocked.id }); // I blocked them

  const rows = await search(viewer, 'search_players', TOK.toUpperCase());
  const found = ids(rows);
  assert(found.includes(a.id) && found.includes(b.id), 'both matches are found');
  assert(!found.includes(viewer.id), 'the viewer never finds themselves');
  assert(!found.includes(ghost.id), 'a profile that has not onboarded is not found');
  assert(!found.includes(blocker.id), 'someone who blocked me is not found');
  assert(!found.includes(blocked.id), 'someone I blocked is not found');
  assert(rows.length === 2 && rows.every((r) => Number(r.total_count) === 2), `total_count is 2, got ${rows.map((r) => r.total_count)}`);

  // Accent-insensitive: 'agata' finds 'Ágata'; paging keeps the full count.
  const acc = await search(viewer, 'search_players', `agata ${TOK}`);
  assert(acc.length === 1 && acc[0].id === a.id, 'agata finds Ágata');
  const page = await rpc(viewer.jwt, 'search_players', { p_q: TOK, p_limit: 1, p_offset: 1 });
  assert(page.length === 1 && Number(page[0].total_count) === 2, 'total_count counts beyond the page');

  // Exact/word-prefix before substring: "Ágata <tok>" and "Bruno <tok>x" are both word-prefix
  // matches for the token, so name order decides.
  assert(rows[0].id === a.id, 'ties fall back to name order');

  assert(rows.every((r) => r.viewer_state === 'none'), 'nobody followed yet');
  await rpc(viewer.jwt, 'follow_player', { p_user: a.id });
  const after = await search(viewer, 'search_players', TOK);
  assert(after.find((r) => r.id === a.id).viewer_state === 'following', 'a followed player reads following and is still found (D8)');
});

await run('search_communities: private visibility, viewer_state, filters and sorts', async () => {
  const TOK = newTok();
  const [viewer, oPub, oReq, oPriv, oFar, oNone, oTeam] = await Promise.all([
    user('ds-cv'), user('ds-c1'), user('ds-c2'), user('ds-c3'), user('ds-c4'), user('ds-c5'), user('ds-c6'),
  ]);
  await locate(viewer, LISBON);
  const cPub = await community(oPub, `Pub ${TOK}`, 'public', { p_location: 'Lisbon', p_location_lat: 38.73, p_location_lng: -9.15 });
  const cReq = await community(oReq, `Req ${TOK}`, 'request_to_join');
  const cPriv = await community(oPriv, `Priv ${TOK}`, 'private');
  const cFar = await community(oFar, `Far ${TOK}`, 'public', { p_location: 'Porto', p_location_lat: PORTO[0], p_location_lng: PORTO[1] });
  const cNone = await community(oNone, `None ${TOK}`, 'public');
  const cTeam = await rpc(oTeam.jwt, 'create_community_with_personal_tenant', {
    p_name: `Team ${TOK}`, p_type: 'team', p_country: 'PT', p_privacy: 'public',
  });

  let rows = await search(viewer, 'search_communities', TOK);
  let found = ids(rows);
  assert(!found.includes(cPriv), 'a private community the viewer is not in never appears');
  assert([cPub, cReq, cFar, cNone, cTeam].every((c) => found.includes(c)), 'public and request_to_join are found');
  assert(Number(rows[0].total_count) === 5, `total_count 5, got ${rows[0].total_count}`);
  assert(rows.find((r) => r.id === cPub).member_count === 1, 'member_count counts the owner');

  // Member of the private one → it appears, as 'member' (D8).
  await insert('community_members', { community_id: cPriv, user_id: viewer.id, role: 'member' });
  rows = await search(viewer, 'search_communities', TOK);
  assert(rows.find((r) => r.id === cPriv)?.viewer_state === 'member', 'own private community is found, reads member');

  // viewer_state: requested / invited.
  assert((await rpc(viewer.jwt, 'join_community', { p_community_id: cReq, p_ack: false })) === 'requested', 'request sent');
  await insert('community_invitations', { community_id: cNone, inviter_id: oNone.id, invitee_id: viewer.id });
  rows = await search(viewer, 'search_communities', TOK);
  const st = (c) => rows.find((r) => r.id === c)?.viewer_state;
  assert(st(cReq) === 'requested', `requested, got ${st(cReq)}`);
  assert(st(cNone) === 'invited', `invited, got ${st(cNone)}`);
  assert(st(cPub) === 'none', 'none');

  // Filters.
  const f = (filters, sort = 'relevant') => search(viewer, 'search_communities', TOK, { p_filters: filters, p_sort: sort });
  assert(ids(await f({ types: ['team'] })).join() === cTeam, 'types filter');
  const priv = ids(await f({ privacy: ['private'] }));
  assert(priv.length === 1 && priv[0] === cPriv, 'privacy private matches only the own private community');
  const rtj = ids(await f({ privacy: ['request_to_join'] }));
  assert(rtj.length === 1 && rtj[0] === cReq, 'privacy request_to_join');
  const near = ids(await f({ max_km: 10 }));
  assert(near.length === 1 && near[0] === cPub, `max_km 10 keeps only the Lisbon one, got ${near.length}`);
  const wide = ids(await f({ max_km: 500 }));
  assert(wide.includes(cFar) && !wide.includes(cNone), 'max_km drops communities without a point (D2)');

  // with_upcoming: only after a public event exists in one of its groups.
  assert(!ids(await f({ with_upcoming: true })).includes(cPub), 'no upcoming event yet');
  await rpc(oPub.jwt, 'create_event', { p_payload: eventPayload(await generalGroup(cPub), { name: `Up ${letters()}` }) });
  const up = ids(await f({ with_upcoming: true }));
  assert(up.length === 1 && up[0] === cPub, 'with_upcoming keeps the community with an upcoming event');

  // Sorts.
  const dist = ids(await f({}, 'distance'));
  assert(dist.indexOf(cPub) < dist.indexOf(cFar) && dist.indexOf(cFar) < dist.indexOf(cNone), 'distance: near, far, no point last');
  const recent = ids(await f({}, 'recent'));
  assert(recent[0] === cTeam, 'recent: newest first');
  // Relevant: exact name beats word prefix.
  const exact = ids(await search(viewer, 'search_communities', `far ${TOK}`));
  assert(exact[0] === cFar, 'relevant: the exact name ranks first');
  await expectError(() => f({}, 'date'), 'invalid_sort');
});

await run('search_groups: public + own private groups (D1), community filter restricted to mine, with_upcoming, distance', async () => {
  const TOK = newTok();
  const [viewer, owner, other] = await Promise.all([user('ds-gv'), user('ds-go'), user('ds-gx')]);
  await locate(viewer, LISBON);
  const cid = await community(owner, `Gc ${TOK}`, 'public', { p_location: 'Lisbon', p_location_lat: 38.73, p_location_lng: -9.15 });
  const otherCid = await community(other, `Oc ${TOK}`, 'public');
  await insert('community_subscriptions', { community_id: cid, dimension: 'community', plan_id: 'community_pro', status: 'active', provider: 'manual' });
  const mk = (name, isPrivate) => rpc(owner.jwt, 'create_group', {
    p_community_id: cid, p_name: name, p_description: null, p_is_private: isPrivate, p_thumbnail_path: null,
  });
  const gPub = await mk(`Open ${TOK}`, false);
  const gPriv = await mk(`Secret ${TOK}`, true);

  let found = ids(await search(viewer, 'search_groups', TOK));
  assert(found.includes(gPub), 'a public group is found');
  assert(!found.includes(gPriv), 'a private group the viewer is not in is not found');

  // Become a member of the community and the private group → it appears as 'member'.
  await insert('community_members', { community_id: cid, user_id: viewer.id, role: 'member' });
  await insert('group_members', { group_id: gPriv, user_id: viewer.id });
  const rows = await search(viewer, 'search_groups', TOK);
  const priv = rows.find((r) => r.id === gPriv);
  assert(priv?.viewer_state === 'member', 'own private group is found, reads member');
  assert(priv.community_name === `Gc ${TOK}` && priv.member_count >= 1, 'community_name and member_count');
  assert(rows.find((r) => r.id === gPub).viewer_state === 'none', 'not a member of the public one');
  assert(rows.find((r) => r.id === gPub).distance_m < 5_000, 'distance comes from the community point (D2)');

  const f = (filters, sort = 'relevant') => search(viewer, 'search_groups', TOK, { p_filters: filters, p_sort: sort });
  // community_ids: mine applies; someone else's is ignored (matches nothing).
  const mine = ids(await f({ community_ids: [cid] }));
  assert(mine.length > 0 && (await f({ community_ids: [cid] })).every((r) => r.community_id === cid), 'community filter');
  assert((await f({ community_ids: [otherCid] })).length === 0, 'a community the viewer is not in is ignored');
  const both = await f({ community_ids: [cid, otherCid] });
  assert(both.every((r) => r.community_id === cid), 'a foreign id never widens the result');

  // max_km: the other community has no point → its general group drops out.
  const near = await f({ max_km: 5 });
  assert(near.length > 0 && near.every((r) => r.community_id === cid), 'max_km');

  // with_upcoming.
  assert(!ids(await f({ with_upcoming: true })).includes(gPub), 'no event yet');
  await rpc(owner.jwt, 'create_event', { p_payload: eventPayload(gPub, { name: `Gev ${letters()}` }) });
  const up = ids(await f({ with_upcoming: true }));
  assert(up.length === 1 && up[0] === gPub, 'with_upcoming');

  const recent = ids(await f({}, 'recent'));
  assert(recent.indexOf(gPriv) < recent.indexOf(gPub), 'recent: newest first');
  const dist = ids(await f({}, 'distance'));
  assert(dist.indexOf(gPub) < dist.findIndex((id) => !mine.includes(id)), 'distance: pointless community last');
  await expectError(() => f({}, 'date'), 'invalid_sort');
});

await run('search_events: visibility incl. own events, every filter, sorts, format match', async () => {
  const TOK = newTok();
  const [viewer, owner, stranger] = await Promise.all([user('ds-ev'), user('ds-eo'), user('ds-es')]);
  await locate(viewer, LISBON);
  const cid = await community(owner, `Ec ${letters()}`, 'public');
  await insert('community_subscriptions', { community_id: cid, dimension: 'community', plan_id: 'community_pro', status: 'active', provider: 'manual' });
  const gid = await generalGroup(cid);
  const ev = (over) => rpc(owner.jwt, 'create_event', { p_payload: eventPayload(gid, over) });

  const eNear = await ev({ name: `Near ${TOK}`, location_lat: 38.73, location_lng: -9.15, starts_at: at(5 * DAY) });
  const eFar = await ev({ name: `Far ${TOK}`, event_type: 'mexicano', specification: 'mixed',
    location_lat: PORTO[0], location_lng: PORTO[1], starts_at: at(2 * DAY) });
  const ePaid = await ev({ name: `Paid ${TOK}`, event_type: 'up_and_down', specification: 'mixed',
    entrance_fee_enabled: true, entrance_fee_amount: 10, entrance_fee_method: 'cash', starts_at: at(9 * DAY) });
  const eZero = await ev({ name: `Zero ${TOK}`, entrance_fee_enabled: true, entrance_fee_amount: 0,
    entrance_fee_method: 'cash', starts_at: at(4 * DAY) });
  const ePriv = await ev({ name: `Hidden ${TOK}`, is_private: true, starts_at: at(6 * DAY) });
  const eRec = await ev({ name: `Weekly ${TOK}`, starts_at: at(3 * DAY),
    series: { day_of_week: 3, start_time: '19:00', duration_minutes: 90, invite_lead_days: 7 } });

  const q = (u, filters = {}, sort = 'relevant', text = TOK) => search(u, 'search_events', text, { p_filters: filters, p_sort: sort });

  let rows = await q(viewer);
  let found = ids(rows);
  assert([eNear, eFar, ePaid, eZero, eRec].every((e) => found.includes(e)), 'public events are found');
  assert(!found.includes(ePriv), 'a private event the viewer has no part in is not found');
  assert(Number(rows[0].total_count) === found.length, 'total_count');
  assert(rows[0].event && rows[0].event.name && 'distance_m' in rows[0] && rows[0].viewer_state === 'none', 'row shape');

  // Own events are found (D8), with the organizer's state; a roster row makes a private one findable.
  const own = await q(owner);
  assert(own.find((r) => r.event.id === ePriv)?.viewer_state === 'organizer', 'organizer finds their private event');
  await insert('event_participants', { event_id: ePriv, user_id: viewer.id, status: 'invited' });
  const inv = (await q(viewer)).find((r) => r.event.id === ePriv);
  assert(inv?.viewer_state === 'invited', 'an invited player finds the private event');
  assert(!ids(await q(stranger)).includes(ePriv), 'a stranger still does not');

  // Filters.
  const types = ids(await q(viewer, { types: ['mexicano:mixed', { event_type: 'up_and_down', specification: 'mixed' }] }));
  assert(types.length === 2 && types.includes(eFar) && types.includes(ePaid), `types filter, got ${types.length}`);
  const free = ids(await q(viewer, { free: true }));
  assert(!free.includes(ePaid) && free.includes(eZero) && free.includes(eNear), 'free: fee disabled or zero');
  const recRows = await q(viewer, { recurring: true });
  const rec = ids(recRows);
  assert(rec.includes(eRec) && recRows.every((r) => r.event.series_id !== null), 'recurring keeps only series occurrences');
  assert(!rec.includes(eNear), 'recurring drops one-off events');
  const near = ids(await q(viewer, { max_km: 10 }));
  assert(near.length === 1 && near[0] === eNear, 'max_km keeps the near one, drops the pointless ones');
  const day = (ms) => new Date(Date.now() + ms).toISOString().slice(0, 10);
  const window = ids(await q(viewer, { date_from: day(4 * DAY), date_to: day(5 * DAY) }));
  assert(window.includes(eNear) && window.includes(eZero) && !window.includes(eFar) && !window.includes(ePaid),
    'date_from/date_to (bare dates, whole days)');

  // Sorts.
  const byDate = (await q(viewer, {}, 'date')).map((r) => r.event.starts_at);
  assert(byDate.every((t, i) => i === 0 || byDate[i - 1] <= t), 'date: soonest first');
  const byDist = ids(await q(viewer, {}, 'distance'));
  assert(byDist[0] === eNear && byDist[1] === eFar, 'distance: near, far, then no point');
  assert(ids(await q(viewer, {}, 'relevant', `near ${TOK}`))[0] === eNear, 'relevant: exact name first');
  await expectError(() => q(viewer, {}, 'recent'), 'invalid_sort');

  // Format match: 'mexicano' finds the Mexicano even though its name does not say so.
  const fmt = ids(await q(viewer, { max_km: 500 }, 'relevant', 'Mexicano'));
  assert(fmt.includes(eFar) && !fmt.includes(eNear), 'a format word matches the event type');
});

await run('search_suggest: prefix before substring, accent-insensitive, across kinds', async () => {
  const TOK = newTok();
  const [viewer, o1, o2, o3] = await Promise.all([
    user('ds-sv'), user('ds-s1'), user('ds-s2'), user('ds-s3', { name: `Pedro ${TOK}` }),
  ]);
  const cPrefix = await community(o1, `${TOK}ão Club`);
  const cSub = await community(o2, `Big${TOK}house`);

  const rows = await rpc(viewer.jwt, 'search_suggest', { p_q: TOK, p_limit: 8 });
  const idx = (id) => rows.findIndex((r) => r.id === id);
  assert(idx(cPrefix) >= 0 && idx(o3.id) >= 0 && idx(cSub) >= 0, `all three suggested: ${JSON.stringify(rows)}`);
  assert(idx(cPrefix) < idx(o3.id), 'name prefix before word prefix');
  assert(idx(o3.id) < idx(cSub), 'word prefix before substring');
  assert(rows.find((r) => r.id === o3.id).kind === 'player' && rows.find((r) => r.id === cPrefix).kind === 'community', 'kinds');
  assert(rows.every((r) => typeof r.label === 'string'), 'labels');

  const acc = await rpc(viewer.jwt, 'search_suggest', { p_q: `${TOK.toUpperCase()}AO`, p_limit: 8 });
  assert(acc.length >= 1 && acc[0].id === cPrefix, 'accent- and case-insensitive: "…AO" finds "…ão"');
  assert((await rpc(viewer.jwt, 'search_suggest', { p_q: '   ' })).length === 0, 'a blank query suggests nothing');
  assert((await rpc(viewer.jwt, 'search_suggest', { p_q: TOK, p_limit: 1 })).length === 1, 'limit');
});

await run('search_for_you_terms: city, formats near me, recommended communities', async () => {
  const TOK = newTok();
  const [viewer, owner] = await Promise.all([user('ds-fv'), user('ds-fo')]);
  await rpc(viewer.jwt, 'set_my_location', { p_lat: LISBON[0], p_lng: LISBON[1], p_text: 'Lisboa, Portugal' });
  const cid = await community(owner, `For ${TOK}`, 'public', { p_location: 'Lisbon', p_location_lat: 38.73, p_location_lng: -9.15 });
  await rpc(owner.jwt, 'create_event', {
    p_payload: eventPayload(await generalGroup(cid), { name: `Fy ${letters()}`, event_type: 'mexicano', location_lat: 38.73, location_lng: -9.15 }),
  });

  const rows = await rpc(viewer.jwt, 'search_for_you_terms', {});
  assert(Array.isArray(rows) && rows.length <= 8, 'at most eight');
  assert(rows.every((r) => ['city', 'format', 'community'].includes(r.kind) && typeof r.value === 'string'), 'shape (kind, value)');
  assert(rows[0].kind === 'city' && rows[0].value === 'Lisboa', `city first, the part before the comma: ${JSON.stringify(rows[0])}`);
  const formats = rows.filter((r) => r.kind === 'format');
  assert(formats.length >= 1 && formats.length <= 3, 'one to three formats');
  assert(formats.some((r) => r.value === 'mexicano'), 'a machine format value from a nearby event');
  assert(formats.every((r) => ['americano', 'mexicano', 'up_and_down'].includes(r.value)), 'formats are machine values');
  const kinds = rows.map((r) => r.kind);
  assert(kinds.join() === [...kinds].sort((a, b) => ['city', 'format', 'community'].indexOf(a) - ['city', 'format', 'community'].indexOf(b)).join(),
    'ordered city, formats, communities');
  assert(rows.filter((r) => r.kind === 'community').length <= 4, 'at most four communities');
});

await run('anon cannot call any search RPC', async () => {
  const TOK = newTok();
  const calls = [
    ['search_players', { p_q: 'a' }],
    ['search_events', { p_q: 'a' }],
    ['search_groups', { p_q: 'a' }],
    ['search_communities', { p_q: 'a' }],
    ['search_suggest', { p_q: 'a' }],
    ['search_for_you_terms', {}],
    ['search_norm', { p: 'a' }],
    ['search_rank', { p_name: 'a', p_q: 'a' }],
    ['search_pattern', { p_q: 'a' }],
  ];
  for (const [name, args] of calls) {
    await expectError(() => anonRpc(name, args), 'permission denied for function');
  }
  const u = await user('ds-anon');
  for (const [name, args] of calls.slice(0, 6)) {
    assert(Array.isArray(await rpc(u.jwt, name, args)), `${name} works for authenticated`);
  }
  // Blank query, no filters: everything visible, ordered by the sort (so filters alone work).
  const all = await rpc(u.jwt, 'search_communities', { p_q: '', p_limit: 5 });
  assert(all.length > 0 && Number(all[0].total_count) >= all.length, 'a blank query returns every visible row');
});
