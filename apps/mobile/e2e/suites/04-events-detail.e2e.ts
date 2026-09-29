import { beforeAll, describe, it } from 'vitest';
import { query, snapshot } from '../driver/a11y';
import { backGesture, scrollUntilVisible, tap } from '../driver/actions';
import { expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { deepLink, findFromHome, loginAs, switchUser, tabTo } from '../driver/flows';
import { psql, select } from '../fixtures/db';
import { pollUntil } from '../fixtures/poll';
import { manifest, resetDb } from '../fixtures/seed';

/**
 * Event detail is role-adaptive: the fixed bottom area and the top banner differ
 * for organizer, confirmed player, waitlisted player, invitee and outsider
 * (UX-JEVT-02..07). Leaving is never in the bottom area — it lives in the header's
 * ⋯ sheet ("More options"). Navigation goes through the UI rather than deep links
 * (see suite 13 for why), except for the no-access screen, which is reached from
 * a link by definition.
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
   * Home → Find Event, which opens Explore's search on Events: every visible event. The Events tab only ever
   * shows events you organize or are going to.
   */
  const openAnyEvent = async (name: RegExp) => {
    await findFromHome('findEvent');
    await scrollUntilVisible({ text: name }, { maxSwipes: 10 });
    await tap({ text: name });
    await expectVisible({ text: name }, { timeout: 20_000 });
  };

  it('organizer: settings and ⋯ in the header, the status line and Manage players (UX-MEVT-01)', async () => {
    await openMyEvent(/weekly friday social/i); // alex organizes E5 and plays in it
    // Organizing and going: the settings icon (→ Manage Event) and the players' ⋯, side by side.
    await expectVisible({ id: 'event-settings' }, { timeout: 15_000 });
    await expectVisible({ label: 'More options' });
    await expectVisible({ text: /organizing and going/i });
    // The body is the player view plus a Manage players row; no Join, no old "Manage" button.
    await scrollUntilVisible({ id: 'event-manage-players' }, { maxSwipes: 6 });
    const tree = await snapshot();
    if (query(tree, { text: /^Join$/ })) throw new Error('organizer should not see a Join CTA');
    if (query(tree, { text: /^Manage$/, type: 'Button' })) throw new Error('the old Manage button should be gone');
  });

  it('the players card opens the read-only player list, with an Invited tab', async () => {
    // Still on E5 (alex organizes it; the seed invites sofia explicitly). UX-JEVT-08.
    await scrollUntilVisible({ id: 'event-players-card' }, { maxSwipes: 6 });
    await tap({ id: 'event-players-card' });
    await expectVisible({ text: /^confirmed \(\d+\/\d+\)$/i, type: 'Button' }, { timeout: 15_000 });
    // No waiting list on E5, so no Waiting list tab.
    if (query(await snapshot(), { text: /^waiting list/i, type: 'Button' })) {
      throw new Error('the Waiting list tab should only appear when the event has one');
    }
    await tap({ text: /^invited \(\d+\)$/i, type: 'Button' });
    await expectVisible({ text: /sofia costa/i }, { timeout: 15_000 });
    await backGesture();
    await expectVisible({ id: 'event-players-card' }, { timeout: 15_000 });
  });

  /** Open the header's ⋯ sheet. */
  const openMore = async () => {
    await tap({ label: 'More options' });
    await expectVisible({ text: /^share$/i }, { timeout: 10_000 });
  };

  it('confirmed player leaves from the ⋯ sheet and re-joins into "You are in"', async () => {
    const m = manifest();
    await openMyEvent(/tuesday americano/i); // alex joined E1 in the seed
    await expectVisible({ text: /you are going/i }, { timeout: 15_000 });
    // The bottom area carries no leave action any more (UX-JEVT-03).
    if (query(await snapshot(), { text: /^leave/i, type: 'Button' })) {
      throw new Error('a confirmed player should not see a leave button in the bottom area');
    }
    await openMore();
    await expectVisible({ text: /add to calendar/i });
    await tap({ text: /^leave event$/i });
    // Within the deadline the sheet asks first: primary Leave, secondary Cancel (UX-JEVT-05).
    await expectVisible({ text: /leave event\?/i }, { timeout: 10_000 });
    await tap({ text: /^leave$/i, type: 'Button' });
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
    // A confirmed join lands on the full-screen confirmation, which closes back onto the event.
    await expectVisible({ text: /you are in/i }, { timeout: 15_000 });
    await tap({ text: /^close$/i, type: 'Button' });
    // Re-joining can land on a stand-by spot: the regular spots may have filled while alex was
    // out (run 36212979222 showed 5 / 6 with alex on stand-by). Either banner is a confirmed join.
    await expectVisible({ text: /you are going|on standby/i }, { timeout: 15_000 });
  });

  it('a full event waitlists a member holding no invitation', async () => {
    const m = manifest();
    // E9 "Waitlist Only" is at capacity and carries NO invitations (no public
    // group event does since 0112). E7 "Full House" keeps its stand-by spots, so
    // a joiner there lands confirmed as stand-by rather than on the list.
    await openAnyEvent(/waitlist only/i);
    // The CTA tracks capacity honestly, and E9 disables standby to reach this
    // state: event_capacity() is `num_courts * 4 + (allow_standby ?
    // standby_spots : 0)`, so with baseEvent's default 2 standby spots the cap
    // would be 6 — the screen offers a plain "Join" and a 5th player lands
    // CONFIRMED (is_standby), never waitlisted. With standby off the cap is the
    // 4 regular spots, all taken, and the app offers the waiting list instead.
    await expectVisible({ text: /no more spots available/i }, { timeout: 15_000 });
    await tap({ text: /join waiting list/i });
    await pollUntil(
      () => select('event_participants', `event_id=eq.${m.events.e9}&user_id=eq.${m.users.alex}&select=status`),
      (rows) => (rows as { status: string }[])[0]?.status === 'waiting_list',
      { label: 'waitlisted', timeoutMs: 15_000 },
    );
    // The waiting-list banner explains the broadcast rule; the bottom area offers
    // a secondary "Leave waiting list" (UX-JEVT-04).
    await expectVisible({ text: /you are on the waiting list/i }, { timeout: 15_000 });
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

  it('a waiter confirms a freed spot from the event page (decision 4)', async () => {
    const m = manifest();
    // alex joins E9's waiting list through the app (the previous test left it), so every list
    // the app caches is invalidated the way a real join does it. A spot set up behind the app's
    // back with SQL never reached the cached Events tab (run 36253794592).
    await openAnyEvent(/waitlist only/i);
    await tap({ text: /join waiting list/i });
    await pollUntil(
      () => select('event_participants', `event_id=eq.${m.events.e9}&user_id=eq.${m.users.alex}&select=status`),
      (rows) => (rows as { status: string }[])[0]?.status === 'waiting_list',
      { label: 'waitlisted again', timeoutMs: 15_000 },
    );
    await expectVisible({ text: /you are on the waiting list/i }, { timeout: 15_000 });
    // A confirmed player leaves while alex is looking at the page. Nobody is confirmed
    // automatically: the page's realtime roster turns the bottom area into "Confirm spot".
    await psql(`delete from event_participants where event_id = '${m.events.e9}' and user_id = '${m.users.rita}';`);
    await expectVisible({ text: /it goes to whoever confirms first/i }, { timeout: 20_000 });
    await tap({ text: /^confirm spot$/i, type: 'Button' });
    await pollUntil(
      () => select('event_participants', `event_id=eq.${m.events.e9}&user_id=eq.${m.users.alex}&select=status`),
      (rows) => (rows as { status: string }[])[0]?.status === 'confirmed',
      { label: 'spot claimed', timeoutMs: 15_000 },
    );
    await expectVisible({ text: /you are in/i }, { timeout: 15_000 });
    await tap({ text: /^close$/i, type: 'Button' });
    await expectVisible({ text: /you are going/i }, { timeout: 15_000 });
  });

  it('an event inside the join cutoff shows event closed', async () => {
    // E10 starts in ~3h (inside the 6h cutoff) and carries no invitations, so a
    // plain group member sees the cutoff copy rather than Accept/Decline (public
    // group events carry no invitations since migration 0112). alex organizes
    // E10, so view it as joao.
    await switchUser('joao');
    await openAnyEvent(/cutoff no invites/i);
    await scrollUntilVisible({ text: /event closed/i }, { maxSwipes: 6 });
    if (query(await snapshot(), { text: /^join$/i })) {
      throw new Error('Join CTA should be gone inside the cutoff');
    }
  });

  it('an invitee sees who invited them, accepts, and lands on "You are in"', async () => {
    const m = manifest();
    // NOT a cutoff event: inside the join cutoff the app shows "Event closed"
    // even to an invitee, so use E5 (a week out), where the seed has alex invite
    // sofia explicitly (public events are no longer auto-invited, 0112).
    await switchUser('sofia');
    await openAnyEvent(/weekly friday social/i);
    // The inviter is named in the bottom area (UX-JEVT-03); E5's invite comes from alex.
    await scrollUntilVisible({ text: /invited you/i }, { maxSwipes: 8 });
    await expectVisible({ text: /alex organizer invited you/i });
    await tap({ text: /^accept$/i });
    await pollUntil(
      () => select('event_participants', `event_id=eq.${m.events.e5}&user_id=eq.${m.users.sofia}&select=status`),
      (rows) => (rows as { status: string }[])[0]?.status === 'confirmed',
      { label: 'invitation accepted', timeoutMs: 15_000 },
    );
    await expectVisible({ text: /you are in/i }, { timeout: 15_000 });
    await expectVisible({ text: /add to calendar/i });
    await tap({ text: /^close$/i, type: 'Button' });
    await expectVisible({ text: /you are going/i }, { timeout: 15_000 });
    // Now confirmed, the ⋯ sheet offers Leave event alongside Share / Add to calendar.
    await openMore();
    await expectVisible({ text: /^leave event$/i });
    await tap({ label: 'Close' }); // the sheet's own ✕
  });

  it('a private event the viewer was not invited to shows no access, closing to Home', async () => {
    const m = manifest();
    // E8 is nina's private standalone event with no invitees; sofia cannot see it.
    await deepLink(`mobile:///event/${m.events.e8}`, /you don't have access/i);
    await expectVisible({ text: /only invited players/i });
    await tap({ label: 'Close' });
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });
});
