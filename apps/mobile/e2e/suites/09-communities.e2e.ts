import { beforeAll, describe, it } from 'vitest';
import { query, snapshot } from '../driver/a11y';
import { backGesture, scrollUntilVisible, tap, typeText } from '../driver/actions';
import { expectVisible } from '../driver/expect';
import { freshInstall, relaunch } from '../driver/app';
import { loginAs, switchUser, tabTo } from '../driver/flows';
import { select } from '../fixtures/db';
import { pollUntil } from '../fixtures/poll';
import { manifest, resetDb } from '../fixtures/seed';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Community home (posts / events / groups / members / about), posting, and the
 * join paths for each privacy mode.
 *
 * The tab screens used to read the route param with useLocalSearchParams, which
 * is undefined inside the top-tabs layout, so Members/Groups/About/Reviews
 * queried `community_id=eq.undefined` and rendered their empty states. #134
 * replaced that with the `CommunityIdProvider` context and the tests below went
 * green; they stay as the regression signal.
 *
 * Community A "Lisbon Padel Club" is public with seeded posts; C "Cascais
 * Social" is request-to-join; P is private.
 */
describe('09 communities', () => {
  beforeAll(async () => {
    await resetDb('full');
    await freshInstall();
    await loginAs('alex'); // admin of A (he created it) and of C
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  /**
   * Get back to a bottom-tab screen. Tests here leave the app inside the
   * community stack, whose home is a PAGER: `backGesture()` swipes the left edge
   * mid-screen, the pager consumes it as its own horizontal swipe, and
   * `ensureTabs()` exhausts its pops and gives up — so `tabTo` then times out
   * looking for a tab bar that never appeared. Relaunching sidesteps it; the
   * SecureStore session survives, so boot routing lands back on Home.
   */
  const returnToTabs = async () => {
    await relaunch();
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  };

  /**
   * Put the tab on a given community.
   *
   * The tab IS a community now (UX-COMM-08), so there is no list to scroll and
   * tap. It opens on whichever community is active; anything else is reached
   * through the switcher sheet.
   *
   * The active one is checked FIRST rather than always opening the sheet,
   * because the community's name is in the header as well as in the sheet's
   * rows — with both on screen a `{ text: name }` selector is ambiguous, and
   * the header match would just re-open the switcher.
   */
  const openCommunity = async (name: RegExp) => {
    await tabTo('Community');
    if (query(await snapshot(), { text: name })) return;
    await tap({ id: 'community-switcher-trigger' });
    await tap({ text: name });
    await expectVisible({ text: name }, { timeout: 20_000 });
  };

  it('community home shows its five tabs and seeded posts', async () => {
    await openCommunity(/lisbon padel club/i);
    for (const t of [/posts/i, /events/i, /groups/i, /members/i, /about/i]) {
      await expectVisible({ text: t }, { timeout: 15_000 });
    }
    // Seeded post body.
    await expectVisible({ text: /welcome to lisbon padel club/i }, { timeout: 15_000 });
  });

  it('members tab lists the roster', async () => {
    await tap({ text: /^members$/i });
    await sleep(1200);
    await expectVisible({ text: /maria santos|joão pereira|sofia costa/i }, { timeout: 20_000 });
  });

  it('groups tab lists the community groups', async () => {
    await tap({ text: /^groups$/i });
    await sleep(1200);
    await expectVisible({ text: /tuesday night league|weekend warriors/i }, { timeout: 20_000 });
  });

  it('about tab shows privacy and admins', async () => {
    await tap({ text: /^about$/i });
    await sleep(1200);
    await expectVisible({ text: /public/i }, { timeout: 20_000 });
    // Two roles since migration 0098: the badge reads Admin, never Owner.
    await expectVisible({ text: /admin/i }, { timeout: 15_000 });
  });

  it('composes a post that appears in the feed', async () => {
    const m = manifest();
    const body = `E2E post ${Date.now() % 100000}`;
    await tap({ text: /^posts$/i });
    await sleep(800);
    await scrollUntilVisible({ text: /new post/i }, { maxSwipes: 6 });
    await tap({ text: /new post/i });
    await expectVisible({ text: /new post/i }, { timeout: 20_000 });
    await typeText({ type: 'TextArea' }, body);
    await tap({ text: /^post$/i });
    await pollUntil(
      () => select('community_posts', `community_id=eq.${m.communities.A}&select=body`),
      (rows) => (rows as { body: string }[]).some((r) => r.body?.includes('E2E post')),
      { label: 'post row created', timeoutMs: 25_000 },
    );
    await expectVisible({ text: /e2e post/i }, { timeout: 20_000 });
  });

  // Was skipped while the whole card was one accessibility Button whose label
  // folded in its own actions, leaving Like with no element to target. The card
  // now exposes Like and Comment as siblings of the tappable body, so this taps
  // the real button by label instead of guessing at coordinates.
  it('likes a post', async () => {
    const m = manifest();
    const before = ((await select('post_likes', `user_id=eq.${m.users.alex}&select=post_id`)) as unknown[]).length;
    // Re-establish position: the previous test leaves us inside the community stack.
    await returnToTabs();
    await openCommunity(/lisbon padel club/i);
    await tap({ text: /^posts$/i });
    await sleep(1200);
    await tap({ label: 'Like' });
    await pollUntil(
      () => select('post_likes', `user_id=eq.${m.users.alex}&select=post_id`),
      (rows) => (rows as unknown[]).length !== before,
      { label: 'like toggled', timeoutMs: 20_000 },
    );
  });

  /**
   * The preview's already-requested state, and the cancel that UX-COMM-04 hangs
   * off the same button.
   *
   * pedro's request for C is SEEDED pending (`seed-e2e.mjs` calls
   * `join_community` for him), so the preview must open on "Requested" rather
   * than offering to request again — which is what it did before the preview
   * knew standing at all. Tapping it cancels, and the action falls back to
   * "Request to join": one button, two states, which is the whole item.
   */
  it('a request-to-join community shows an outsider their pending request, and cancels it', async () => {
    const m = manifest();
    // pedro is not a member of C "Cascais Social" (his seeded request is pending).
    // Logout starts from the Profile tab, so we must be on a tab screen first.
    await returnToTabs();
    await switchUser('pedro');
    // pedro belongs to no community, so the Community tab lists nothing for
    // him — reach it through Explore instead.
    await tabTo('Explore');
    // The "For you" rails now hold fixed-width vertical cards, so a community
    // further down the rail sits off screen to the right. Switch to the
    // Communities chip (first "Communities" match in the tree) instead: it
    // renders every community as a full-width card in a vertical list.
    await tap({ text: /^communities$/i, type: 'Button' });
    await sleep(800);
    await scrollUntilVisible({ text: /cascais social/i }, { maxSwipes: 8 });
    await tap({ text: /cascais social/i });

    // Seeded pending: the action says so rather than offering a second request.
    await expectVisible({ label: 'Requested', type: 'Button' }, { timeout: 20_000 });

    // And tapping it withdraws the request (cancel_join_request, migration 0099).
    await tap({ label: 'Requested', type: 'Button' });
    await expectVisible({ label: 'Request to join', type: 'Button' }, { timeout: 20_000 });
    await pollUntil(
      () =>
        select(
          'community_join_requests',
          `user_id=eq.${m.users.pedro}&status=eq.pending&select=id`,
        ),
      (rows) => (rows as unknown[]).length === 0,
      { label: 'pending request withdrawn', timeoutMs: 20_000 },
    );
  });

  /**
   * Guards the primitive that this whole suite had to work around.
   *
   * The community home's body is a top-tabs PAGER, and `backGesture()` used to
   * swipe at y=420 — inside the pager's own content (measured on this screen:
   * tab strip y=302..350, pager content y=350..874). The pager claimed the pan,
   * the stack never popped, and `ensureTabs()` exhausted its pops and returned
   * SILENTLY, so the real failure surfaced later as an unrelated timeout. #19
   * made ensureTabs fall back to relaunch() and throw; that hid the breakage
   * rather than fixing it, and every other caller still got the broken gesture.
   *
   * This asserts the gesture itself, from the exact screen that used to defeat
   * it. `returnToTabs()` above (a relaunch) stays as the suite's own escape
   * hatch — it is deliberately independent of the thing under test here.
   */
  it('the back gesture pops the stack from the tabs pager', async () => {
    await returnToTabs();
    await switchUser('alex');
    await openCommunity(/lisbon padel club/i);
    await expectVisible({ text: /^posts$/i }, { timeout: 15_000 });
    await backGesture();
    // The pushed community screen carries no bottom tab bar (its tree is header
    // + tab strip + pager), so the tab bar reappearing IS the pop.
    await expectVisible({ text: /community, tab, \d+ of \d+/i }, { timeout: 15_000 });
  });
});
