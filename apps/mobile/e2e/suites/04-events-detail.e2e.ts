import { beforeAll, describe, it } from 'vitest';
import { query, snapshot } from '../driver/a11y';
import { scrollUntilVisible, tap } from '../driver/actions';
import { expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { loginAs, switchUser, tabTo } from '../driver/flows';
import { select } from '../fixtures/db';
import { pollUntil } from '../fixtures/poll';
import { manifest, resetDb } from '../fixtures/seed';

/**
 * Event detail is role-adaptive: the CTA block differs for organizer, confirmed
 * player, waitlisted player, invitee and outsider. Navigation goes through the
 * UI rather than deep links (see suite 13 for why).
 *
 * Two navigation paths matter: the Events tab lists only events you organize or
 * are going to, so any event you are NOT part of (a full event, an invite you
 * have not accepted) has to be reached through its group.
 */
describe('04 event detail & membership', () => {
  beforeAll(async () => {
    await resetDb('full');
    await freshInstall();
    await loginAs('alex');
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  /** Open one of the signed-in user's own events from the Events tab. */
  const openMyEvent = async (name: RegExp) => {
    await tabTo('Events');
    await scrollUntilVisible({ text: name }, { maxSwipes: 8 });
    await tap({ text: name });
    await expectVisible({ text: name }, { timeout: 20_000 });
  };

  /**
   * Open any event the user can see (including ones they are not part of) via
   * Home → Find Event, which lists all visible events. The Events tab only ever
   * shows events you organize or are going to.
   */
  const openAnyEvent = async (name: RegExp) => {
    await tabTo('Home');
    await tap({ text: /find event/i });
    await scrollUntilVisible({ text: name }, { maxSwipes: 10 });
    await tap({ text: name });
    await expectVisible({ text: name }, { timeout: 20_000 });
  };

  it('organizer sees Manage instead of a join CTA', async () => {
    await openMyEvent(/weekly friday social/i); // alex organizes E5
    await scrollUntilVisible({ text: /^Manage$/ }, { maxSwipes: 6 });
    if (query(await snapshot(), { text: /^Join$/ })) {
      throw new Error('organizer should not see a Join CTA');
    }
  });

  it('confirmed player can leave and re-join an event', async () => {
    const m = manifest();
    await openMyEvent(/tuesday americano/i); // alex joined E1 in the seed
    await scrollUntilVisible({ text: /leave/i }, { maxSwipes: 6 });
    await tap({ text: /leave (event|as a player)/i });
    await pollUntil(
      () => select('event_participants', `event_id=eq.${m.events.e1}&user_id=eq.${m.users.alex}&select=status`),
      (rows) => (rows as unknown[]).length === 0,
      { label: 'participant row removed', timeoutMs: 15_000 },
    );
    await tap({ text: /^join( as a player)?$/i });
    await pollUntil(
      () => select('event_participants', `event_id=eq.${m.events.e1}&user_id=eq.${m.users.alex}&select=status`),
      (rows) => (rows as { status: string }[])[0]?.status === 'confirmed',
      { label: 'participant re-confirmed', timeoutMs: 15_000 },
    );
  });

  it('a full event waitlists a member holding no invitation', async () => {
    const m = manifest();
    // E9 "Waitlist Only" is at capacity and carries NO invitations. E7 "Full
    // House" is deliberately the same shape WITH them, where the viewer gets
    // Accept/Decline instead — which is why this test could not use it: the CTA
    // depended on invitation state as well as capacity.
    await openAnyEvent(/waitlist only/i);
    // The CTA tracks capacity honestly, and E9 disables standby to reach this
    // state: event_capacity() is `num_courts * 4 + (allow_standby ?
    // standby_spots : 0)`, so with baseEvent's default 2 standby spots the cap
    // would be 6 — the screen offers a plain "Join" and a 5th player lands
    // CONFIRMED (is_standby), never waitlisted. With standby off the cap is the
    // 4 regular spots, all taken, and the app offers the waiting list instead.
    await expectVisible({ text: /0 spots left/i }, { timeout: 15_000 });
    await tap({ text: /join waiting list/i });
    await pollUntil(
      () => select('event_participants', `event_id=eq.${m.events.e9}&user_id=eq.${m.users.alex}&select=status`),
      (rows) => (rows as { status: string }[])[0]?.status === 'waiting_list',
      { label: 'waitlisted', timeoutMs: 15_000 },
    );
    // Same reasoning as the Join above: take whichever leave control the screen
    // actually offers rather than asserting on copy that may not exist.
    await scrollUntilVisible({ text: /leave/i }, { maxSwipes: 6 });
    const leave = query(await snapshot(), { text: /leave/i, type: 'Button' });
    if (!leave) throw new Error('no leave control offered after being waitlisted');
    await tap({ label: leave.AXLabel! });
    await pollUntil(
      () => select('event_participants', `event_id=eq.${m.events.e9}&user_id=eq.${m.users.alex}&select=status`),
      (rows) => (rows as unknown[]).length === 0,
      { label: 'left waiting list', timeoutMs: 15_000 },
    );
  });

  it('an event inside the join cutoff shows joining closed', async () => {
    // E10 starts in ~3h (inside the 6h cutoff) and carries no invitations, so a
    // plain group member sees the cutoff copy rather than Accept/Decline — on E6
    // every g1 member is auto-invited and gets the invitation CTA instead. alex
    // organizes E10, so view it as joao.
    await switchUser('joao');
    await openAnyEvent(/cutoff no invites/i);
    await scrollUntilVisible({ text: /joining closed/i }, { maxSwipes: 6 });
    if (query(await snapshot(), { text: /^join$/i })) {
      throw new Error('Join CTA should be gone inside the cutoff');
    }
  });

  it('an invitee can accept an invitation', async () => {
    const m = manifest();
    // NOT E6: inside the join cutoff the app shows "Joining closed" even to an
    // invitee, so use E5 (a week out) where sofia holds an auto-invite.
    await switchUser('sofia');
    await openAnyEvent(/weekly friday social/i);
    await scrollUntilVisible({ text: /accept/i }, { maxSwipes: 8 });
    await tap({ text: /^accept$/i });
    await pollUntil(
      () => select('event_participants', `event_id=eq.${m.events.e5}&user_id=eq.${m.users.sofia}&select=status`),
      (rows) => (rows as { status: string }[])[0]?.status === 'confirmed',
      { label: 'invitation accepted', timeoutMs: 15_000 },
    );
  });
});
