import { beforeAll, describe, it } from 'vitest';
import { query, snapshot } from '../driver/a11y';
import { scrollUntilVisible, tap, typeText } from '../driver/actions';
import { expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { loginAs, switchUser, tabTo } from '../driver/flows';
import { select } from '../fixtures/db';
import { pollUntil } from '../fixtures/poll';
import { manifest, resetDb } from '../fixtures/seed';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Community home (posts / events / groups / members / about), posting, and the
 * join paths for each privacy mode.
 *
 * KNOWN_ISSUE (task_9cb95a32): the tab screens under (home)/ read the route
 * param with useLocalSearchParams, which is undefined inside the top-tabs
 * layout, so Members/Groups/About/Reviews query `community_id=eq.undefined`,
 * get a 400 and render their EMPTY STATES. The two tests below are the
 * regression signal and fail until that is fixed. Community A "Lisbon Padel Club" is public
 * with seeded posts; C "Cascais Social" is request-to-join; P is private.
 */
describe('09 communities', () => {
  beforeAll(async () => {
    await resetDb('full');
    await freshInstall();
    await loginAs('alex'); // owner of A, admin of C
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  const openCommunity = async (name: RegExp) => {
    await tabTo('Community');
    await scrollUntilVisible({ text: name }, { maxSwipes: 8 });
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
    await expectVisible({ text: /owner|admin/i }, { timeout: 15_000 });
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

  // TODO(e2e): a post card collapses into ONE accessibility Button whose label
  // folds in its actions ("…, Like, Comment"), so Like has no element of its
  // own and cannot be targeted reliably (a positional tap inside the card did
  // not register either). Worth noting as an accessibility gap too: VoiceOver
  // users cannot reach Like/Comment independently. Needs a testID on the action
  // row, at which point this test can be restored as-is.
  it.skip('likes a post', async () => {
    const m = manifest();
    const before = ((await select('post_likes', `user_id=eq.${m.users.alex}&select=post_id`)) as unknown[]).length;
    // Re-establish position: earlier tabs may have left another tab selected.
    await openCommunity(/lisbon padel club/i);
    await tap({ text: /^posts$/i });
    await sleep(1200);
    // The whole post card is ONE accessibility Button whose label folds in its
    // actions ("…, Like, Comment"), so Like has no element of its own. Tap the
    // action row at the bottom-left of the card instead.
    const card = await expectVisible({ text: /e2e post/i });
    await tap({ x: card.frame.x + 40, y: card.frame.y + card.frame.height - 16 });
    await pollUntil(
      () => select('post_likes', `user_id=eq.${m.users.alex}&select=post_id`),
      (rows) => (rows as unknown[]).length !== before,
      { label: 'like toggled', timeoutMs: 20_000 },
    );
  });

  // Blocked by the same KNOWN_ISSUE as the tab tests: community/[id]/join.tsx
  // also reads the id via useLocalSearchParams, so an outsider's join screen
  // queries `id=eq.undefined` too. Expected to pass once task_9cb95a32 lands.
  it('a request-to-join community shows the request path to an outsider', async () => {
    // pedro is not a member of C "Cascais Social" (his seeded request is pending).
    await tabTo('Home'); // logout starts from the Profile tab; be on a tab screen first
    await switchUser('pedro');
    // pedro belongs to no community, so the Community tab lists nothing for
    // him — reach it through Explore instead.
    await tabTo('Explore');
    await scrollUntilVisible({ text: /communities/i }, { maxSwipes: 6 });
    await scrollUntilVisible({ text: /cascais social/i }, { maxSwipes: 8 });
    await tap({ text: /cascais social/i });
    await sleep(1500);
    const tree = await snapshot();
    // Either the request CTA or the already-requested state.
    const cta = query(tree, { text: /request to join|request sent|admins must approve/i });
    if (!cta) throw new Error('request-to-join community offered no request path');
  });
});
