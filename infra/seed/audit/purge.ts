// infra/seed/audit/purge.ts
// Deletes everything reachable from the cast, in FK order, then the auth users. Prints what it
// is about to remove. Never touches rows owned by anyone outside the cast.
import type { Client } from './client.ts';
import { ALL_EMAILS } from './cast.ts';

export async function purge(c: Client) {
  const ids: string[] = [];
  for (const email of ALL_EMAILS) {
    const id = await c.adminFindUserByEmail(email);
    if (id) ids.push(id);
  }
  if (!ids.length) { console.log('purge: no cast accounts present'); return; }
  const inList = `in.(${ids.join(',')})`;

  const tenantRows = await c.sel<{ id: string }[]>('tenants', `owner_id=${inList}&select=id`);
  const tenants = tenantRows.map((t) => t.id);
  const communities = tenants.length
    ? (await c.sel<{ id: string }[]>('communities', `tenant_id=in.(${tenants.join(',')})&select=id`)).map((r) => r.id)
    : [];
  console.log(`purge: ${ids.length} accounts, ${tenants.length} tenants, ${communities.length} communities, ${await c.count('events', `organizer_id=${inList}`)} organized events`);

  // 1) Events organized by the cast (cascades rosters, rounds, matches, teams, timer, blasts, activity, results).
  await c.del('events', `organizer_id=${inList}`);
  await c.del('event_series', `organizer_id=${inList}`);
  // 2) Anything the cast did inside other people's events (none expected, but keep the purge total).
  await c.del('event_participants', `user_id=${inList}`);
  await c.del('event_invitations', `invitee_id=${inList}`);
  await c.del('partner_requests', `requester_id=${inList}`);
  await c.del('partner_requests', `target_id=${inList}`);
  // 3) Community-scoped rows and the communities themselves (via tenants).
  if (communities.length) {
    const cl = `in.(${communities.join(',')})`;
    await c.del('venues', `community_id=${cl}`);
    await c.del('community_posts', `community_id=${cl}`);
  }
  await c.del('venues', `created_by=${inList}`);
  await c.del('community_members', `user_id=${inList}`);
  await c.del('community_invitations', `invitee_id=${inList}`);
  await c.del('community_join_requests', `user_id=${inList}`);
  await c.del('group_members', `user_id=${inList}`);
  await c.del('group_invitations', `invitee_id=${inList}`);
  if (tenants.length) await c.del('tenants', `id=in.(${tenants.join(',')})`);
  // 4) Social and per-user rows.
  for (const t of ['notifications', 'blocks', 'follows', 'reports', 'subscriptions', 'user_settings', 'push_tokens']) {
    const col = t === 'blocks' ? 'blocker_id' : t === 'follows' ? 'follower_id' : t === 'reports' ? 'reporter_id' : 'user_id';
    try { await c.del(t, `${col}=${inList}`); } catch (e) { console.log(`  purge: ${t}.${col}: ${(e as Error).message.slice(0, 80)}`); }
  }
  await c.del('blocks', `blocked_id=${inList}`);
  await c.del('follows', `followee_id=${inList}`);
  await c.del('reports', `reported_user_id=${inList}`);
  // 5) Storage objects, profiles, auth users.
  for (const id of ids) {
    try { await c.req(`/storage/v1/object/avatars/${id}/audit.png`, { method: 'DELETE' }); } catch { /* absent */ }
  }
  await c.del('profiles', `id=${inList}`);
  for (const id of ids) await c.adminDeleteUser(id);

  const left = await c.sel<{ email: string }[]>('profiles', `email=in.(${ALL_EMAILS.map(encodeURIComponent).join(',')})&select=email`);
  if (left.length) throw new Error(`purge incomplete: ${left.map((r) => r.email).join(', ')}`);
  console.log('purge: done');
}
