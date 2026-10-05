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
import { expectGone, expectText, expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { findFromHome, loginAs, switchUser, tabTo } from '../driver/flows';
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
    // See all lands on Your Groups, which lists every group (a rail per community).
    await expectVisible({ text: 'Your Groups', type: 'Heading' }, { timeout: 15_000 });
    await expectVisible({ text: /tuesday night league/i });
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

  it('Find Event opens Explore search on the Events results, focused, and Cancel returns to the feed (D11)', async () => {
    await tabTo('Home');
    await swipe('down');
    await tap({ id: 'home-quick-findEvent' });
    // Explore's own input, focused, with Cancel beside it and the Events results tab chosen: the
    // empty query's results, i.e. every visible upcoming event, ready to narrow.
    await expectVisible({ id: 'explore-search-cancel' }, { timeout: 15_000 });
    await pollUntil(async () => keyboardTop(await snapshot()), (top) => top != null, {
      label: 'the search input is focused (keyboard up)',
      timeoutMs: 10_000,
    });
    const events = await expectVisible({ id: 'explore-results-tab-events' });
    expect(events.traits ?? [], 'Events is the chosen tab').toContain('Selected');
    await tap({ id: 'explore-search-cancel' });
    await expectGone({ id: 'explore-search-cancel' }, { timeout: 10_000 });
    await expectVisible({ id: 'explore-see-all-events' }, { timeout: 15_000 });

    // A second Find to the same tab, while Explore stayed mounted, focuses the input again (M1 left
    // it unfocused because the route params were identical).
    await tabTo('Home');
    await tap({ id: 'home-quick-findEvent' });
    await expectVisible({ id: 'explore-results-tab-events' }, { timeout: 15_000 });
    await pollUntil(async () => keyboardTop(await snapshot()), (top) => top != null, {
      label: 'the input is focused again on a repeat Find',
      timeoutMs: 10_000,
    });
    await tap({ id: 'explore-search-cancel' });
    await expectGone({ id: 'explore-search-cancel' }, { timeout: 10_000 });
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

  it('an event card shows how far away it is (viewer and event both have a point)', async () => {
    const m = manifest();
    // The seed puts alex in Cascais and Team Cup (E2) in central Lisbon, ~24 km apart; alex neither
    // organises nor attends it, so it is on his Explore list. This is the only E2E check that runs
    // viewer_distance_m end to end — an emptied spatial_ref_sys made it throw (#222) unseen.
    await tabTo('Explore');
    await scrollUntilVisible({ id: 'explore-see-all-events' }, { maxSwipes: 4 });
    await tap({ id: 'explore-see-all-events' });
    const card = { id: `event-card-${m.events.e2}` };
    await scrollUntilVisible(card, { maxSwipes: 6 });
    await expectText(card, /\b2[0-9](\.\d)? km away/i, { timeout: 15_000 });
    await backGesture();
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

  it('search: suggestions while typing, All results with players, back to suggestions (UX-EXPL-05/06)', async () => {
    await tabTo('Explore');
    await tap({ id: 'explore-search-input' });
    await expectVisible({ id: 'explore-search-cancel' }, { timeout: 10_000 });
    // Nothing typed: the tab bar exists only once a query has run.
    expect(query(await snapshot(), { id: 'explore-results-tab-all' }), 'no tab bar before a run').toBeUndefined();

    // rita (Rita Fernandes) is onboarded and not blocked, so her name is suggested (D7, D8).
    await typeText({ id: 'explore-search-input' }, 'rita');
    await expectVisible({ id: 'explore-suggestion-typed' }, { timeout: 10_000 });
    const suggestion = await expectVisible({ text: /^rita fernandes, player$/i }, { timeout: 15_000 });
    await tap({ id: suggestion.AXUniqueId! });

    // The full search for that name, on All: Players first, with her card.
    await expectVisible({ id: 'explore-results-tab-all' }, { timeout: 15_000 });
    await expectVisible({ text: /^players$/i }, { timeout: 15_000 });
    const deadline = Date.now() + 20_000;
    let cards: AxElement[] = [];
    while (Date.now() < deadline) {
      cards = queryAll(await snapshot(), { text: /rita fernandes/i }).filter(
        (el) => el.AXUniqueId !== 'explore-search-input' && el.type === 'Button',
      );
      if (cards.length >= 1) break;
      await new Promise((r) => setTimeout(r, CONFIG.pollIntervalMs));
    }
    expect(cards.length, 'a player card for "Rita Fernandes" on All').toBeGreaterThanOrEqual(1);

    // A typed tab for the same query: no event is called that.
    await tap({ id: 'explore-results-tab-events' });
    await expectVisible({ text: /no events for "rita fernandes"/i }, { timeout: 15_000 });

    // The back arrow returns to the suggestions for what was run.
    await tap({ id: 'explore-search-back' });
    await expectVisible({ id: 'explore-suggestion-typed' }, { timeout: 10_000 });
    expect(query(await snapshot(), { id: 'explore-results-tab-all' }), 'the tab bar leaves with the results').toBeUndefined();
    await tap({ id: 'explore-search-cancel' });
    await expectGone({ id: 'explore-search-cancel' }, { timeout: 10_000 });
  });

  it('search: the run query is a recent search that re-runs, and ✕ removes it (UX-EXPL-04)', async () => {
    await tabTo('Explore');
    await tap({ id: 'explore-search-input' });
    await expectVisible({ id: 'explore-search-cancel' }, { timeout: 10_000 });
    // The previous test ran "Rita Fernandes": most recent first, with Clear all.
    await expectVisible({ id: 'explore-recents-clear' }, { timeout: 10_000 });
    const recent = await expectVisible({ id: 'explore-recent-0' });
    expect(recent.AXLabel).toMatch(/^rita fernandes$/i);
    await tap({ id: 'explore-recent-0' });
    await expectVisible({ id: 'explore-results-tab-all' }, { timeout: 15_000 });
    await expectVisible({ text: /^players$/i }, { timeout: 15_000 });

    // Leave and come back in: the empty query shows the recents again, where ✕ removes one.
    await tap({ id: 'explore-search-cancel' });
    await expectGone({ id: 'explore-search-cancel' }, { timeout: 10_000 });
    await tap({ id: 'explore-search-input' });
    await expectVisible({ id: 'explore-recent-0' }, { timeout: 10_000 });
    await tap({ id: 'explore-recent-remove-0' });
    // It was the only one: the whole block goes.
    await expectGone({ id: 'explore-recents-clear' }, { timeout: 10_000 });
    await tap({ id: 'explore-search-cancel' });
    await expectGone({ id: 'explore-search-cancel' }, { timeout: 10_000 });
  });

  it('search: a typed tab counts and filters its results, and keeps its filters per tab (UX-EXPL-07/08)', async () => {
    await findFromHome('findCommunity');
    await expectVisible({ id: 'explore-communities-results-filter' }, { timeout: 15_000 });
    // The empty query on Communities: every visible community, counted.
    await expectVisible({ text: /^\d+ results?$/i }, { timeout: 15_000 });
    await scrollUntilVisible({ text: /lisbon padel club/i }, { maxSwipes: 6 });

    // Filter → Privacy: Request to join → Apply. Cascais Social is the seeded request-to-join one.
    await tap({ id: 'explore-communities-results-filter' });
    await expectVisible({ id: 'explore-filter-communities-apply' }, { timeout: 10_000 });
    await scrollUntilVisible({ id: 'explore-filter-communities-privacy-request_to_join' }, { maxSwipes: 4 });
    await tap({ id: 'explore-filter-communities-privacy-request_to_join' });
    await tap({ id: 'explore-filter-communities-apply' });
    await expectGone({ id: 'explore-filter-communities-apply' }, { timeout: 10_000 });

    // Applied: a removable chip, the button shows the count, and only matching rows remain.
    const chip = await expectVisible({ id: 'explore-communities-results-chip-0' }, { timeout: 10_000 });
    expect(chip.AXLabel).toMatch(/remove filter: request to join/i);
    await expectVisible({ text: /cascais social/i }, { timeout: 15_000 });
    await expectGone({ text: /lisbon padel club/i }, { timeout: 10_000 });
    expect((await expectVisible({ id: 'explore-communities-results-filter' })).AXLabel).toMatch(/1 filter applied/i);

    // Filters are per tab: All has none, and coming back to Communities restores the chip.
    await tap({ id: 'explore-results-tab-all' });
    await expectGone({ id: 'explore-communities-results-chip-0' }, { timeout: 10_000 });
    await tap({ id: 'explore-results-tab-communities' });
    await expectVisible({ id: 'explore-communities-results-chip-0' }, { timeout: 10_000 });

    // ✕ on the chip removes the filter: the chip row collapses and the public ones are back.
    await tap({ id: 'explore-communities-results-chip-0' });
    await expectGone({ id: 'explore-communities-results-chip-0' }, { timeout: 10_000 });
    await scrollUntilVisible({ text: /lisbon padel club/i }, { maxSwipes: 6 });
    await swipe('down');
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
