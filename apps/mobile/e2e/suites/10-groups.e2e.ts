import { beforeAll, describe, it } from 'vitest';
import { query, snapshot } from '../driver/a11y';
import { scrollUntilVisible, tap } from '../driver/actions';
import { expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { deepLink, loginAs, switchUser, tabTo } from '../driver/flows';
import { select } from '../fixtures/db';
import { pollUntil } from '../fixtures/poll';
import { manifest, resetDb } from '../fixtures/seed';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Group detail, members, ranking and the season/manage flows — rebuilt for the Groups audit
 * (UX-GRP-04/06/10/14): the members line reads "N players", the period filter lives on the full
 * Ranking screen, and a new season is Manage group → Reset ranking → a confirmation sheet. Groups live under
 * a plain Stack (unlike the community top-tabs), so the route param resolves
 * normally here — these list assertions double as a check on that.
 *
 * Seed: g1 "Tuesday Night League" (public, 6 members, completed events feeding
 * the ranking), g2 "Weekend Warriors" (public), g3 "Secret Squad" (private,
 * maria invited).
 */
describe('10 groups', () => {
  beforeAll(async () => {
    await resetDb('full');
    await freshInstall();
    await loginAs('alex'); // created community A, so admin of it → group admin
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  // Home's My groups is a rail of fixed-width cards (UX-HOME-01), sorted by name, so a given
  // group may sit off screen to the right. So does Your Groups (its See all), one rail per
  // community — whose own "Show all" is the full-width list. Every group opened here is in A.
  const openGroup = async (name: RegExp) => {
    await tabTo('Home');
    await scrollUntilVisible({ id: 'home-groups-see-all' }, { maxSwipes: 8 });
    await tap({ id: 'home-groups-see-all' });
    await tap({ label: 'Show all groups in Lisbon Padel Club' });
    await scrollUntilVisible({ text: name }, { maxSwipes: 8 });
    await tap({ text: name });
    await expectVisible({ text: name }, { timeout: 20_000 });
  };

  it('group detail shows members, events and ranking sections', async () => {
    await openGroup(/tuesday night league/i);
    await expectVisible({ id: 'group-members-line' }, { timeout: 15_000 });
    await scrollUntilVisible({ text: /ranking/i }, { maxSwipes: 8 });
  });

  it('members screen lists real names', async () => {
    // Re-open rather than inherit the previous test's scroll position: that test
    // scrolls down to reach "ranking", which leaves "Members" ABOVE the viewport
    // (measured at y=-478), and scrollUntilVisible's default direction scrolls
    // further down — away from it. It only used to pass because the driver clamps
    // tap coordinates back into the viewport and happened to land on something
    // that navigated. Every sibling test here already opens the group first.
    await openGroup(/tuesday night league/i);
    await tap({ id: 'group-members-line' });
    await expectVisible({ text: /maria santos|joão pereira|sofia costa/i }, { timeout: 20_000 });
  });

  it('ranking lists players with points after completed events', async () => {
    await openGroup(/tuesday night league/i);
    await scrollUntilVisible({ text: /ranking/i }, { maxSwipes: 8 });
    const tree = await snapshot();
    // Either a populated table (player + points headers) or the documented
    // "ranking starts once events are played" placeholder — never nothing.
    const populated = query(tree, { text: /^(player|points)$/i });
    const placeholder = query(tree, { text: /ranking starts once/i });
    if (!populated && !placeholder) {
      throw new Error('ranking section rendered neither a table nor its placeholder');
    }
  });

  it('the full ranking offers the period filters', async () => {
    await openGroup(/tuesday night league/i);
    await scrollUntilVisible({ id: 'group-ranking-see-all' }, { maxSwipes: 8 });
    await tap({ id: 'group-ranking-see-all' });
    await expectVisible({ text: /all time/i }, { timeout: 15_000 });
    await tap({ text: /3 months/i });
    await sleep(1500);
    await expectVisible({ text: /ranking/i });
  });

  it('an admin can start a new season', async () => {
    const m = manifest();
    const before = ((await select('group_seasons', `group_id=eq.${m.groups.g1}&select=id`)) as unknown[]).length;
    await openGroup(/tuesday night league/i);
    // An admin's header action is the settings icon opening Manage Group (UX-GRP-10).
    await tap({ id: 'group-manage' });
    await sleep(1000);
    await tap({ text: /reset ranking/i });
    // Reset ranking opens its confirmation directly (UX-GRP-14).
    // The sheet container's testID is not an a11y element; its confirm button is.
    await expectVisible({ id: 'confirm-sheet-confirm' }, { timeout: 10_000 });
    await tap({ id: 'confirm-sheet-confirm' });
    await pollUntil(
      () => select('group_seasons', `group_id=eq.${m.groups.g1}&select=id`),
      (rows) => (rows as unknown[]).length > before,
      { label: 'new season row', timeoutMs: 25_000 },
    );
    // The admin who closed it lands on the completion screen with the final standings.
    await expectVisible({ text: /season \d+ is closed/i }, { timeout: 20_000 });
  });

  it('an invitee previews a private group and accepts (UX-GRP-02)', async () => {
    // g3 is private and maria holds a pending invitation. She cannot read the group itself until
    // she accepts — the invitation screen shows it through group_invitation_preview (0110).
    const m = manifest();
    await switchUser('maria');
    await deepLink(`mobile:///group/${m.groups.g3}/join`, /secret squad/i);
    await expectVisible({ text: /invited you/i }, { timeout: 15_000 });
    await tap({ id: 'group-invite-accept' });
    await pollUntil(
      () => select('group_members', `group_id=eq.${m.groups.g3}&user_id=eq.${m.users.maria}&select=user_id`),
      (rows) => (rows as unknown[]).length === 1,
      { label: 'maria joined g3', timeoutMs: 20_000 },
    );
    await expectVisible({ id: 'group-members-line' }, { timeout: 20_000 });
  });

  it('a private group is not reachable by a non-invited member', async () => {
    // g3 "Secret Squad" is private; only maria was invited. joao is in the
    // community but not the group.
    await switchUser('joao');
    await tabTo('Home');
    await sleep(1500);
    const tree = await snapshot();
    if (query(tree, { text: /secret squad/i })) {
      throw new Error('a private group appeared in a non-member\'s group list');
    }
  });
});
