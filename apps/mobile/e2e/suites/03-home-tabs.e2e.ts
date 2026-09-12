import { beforeAll, describe, expect, it } from 'vitest';
import { query, queryAll, snapshot } from '../driver/a11y';
import { backGesture, scrollUntilVisible, swipe, tap, typeText } from '../driver/actions';
import { expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { loginAs, switchUser, tabTo } from '../driver/flows';
import { resetDb } from '../fixtures/seed';

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

  it('home shows my groups', async () => {
    await scrollUntilVisible({ text: /tuesday night league/i }, { maxSwipes: 6 });
    await expectVisible({ text: /tuesday night league/i });
  });

  it('quick action opens the event wizard and closes cleanly', async () => {
    await swipe('down'); // back to top
    await swipe('down');
    await tap({ text: /create event/i });
    // Wizard step 1 (group picker) — close via X / back.
    await expectVisible({ text: /group|no group/i }, { timeout: 20_000 });
    const close = query(await snapshot(), { label: 'Close' }) ?? query(await snapshot(), { text: /close|cancel/i });
    if (close) await tap({ label: close.AXLabel ?? 'Close' });
    else await swipe('down', { fromY: 300 }); // sheet dismiss fallback
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 15_000 });
  });

  it('events tab filters organizing vs going', async () => {
    await tabTo('Events');
    await expectVisible({ text: /organizing/i });
    await tap({ text: /organizing/i });
    // alex organizes the in-progress E3 and recurring E5.
    await expectVisible({ text: /live mexicano|weekly friday social/i }, { timeout: 20_000 });
    await tap({ text: /going/i });
    // alex is going to E1 (joined via seed).
    await expectVisible({ text: /tuesday americano/i }, { timeout: 20_000 });
  });

  it('explore shows all four rails and see-all paginates events', async () => {
    await tabTo('Explore');
    // The Explore tab strip has chips labelled "Events", "Groups" and
    // "Communities" — the EXACT strings three rail titles use. A text selector
    // takes the first match in the tree, which is the chip, so the old loop
    // passed while asserting nothing about three of the four rails.
    //
    // testID is not an option: nothing in this app's tree carries an
    // AXUniqueId, so the driver's `id` selector never matches (verified by
    // dumping a captured tree — 0 elements have one).
    //
    // So: scroll to the ONE rail title that is still unique, then count the
    // "See all" controls. There is exactly one per rail and the chips have
    // none, which makes four an unambiguous statement that four rails rendered.
    await scrollUntilVisible({ text: /players you might know/i }, { maxSwipes: 4 });
    const seeAlls = queryAll(await snapshot(), { text: /see all/i });
    expect(seeAlls.length).toBeGreaterThanOrEqual(4);
    await swipe('down');
    await swipe('down');
    // Open the events see-all list.
    await tap({ text: /see all/i, nth: 1 }).catch(async () => tap({ text: /see all/i }));
    await expectVisible({ text: /tuesday americano|full house|team cup/i }, { timeout: 20_000 });
    await backGesture(); // pop the pushed see-all screen so the tab bar is reachable again
  });

  it('explore header search icon opens /search focused, sharing ExploreList with the tab', async () => {
    // UX-GLOB-08: Explore no longer embeds its own input — the header
    // magnifying glass is the only way in, and it lands on the standalone
    // /search screen (autofocused Field + the same tab chips).
    await tabTo('Explore');
    await tap({ label: 'Search' });
    await expectVisible({ id: 'search-input' }, { timeout: 15_000 });
    await typeText({ id: 'search-input' }, 'alex');
    await expectVisible({ text: /alex/i }, { timeout: 20_000 });
    await backGesture(); // pop /search so the tab bar is reachable again
  });

  it('home shows the add-location banner for a user without location', async () => {
    await tabTo('Home');
    await switchUser('dora'); // seeded with location_text null
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
    await expectVisible({ text: /add your location|location/i }, { timeout: 15_000 });
  });
});
