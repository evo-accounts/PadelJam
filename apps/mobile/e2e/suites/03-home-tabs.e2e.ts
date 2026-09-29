import { beforeAll, describe, expect, it } from 'vitest';
import { keyboardTop, query, queryAll, snapshot, type AxElement } from '../driver/a11y';
import {
  backGesture,
  scrollUntilVisible,
  swipe,
  tabBarTop,
  tap,
  toggleSwitch,
  typeText,
} from '../driver/actions';
import { CONFIG } from '../driver/config';
import { expectGone, expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { loginAs, switchUser, tabTo } from '../driver/flows';
import { select } from '../fixtures/db';
import { pollUntil } from '../fixtures/poll';
import { manifest, resetDb } from '../fixtures/seed';

describe('03 home & tabs', () => {
  beforeAll(async () => {
    await resetDb('full');
    await freshInstall();
    await loginAs('alex'); // onboarded organizer → lands on tabs
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  it('home shows the next-events rail with the seeded upcoming event', async () => {
    await scrollUntilVisible({ text: /tuesday americano/i }, { maxSwipes: 4 });
    await expectVisible({ text: /tuesday americano/i });
  });

  it('home shows my groups as a rail of cards with a See all (UX-HOME-01)', async () => {
    await scrollUntilVisible({ id: 'home-groups-see-all' }, { maxSwipes: 6 });
    // A rail of vertical cards: alex's groups sort by name, so which one is on screen first is
    // the seed's business — assert the rail rendered cards, then find a named one in See all.
    const cards = (await snapshot()).filter((el) => el.AXUniqueId?.startsWith('group-card-'));
    expect(cards.length, 'group cards in the My groups rail').toBeGreaterThanOrEqual(1);
    await tap({ id: 'home-groups-see-all' });
    await scrollUntilVisible({ text: /tuesday night league/i }, { maxSwipes: 6 });
    await backGesture();
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 15_000 });
  });

  it('home has no search icon, and the Create event FAB sits ~20pt above the tab bar (B6)', async () => {
    await swipe('down');
    await swipe('down');
    const tree = await snapshot();
    // Chat and Notifications only (UX-HOME-01): search lives on Explore.
    expect(query(tree, { id: 'header-search' }), 'no header search on Home').toBeUndefined();
    const fab = query(tree, { id: 'create-event-fab' });
    expect(fab, 'the FAB is on Home').toBeDefined();
    const bar = tabBarTop(tree);
    expect(bar, 'the tab bar is on screen').not.toBeNull();
    const gap = (bar as number) - (fab!.frame.y + fab!.frame.height);
    // The audit's "roughly 20". It was ~58 on a notched phone before B6.
    expect(gap, `FAB-to-tab-bar gap (${gap}pt)`).toBeGreaterThanOrEqual(12);
    expect(gap, `FAB-to-tab-bar gap (${gap}pt)`).toBeLessThanOrEqual(32);
  });

  it('events tab filters organizing vs going, with a Pending tab', async () => {
    await tabTo('Events');
    // Four tabs (UX-JEVT-01). Anchored: "Show past events" sits above them.
    await expectVisible({ text: /^pending$/i, type: 'Button' });
    await tap({ text: /^organizing$/i, type: 'Button' });
    // alex organizes the in-progress E3 and recurring E5.
    await expectVisible({ text: /live mexicano|weekly friday social/i }, { timeout: 20_000 });
    await tap({ text: /^going$/i, type: 'Button' });
    // alex is going to E1 (joined via seed).
    await expectVisible({ text: /tuesday americano/i }, { timeout: 20_000 });
  });

  it('events tab shows past events only with the toggle on', async () => {
    await tap({ text: /^organizing$/i, type: 'Button' });
    await expectVisible({ text: /live mexicano|weekly friday social/i }, { timeout: 20_000 });
    // E4 "Last Week Mexicano" (alex, completed 7 days ago) is past: hidden by default.
    await expectGone({ text: /last week mexicano/i }, { timeout: 2_000 });
    await toggleSwitch({ id: 'events-show-past' });
    await scrollUntilVisible({ text: /last week mexicano/i }, { maxSwipes: 6 });
    // Back off, so the rest of the run sees the default list (the toggle is remembered).
    await swipe('down');
    await swipe('down');
    await toggleSwitch({ id: 'events-show-past' });
    // No `type: 'Button'` here: after the other segments were tapped, run 36235775381 read the
    // "All" segment as AXGenericElement (traits still Button) — the Fabric stale-role effect.
    await tap({ text: /^all$/i });
  });

  it('Find Event opens Explore in search mode on Events, and Cancel returns to the feed (D11)', async () => {
    await tabTo('Home');
    await swipe('down');
    await tap({ id: 'home-quick-findEvent' });
    // Explore's own input, focused, with Cancel beside it and the Events tab chosen.
    await expectVisible({ id: 'explore-search-cancel' }, { timeout: 15_000 });
    await pollUntil(async () => keyboardTop(await snapshot()), (top) => top != null, {
      label: 'the search input is focused (keyboard up)',
      timeoutMs: 10_000,
    });
    await expectVisible({ id: 'explore-search-tab-events' });
    await tap({ id: 'explore-search-cancel' });
    await expectGone({ id: 'explore-search-cancel' }, { timeout: 10_000 });
    await expectVisible({ id: 'explore-see-all-events' }, { timeout: 15_000 });
  });

  it('explore is a feed under an inline search input: no chip bar, no FAB, See all opens the list', async () => {
    await tabTo('Explore');
    await expectVisible({ id: 'explore-search-input' }, { timeout: 15_000 });
    const tree = await snapshot();
    // UX-EXPL-01/02: no header search, no "For you" chip bar, no FAB on this screen.
    expect(query(tree, { id: 'header-search' }), 'no header search on Explore').toBeUndefined();
    expect(query(tree, { text: /^for you$/i, type: 'Button' }), 'no chip bar on the feed').toBeUndefined();
    expect(query(tree, { id: 'create-event-fab' }), 'no FAB on Explore').toBeUndefined();
    // Players come first (UX-EXPL-01's order), then Events.
    await expectVisible({ text: /players you might know/i }, { timeout: 20_000 });
    await scrollUntilVisible({ id: 'explore-see-all-events' }, { maxSwipes: 4 });
    await tap({ id: 'explore-see-all-events' });
    await expectVisible({ text: /tuesday americano|full house|team cup/i }, { timeout: 20_000 });
    await backGesture(); // pop the pushed see-all screen so the tab bar is reachable again
  });

  it('Follow on a player card resolves to Following and stays put (UX-EXPL-02)', async () => {
    const m = manifest();
    await tabTo('Explore');
    // bruno shares community A with alex and alex does not follow him, so he is on the rail
    // (0128 drops the people alex already follows: maria, joao, sofia).
    const follow = { id: `player-follow-${m.users.bruno}` };
    expect((await expectVisible(follow, { timeout: 20_000 })).AXLabel).toBe('Follow');
    await tap(follow);
    await expectVisible({ label: 'Following' }, { timeout: 15_000 });
    await pollUntil(
      () => select('follows', `follower_id=eq.${m.users.alex}&followee_id=eq.${m.users.bruno}&select=follower_id`),
      (rows) => (rows as unknown[]).length === 1,
      { label: 'alex follows bruno', timeoutMs: 15_000 },
    );
    // The follow invalidates the rail, whose refetch no longer returns bruno. His card must not
    // vanish from under the tap: it stays, resolved, until the screen is left.
    await new Promise((r) => setTimeout(r, 3000));
    await expectVisible({ text: /bruno almeida/i });
    await expectVisible({ label: 'Following' });
  });

  it('the search input finds a player by name in the People tab', async () => {
    await tabTo('Explore');
    await tap({ id: 'explore-search-input' });
    await expectVisible({ id: 'explore-search-cancel' }, { timeout: 10_000 });
    await tap({ id: 'explore-search-tab-players' });
    // rita (Rita Fernandes) shares community A with alex and is not followed, so she is a
    // candidate. The typed value is itself "rita", so only a player CARD (a Button) counts.
    await typeText({ id: 'explore-search-input' }, 'rita');
    const deadline = Date.now() + 20_000;
    let results: AxElement[] = [];
    while (Date.now() < deadline) {
      results = queryAll(await snapshot(), { text: /rita fernandes/i }).filter(
        (el) => el.AXUniqueId !== 'explore-search-input' && el.type === 'Button',
      );
      if (results.length >= 1) break;
      await new Promise((r) => setTimeout(r, CONFIG.pollIntervalMs));
    }
    expect(results.length, 'a player result card for "rita"').toBeGreaterThanOrEqual(1);
    await tap({ id: 'explore-search-cancel' });
    await expectGone({ id: 'explore-search-cancel' }, { timeout: 10_000 });
  });

  it('Join on a public community in See all resolves to Joined (UX-EXPL-03, B1)', async () => {
    const m = manifest();
    await tabTo('Explore');
    await scrollUntilVisible({ id: 'explore-see-all-communities' }, { maxSwipes: 6 });
    await tap({ id: 'explore-see-all-communities' });
    // Review Club (R) is public with no rules, and alex is not in it.
    const join = { id: `community-join-${m.communities.R}` };
    await scrollUntilVisible(join, { maxSwipes: 6 });
    expect((await expectVisible(join)).AXLabel, 'a public community offers Join, not Request').toBe('Join');
    await tap(join);
    await expectVisible({ label: 'Joined' }, { timeout: 15_000 });
    await pollUntil(
      () => select('community_members', `community_id=eq.${m.communities.R}&user_id=eq.${m.users.alex}&select=user_id`),
      (rows) => (rows as unknown[]).length === 1,
      { label: 'alex joined Review Club', timeoutMs: 15_000 },
    );
    await backGesture();
  });

  it('home shows the add-location banner for a user without location', async () => {
    await tabTo('Home');
    await switchUser('dora'); // seeded with location_text null
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
    await expectVisible({ text: /add your location|location/i }, { timeout: 15_000 });
  });
});
