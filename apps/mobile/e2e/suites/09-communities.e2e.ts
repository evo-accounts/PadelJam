import { beforeAll, describe, it } from 'vitest';
import { query, snapshot } from '../driver/a11y';
import { backGesture, scrollUntilVisible, tap, typeText } from '../driver/actions';
import { expectGone, expectVisible } from '../driver/expect';
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

  /**
   * UX-COMM-11's Members tab: a search input at the top, and rows that go
   * somewhere. The search is a plain filter over the roster already in hand —
   * the audit resolved the UX-GLOB-08 conflict in favour of filtering the list
   * in place rather than opening the global search screen.
   */
  // Row behaviour is asserted in suite 11, where the signed-in user administers
  // the community: since UX-COMM-19 merged this list with Manage Members, what a
  // tap does depends on the VIEWER's role — an admin gets the actions sheet, and
  // everyone else goes to the profile. This test covers the filter only, which is
  // what it always did despite its old name.
  it('members tab filters the roster', async () => {
    await tap({ text: /^members$/i });
    await expectVisible({ id: 'member-search' }, { timeout: 20_000 });

    // ONE pass, not two: typeText appends rather than replaces, so a second
    // call would be searching for "sofiajoao". "joao" is the better single
    // query anyway — it proves the filter AND that it is accent-folded, which
    // it has to be for a roster full of Portuguese names.
    await typeText({ id: 'member-search' }, 'joao');
    await expectVisible({ text: /joão pereira/i }, { timeout: 15_000 });
    await expectGone({ text: /sofia costa/i }, { timeout: 5_000 });
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

  /**
   * UX-COMM-10 replaced the floating action button with a composer entry pinned
   * at the top of the feed, so the way IN changed: this used to scroll until it
   * found the FAB's "New post" label. The entry is the list header now — always
   * visible, and reached without scrolling — and "New post" survives only as the
   * title of the screen it opens, which is what the second assertion checks.
   */
  it('composes a post that appears in the feed', async () => {
    const m = manifest();
    const body = `E2E post ${Date.now() % 100000}`;
    await tap({ text: /^posts$/i });
    await sleep(800);
    await expectVisible({ id: 'community-composer-entry' }, { timeout: 20_000 });
    await tap({ id: 'community-composer-entry' });
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
   * UX-COMM-13, reached the way UX-COMM-12 says it should be: About's rating is
   * "a tappable row with a chevron", not a text link, so this taps the ROW.
   *
   * The seed gives A four reviews at 5/4/5/2 — varied on purpose, because a
   * distribution chart drawn from four identical scores is one full bar and
   * four empty ones, which is indistinguishable from a broken chart.
   *
   * The sort selector is the other half: the audit replaced two rows of inline
   * chips with "dropdown selectors ... opening as bottom sheets", and a
   * selector that states its current value in words is the thing the chips
   * could not do.
   */
  it('the About rating opens reviews, with a distribution and a sort sheet', async () => {
    await tap({ text: /^about$/i });
    await sleep(1200);
    await tap({ id: 'about-reviews-row' });

    /*
      Asserted through the chart's CONTENT, not its container's testID. A plain
      View is not an accessibility element, so its testID never reaches the tree
      the driver reads — only elements that are (a Pressable, a TextField, or
      anything marked `accessible`) carry one. The first version of this test
      waited 20s for `review-distribution` while the chart was on screen the
      whole time.

      Asserting the rows is the better test anyway: it pins the seeded shape
      (5:2, 4:1, 2:1) rather than the mere presence of a container.
    */
    await expectVisible({ text: /4\.0 out of 5, 5 reviews/i }, { timeout: 20_000 });
    await expectVisible({ text: /rating 5, 2 reviews/i }, { timeout: 10_000 });
    await expectVisible({ text: /rating 3, 0 reviews/i }, { timeout: 10_000 });
    await expectVisible({ text: /best club in lisbon/i }, { timeout: 15_000 });

    // The selector states its current value, and the sheet changes it.
    await expectVisible({ text: /sort, newest/i }, { timeout: 10_000 });
    await tap({ id: 'reviews-sort' });
    await tap({ text: /highest rated/i });
    await expectVisible({ text: /sort, highest rated/i }, { timeout: 10_000 });

    /*
      UX-COMM-13's write form is a SHEET, not a pushed screen. alex reviewed his
      own club in the seed, so the action reads "Edit your review" for him.

      Asserted through "Cancel", which exists only inside the sheet: the sheet's
      own container is not an accessibility element, so its testID never reaches
      the tree — the same trap this test already fell into once with the
      distribution chart.
    */
    await tap({ text: /edit your review/i });
    await expectVisible({ label: 'Cancel', type: 'Button' }, { timeout: 15_000 });
    await expectVisible({ text: /biased, but we work hard/i }, { timeout: 10_000 });
    await tap({ label: 'Cancel', type: 'Button' });
    await expectGone({ label: 'Cancel', type: 'Button' }, { timeout: 10_000 });
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
   * Migration 0100 end to end: a NON-MEMBER reads a public community's content.
   *
   * This is the assertion the tabs exist for. Before 0100 every one of these
   * queries was gated on `is_community_member`, so an outsider opening Posts saw
   * the empty state — indistinguishable, on screen, from a community that has
   * never posted. A "Posts" chip alone would prove nothing; reading alex's
   * SEEDED post through it is the proof.
   *
   * pedro is still on the preview for C from the test above, so this starts by
   * going back out to Explore. A "Join" button rather than "Request to join" is
   * also how we know the preview read A's privacy as public.
   */
  it('a public community lets an outsider read its posts from the preview', async () => {
    await returnToTabs();
    await tabTo('Explore');
    await tap({ text: /^communities$/i, type: 'Button' });
    await sleep(800);
    await scrollUntilVisible({ text: /lisbon padel club/i }, { maxSwipes: 8 });
    await tap({ text: /lisbon padel club/i });

    // Public, and pedro is no member of it: the plain Join action, not a request.
    await expectVisible({ label: 'Join', type: 'Button' }, { timeout: 20_000 });
    // The five tabs of UX-COMM-04, which only a public community gets.
    await expectVisible({ text: /^posts$/i, type: 'Button' }, { timeout: 15_000 });

    await tap({ text: /^posts$/i, type: 'Button' });
    // alex's seeded post, read by someone who is not in the community.
    await expectVisible({ text: /welcome/i }, { timeout: 20_000 });
    // Read-only: liking is still members-only, so the heart is not a control here.
    await expectGone({ label: 'Like', type: 'Button' }, { timeout: 3_000 });

    // The pinned action survives the tab change (UX-COMM-04).
    await expectVisible({ label: 'Join', type: 'Button' }, { timeout: 10_000 });
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
