// infra/supabase/tests/venue-registry.test.mjs
// Migration 0114: the curated venue registry and the platform super admin who curates it.
//   - only a platform_admins row can write venues, courts and the venue-images bucket;
//   - search_venues lists the registry (empty query = everything, alphabetical, paged) with a
//     court count, and never returns a soft-deleted venue;
//   - save_venue writes a venue and its courts atomically; a court an event used cannot be deleted.
import { BASE_URL, ANON, user, rpc, req, sel, insert, expectError, assert, run } from './lib.mjs';

const RUN = Date.now().toString(36);
const admin = await user('vr-admin');
const player = await user('vr-player');
await insert('platform_admins', { user_id: admin.id });

const asUser = (jwt, path, method, body) =>
  req(path, { method, jwt, body, prefer: 'return=representation' });

/** Upload a 1-byte "image" to venue-images as `jwt`; returns the fetch Response. */
const upload = (jwt, path) =>
  fetch(`${BASE_URL}/storage/v1/object/venue-images/${path}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'image/png' },
    body: new Uint8Array([0x89]),
  });

await run('is_super_admin answers for the caller only', async () => {
  assert((await rpc(admin.jwt, 'is_super_admin')) === true, 'admin is a super admin');
  assert((await rpc(player.jwt, 'is_super_admin')) === false, 'a player is not');
});

await run('platform_admins is not readable or writable by a client', async () => {
  await expectError(() => asUser(player.jwt, '/rest/v1/platform_admins?select=user_id', 'GET'), 'permission denied');
  await expectError(() => asUser(player.jwt, '/rest/v1/platform_admins', 'POST', { user_id: player.id }), 'permission denied');
  assert((await rpc(player.jwt, 'is_super_admin')) === false, 'still not a super admin');
});

let venueId;
let courts;
await run('a super admin creates a venue with courts through save_venue', async () => {
  venueId = await rpc(admin.jwt, 'save_venue', {
    p_venue_id: null, p_name: `  AAA Registry ${RUN}  `, p_address: 'Rua Teste 1, Lisboa', p_image_path: null,
    p_courts: [{ id: null, name: 'Court 1' }, { id: null, name: 'Court 2' }, { id: null, name: 'Court 3' }],
  });
  assert(typeof venueId === 'string', 'returns the new id');
  const [v] = await sel('venues', `id=eq.${venueId}&select=name,created_by`);
  assert(v.name === `AAA Registry ${RUN}`, 'name is trimmed');
  assert(v.created_by === admin.id, 'created_by is the admin');
  courts = await sel('courts', `venue_id=eq.${venueId}&select=id,name,sort_order&order=sort_order`);
  assert(courts.map((c) => c.name).join() === 'Court 1,Court 2,Court 3', 'courts in order');
  assert(courts.map((c) => c.sort_order).join() === '1,2,3', 'sort_order follows the list');
});

await run('a non-admin cannot write venues or courts', async () => {
  await expectError(() => rpc(player.jwt, 'save_venue', {
    p_venue_id: null, p_name: 'Nope', p_address: null, p_image_path: null, p_courts: [],
  }), 'forbidden');
  await expectError(() => asUser(player.jwt, '/rest/v1/venues', 'POST', { name: `Rogue ${RUN}` }), 'row-level security');
  await expectError(() => asUser(player.jwt, '/rest/v1/courts', 'POST', { venue_id: venueId, name: 'Rogue court' }), 'row-level security');
  // UPDATE / DELETE under RLS match zero rows rather than erroring; prove nothing changed.
  const upd = await asUser(player.jwt, `/rest/v1/venues?id=eq.${venueId}`, 'PATCH', { name: 'Hijacked' });
  assert(Array.isArray(upd) && upd.length === 0, 'update matched nothing');
  const delC = await asUser(player.jwt, `/rest/v1/courts?venue_id=eq.${venueId}`, 'DELETE');
  assert(Array.isArray(delC) && delC.length === 0, 'court delete matched nothing');
  const [v] = await sel('venues', `id=eq.${venueId}&select=name`);
  assert(v.name === `AAA Registry ${RUN}`, 'venue unchanged');
  assert((await sel('courts', `venue_id=eq.${venueId}&select=id`)).length === 3, 'courts unchanged');
});

await run('venue-images: only a super admin can upload', async () => {
  const denied = await upload(player.jwt, `vr-${RUN}-player.png`);
  assert(!denied.ok, `player upload must fail (got ${denied.status})`);
  const ok = await upload(admin.jwt, `vr-${RUN}-admin.png`);
  assert(ok.ok, `admin upload must succeed (got ${ok.status}: ${await ok.text()})`);
  const pub = await fetch(`${BASE_URL}/storage/v1/object/public/venue-images/vr-${RUN}-admin.png`);
  assert(pub.ok, 'the bucket is public-read');
});

await run('search_venues: empty query lists the registry alphabetically with court counts', async () => {
  const second = await rpc(admin.jwt, 'save_venue', {
    p_venue_id: null, p_name: `AAA Registry ${RUN} b`, p_address: null, p_image_path: `vr-${RUN}-admin.png`, p_courts: [],
  });
  for (const q of [{}, { p_query: '' }, { p_query: null }]) {
    const rows = await rpc(player.jwt, 'search_venues', { ...q, p_limit: 200 });
    const mine = rows.filter((r) => r.name.includes(RUN));
    assert(mine.length === 2, `both venues listed for ${JSON.stringify(q)}`);
    // Alphabetical: "… b" sorts after its prefix under any collation (JS and Postgres collations
    // disagree on punctuation and spaces, so the whole list is not compared here).
    assert(mine[0].id === venueId && mine[1].id === second, 'alphabetical');
  }
  const rows = await rpc(player.jwt, 'search_venues', { p_query: RUN });
  assert(rows.length === 2, 'the query filters');
  const a = rows.find((r) => r.id === venueId);
  const b = rows.find((r) => r.id === second);
  assert(a.court_count === 3 && b.court_count === 0, 'court_count');
  assert(a.address === 'Rua Teste 1, Lisboa' && b.image_path === `vr-${RUN}-admin.png`, 'address and image_path');
  assert('rating' in a, 'rating column');
  const p1 = await rpc(player.jwt, 'search_venues', { p_query: RUN, p_limit: 1 });
  const p2 = await rpc(player.jwt, 'search_venues', { p_query: RUN, p_limit: 1, p_offset: 1 });
  assert(p1.length === 1 && p2.length === 1 && p1[0].id !== p2[0].id, 'limit/offset page');
  // Old call shape (0067 callers) still resolves.
  assert((await rpc(player.jwt, 'search_venues', { p_query: `Registry ${RUN}` })).length === 2, 'p_query only');
  // LIKE wildcards are literal.
  assert((await rpc(player.jwt, 'search_venues', { p_query: `${RUN}%_` })).length === 0, 'wildcards are escaped');
});

await run('save_venue edits: rename, reorder, add and remove courts', async () => {
  const [c1, c2, c3] = courts;
  await rpc(admin.jwt, 'save_venue', {
    p_venue_id: venueId, p_name: `AAA Registry ${RUN}`, p_address: '', p_image_path: null,
    p_courts: [{ id: c3.id, name: 'Centre' }, { id: c1.id, name: 'Court 1' }, { id: null, name: 'New' }],
  });
  const after = await sel('courts', `venue_id=eq.${venueId}&select=id,name,sort_order&order=sort_order`);
  assert(after.map((c) => c.name).join() === 'Centre,Court 1,New', `order/rename (${after.map((c) => c.name)})`);
  assert(after[0].id === c3.id && after[1].id === c1.id, 'existing courts keep their ids');
  assert(!after.some((c) => c.id === c2.id), 'the omitted court is gone');
  const [v] = await sel('venues', `id=eq.${venueId}&select=address`);
  assert(v.address === null, 'blank address stored as null');
  courts = after;
  await expectError(() => rpc(admin.jwt, 'save_venue', {
    p_venue_id: venueId, p_name: `AAA Registry ${RUN}`, p_address: null, p_image_path: null, p_courts: [{ id: null, name: ' ' }],
  }), 'court_name_required');
  await expectError(() => rpc(admin.jwt, 'save_venue', {
    p_venue_id: venueId, p_name: ' ', p_address: null, p_image_path: null, p_courts: [],
  }), 'name_required');
});

await run('a court an event used cannot be deleted', async () => {
  const used = courts[0];
  await rpc(admin.jwt, 'create_event', {
    p_payload: {
      group_id: null, event_type: 'americano', specification: 'classic', scoring_mode: 'points', scoring_value: 24,
      organizer_role: 'organizing_and_playing', name: `Venue event ${RUN}`, venue_id: venueId,
      manual_location_name: null, manual_location_address: null, has_location: true,
      location_lat: null, location_lng: null, location_text: null,
      num_courts: 1, starts_at: new Date(Date.now() + 3 * 864e5).toISOString(), duration_minutes: 90,
      allow_standby: false, standby_spots: 0, is_private: true, players_submit_results: false,
      entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
      description: null, thumbnail_path: null, series: null, invitees: null, court_ids: [used.id],
    },
  });
  await expectError(() => rpc(admin.jwt, 'save_venue', {
    p_venue_id: venueId, p_name: `AAA Registry ${RUN}`, p_address: null, p_image_path: null,
    p_courts: courts.slice(1).map((c) => ({ id: c.id, name: c.name })),
  }), 'court_in_use');
  assert((await sel('courts', `venue_id=eq.${venueId}&select=id`)).length === 3, 'the failed save rolled back');
  // Renaming it is fine.
  await rpc(admin.jwt, 'save_venue', {
    p_venue_id: venueId, p_name: `AAA Registry ${RUN}`, p_address: null, p_image_path: null,
    p_courts: courts.map((c, i) => ({ id: c.id, name: i === 0 ? 'Renamed' : c.name })),
  });
});

await run('soft delete: the venue leaves search, the admin still reads it', async () => {
  const del = await asUser(admin.jwt, `/rest/v1/venues?id=eq.${venueId}`, 'PATCH', { deleted_at: new Date().toISOString() });
  assert(del.length === 1, 'admin soft-deleted the venue');
  const rows = await rpc(player.jwt, 'search_venues', { p_query: RUN });
  assert(!rows.some((r) => r.id === venueId), 'gone from search');
  const asPlayer = await asUser(player.jwt, `/rest/v1/venues?id=eq.${venueId}&select=id`, 'GET');
  assert(asPlayer.length === 0, 'players no longer read it');
  const asAdmin = await asUser(admin.jwt, `/rest/v1/venues?id=eq.${venueId}&select=id,deleted_at`, 'GET');
  assert(asAdmin.length === 1 && asAdmin[0].deleted_at, 'admin still reads it');
  await expectError(() => rpc(admin.jwt, 'save_venue', {
    p_venue_id: venueId, p_name: 'x', p_address: null, p_image_path: null, p_courts: [],
  }), 'venue_not_found');
});
