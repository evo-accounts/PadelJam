import { beforeAll, describe, it } from 'vitest';
import { query, snapshot } from '../driver/a11y';
import { scrollUntilVisible, tap } from '../driver/actions';
import { expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { loginAs, tabTo } from '../driver/flows';
import { select } from '../fixtures/db';
import { pollUntil } from '../fixtures/poll';
import { manifest, resetDb } from '../fixtures/seed';

/**
 * Event detail is role-adaptive: the CTA block differs for organizer, confirmed
 * player, waitlisted player, invitee and outsider. Navigation goes through the
 * Events/Home tabs rather than deep links (see suite 13 for why).
 *
 * KNOWN_ISSUE (task_e435cceb): the roster query embeds `profiles` ambiguously
 * (event_participants has two FKs to profiles), so PostgREST returns PGRST201,
 * the participant list never loads, and every event renders "0 confirmed" with
 * a Join CTA — even for confirmed players and the organizer. The membership
 * tests below therefore FAIL until that fix lands; that is the intended signal.
 */
describe('04 event detail & membership', () => {
  beforeAll(async () => {
    await resetDb('full');
    await freshInstall();
    await loginAs('alex');
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  /** Open an event from the Events tab by its seeded name. */
  const openEvent = async (name: RegExp) => {
    await tabTo('Events');
    await scrollUntilVisible({ text: name }, { maxSwipes: 8 });
    await tap({ text: name });
    await expectVisible({ text: name }, { timeout: 20_000 });
  };

  it('organizer sees Manage instead of a join CTA', async () => {
    await openEvent(/weekly friday social/i); // alex organizes E5
    await scrollUntilVisible({ text: /^Manage$/ }, { maxSwipes: 6 });
    const tree = await snapshot();
    if (query(tree, { text: /^Join$/ })) throw new Error('organizer should not see a Join CTA');
  });

  it('confirmed player can leave and re-join an event', async () => {
    const m = manifest();
    await openEvent(/tuesday americano/i); // alex joined E1 in the seed
    await scrollUntilVisible({ text: /leave/i }, { maxSwipes: 6 });
    await tap({ text: /leave (event|as a player)/i });
    await pollUntil(
      () => select('event_participants', `event_id=eq.${m.events.e1}&user_id=eq.${m.users.alex}&select=status`),
      (rows) => (rows as unknown[]).length === 0,
      { label: 'participant row removed', timeoutMs: 15_000 },
    );
    // CTA flips back to Join, and joining restores the row.
    await tap({ text: /^join( as a player)?$/i });
    await pollUntil(
      () => select('event_participants', `event_id=eq.${m.events.e1}&user_id=eq.${m.users.alex}&select=status`),
      (rows) => (rows as { status: string }[])[0]?.status === 'confirmed',
      { label: 'participant re-confirmed', timeoutMs: 15_000 },
    );
  });

  it('a full event offers the waiting list', async () => {
    const m = manifest();
    // E7 "Full House" is at capacity; alex is not a participant.
    await openEvent(/full house/i);
    await scrollUntilVisible({ text: /waiting list/i }, { maxSwipes: 6 });
    await tap({ text: /join waiting list/i });
    await pollUntil(
      () => select('event_participants', `event_id=eq.${m.events.e7}&user_id=eq.${m.users.alex}&select=status`),
      (rows) => (rows as { status: string }[])[0]?.status === 'waiting_list',
      { label: 'waitlisted', timeoutMs: 15_000 },
    );
    await tap({ text: /leave waiting list/i });
    await pollUntil(
      () => select('event_participants', `event_id=eq.${m.events.e7}&user_id=eq.${m.users.alex}&select=status`),
      (rows) => (rows as unknown[]).length === 0,
      { label: 'left waiting list', timeoutMs: 15_000 },
    );
  });

  it('an event inside the join cutoff shows joining closed', async () => {
    // E6 starts in ~3h, inside the 6h join cutoff.
    await openEvent(/cutoff closing soon/i);
    await scrollUntilVisible({ text: /joining closed/i }, { maxSwipes: 6 });
    const tree = await snapshot();
    if (query(tree, { text: /^join$/i })) throw new Error('Join CTA should be gone inside the cutoff');
  });

  it('an invitee can accept an invitation', async () => {
    const m = manifest();
    // maria is invited to E6 by the seed.
    const { switchUser } = await import('../driver/flows');
    await switchUser('maria');
    await openEvent(/cutoff closing soon/i);
    await scrollUntilVisible({ text: /accept/i }, { maxSwipes: 6 });
    await tap({ text: /^accept$/i });
    await pollUntil(
      () => select('event_participants', `event_id=eq.${m.events.e6}&user_id=eq.${m.users.maria}&select=status`),
      (rows) => (rows as { status: string }[])[0]?.status === 'confirmed',
      { label: 'invitation accepted', timeoutMs: 15_000 },
    );
  });
});
