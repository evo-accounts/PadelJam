// infra/seed/audit/verify.ts
// node infra/seed/audit/verify.ts --target local|hosted [--yes-hosted]
// Reads the manifest back and asserts the states the audit document lists. Run after every seed.
import { loadEnv, type Target } from './env.ts';
import { makeClient } from './client.ts';
import { readManifest } from './manifest.ts';
import { C1_MEMBERS } from './cast.ts';

const argv = process.argv.slice(2);
const target = ((argv.indexOf('--target') >= 0 ? argv[argv.indexOf('--target') + 1] : 'local') as Target);
const c = makeClient(loadEnv(target, argv.includes('--yes-hosted')));
const m = readManifest(target);
let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
};
const one = async <T,>(table: string, qs: string) => (await c.sel<T[]>(table, qs))[0];
const status = (id: string) => one<{ status: string; finished_early: boolean }>('events', `id=eq.${id}&select=status,finished_early`);

async function main() {
  const a1 = m.users.a1;
  check('A1 profile complete', !!(await one<{ avatar_url: string; description: string; court_side: string }>('profiles', `id=eq.${a1}&select=avatar_url,description,court_side`))?.avatar_url);
  check('A1 Jammer+', (await c.count('subscriptions', `user_id=eq.${a1}&plan_id=eq.jammer_plus`)) === 1);
  check('A1 blocked one user', (await c.count('blocks', `blocker_id=eq.${a1}`)) === 1);
  check('A1 following ~15', Math.abs((await c.count('follows', `follower_id=eq.${a1}`)) - 15) <= 2);
  check('A1 followers ~15', Math.abs((await c.count('follows', `followee_id=eq.${a1}`)) - 15) <= 2);
  // G1 spans exactly C1_MEMBERS plus A1 (the creator): u4, u5, f1, f2, f3 sit outside C1 by design
  // (they own or belong to other communities), so the document's "about 30" is C1_MEMBERS + A1, not
  // a literal 30. Assert the exact roster size instead of a fixed magic number.
  check(`G1 has C1_MEMBERS+1 members`, (await c.count('group_members', `group_id=eq.${m.ids.G1}`)) === C1_MEMBERS.length + 1, `expected ${C1_MEMBERS.length + 1}`);
  check('G4 archived', !!(await one<{ archived_at: string | null }>('groups', `id=eq.${m.ids.G4}&select=archived_at`))?.archived_at);
  check('G5 invitation pending', (await c.count('group_invitations', `group_id=eq.${m.ids.G5}&invitee_id=eq.${a1}&status=eq.pending`)) === 1);
  check('C2 has only the general group', (await c.count('groups', `community_id=eq.${m.ids.C2}&is_private=eq.false`)) === 1);
  check('C4 request pending', (await c.count('community_join_requests', `community_id=eq.${m.ids.C4}&user_id=eq.${a1}&status=eq.pending`)) === 1);
  check('C1 pending invitations', (await c.count('community_invitations', `community_id=eq.${m.ids.C1}&status=eq.pending`)) === 3);
  check('E1 completed', (await status(m.ids.E1))?.status === 'completed');
  check('E1 result posted', (await c.count('community_posts', `result_event_id=eq.${m.ids.E1}`)) === 1);
  check('E2 live', (await status(m.ids.E2))?.status === 'in_progress');
  check('E2 waiting list', (await c.count('event_participants', `event_id=eq.${m.ids.E2}&status=eq.waiting_list`)) === 2);
  check('E2 partly paid', (await c.count('event_participants', `event_id=eq.${m.ids.E2}&has_paid=eq.true`)) === 3);
  check('E2 round 2 pending', (await c.count('event_rounds', `event_id=eq.${m.ids.E2}&round_number=eq.2`)) === 1);
  check('E2 timer running', (await one<{ status: string }>('event_timer', `event_id=eq.${m.ids.E2}&select=status`))?.status === 'running');
  check('E2 next occurrence scheduled', (await status(m.ids.E2_NEXT))?.status === 'scheduled');
  check('E3 live, no location', (await status(m.ids.E3))?.status === 'in_progress' && (await one<{ has_location: boolean }>('events', `id=eq.${m.ids.E3}&select=has_location`))?.has_location === false);
  check('E4 zero confirmed', (await c.count('event_participants', `event_id=eq.${m.ids.E4}&status=eq.confirmed`)) === 0);
  check('E5 7 confirmed', (await c.count('event_participants', `event_id=eq.${m.ids.E5}&status=eq.confirmed`)) === 7);
  check('E6 A1 waiting #1', (await one<{ waiting_list_position: number }>('event_participants', `event_id=eq.${m.ids.E6}&user_id=eq.${a1}&select=waiting_list_position`))?.waiting_list_position === 1);
  check('E7 A1 interested', (await one<{ status: string }>('event_participants', `event_id=eq.${m.ids.E7}&user_id=eq.${a1}&select=status`))?.status === 'interested');
  check('E7 partner request to A1', (await c.count('partner_requests', `event_id=eq.${m.ids.E7}&target_id=eq.${a1}&status=eq.pending`)) === 1);
  check('E8 A1 invited, unanswered', (await c.count('event_invitations', `event_id=eq.${m.ids.E8}&invitee_id=eq.${a1}&status=eq.pending`)) === 1);
  check('E9 finished early', (await status(m.ids.E9))?.finished_early === true);
  check('U4 20 ranked events', (await c.count('group_event_results', `user_id=eq.${m.users.u4}`)) === 20);
  check('A1 history = 2', (await c.count('events', `organizer_id=eq.${a1}&status=eq.completed`)) === 2);
  const types = new Set((await c.sel<{ type: string }[]>('notifications', `user_id=eq.${a1}&select=type`)).map((r) => r.type));
  check('A1 notification types', ['event_invite', 'event_cancelled', 'event_updated', 'group_invite', 'community_invite', 'follow', 'participant_confirmed', 'waitlist_spot', 'results_published'].every((t) => types.has(t)), [...types].join(','));
  check('A1 has unread and read', (await c.count('notifications', `user_id=eq.${a1}&read_at=is.null`)) > 0 && (await c.count('notifications', `user_id=eq.${a1}&read_at=not.is.null`)) > 0);
  check('A2 does not exist', (await c.count('profiles', `email=eq.newuser%40padeljam.com`)) === 0);

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error('\nVERIFY FAILED:', e.message); process.exit(1); });
