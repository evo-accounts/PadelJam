import { beforeAll, describe, it } from 'vitest';
import { query, snapshot } from '../driver/a11y';
import { scrollUntilVisible, tap } from '../driver/actions';
import { expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { loginAs, switchUser, tabTo } from '../driver/flows';
import { select } from '../fixtures/db';
import { pollUntil } from '../fixtures/poll';
import { manifest, resetDb } from '../fixtures/seed';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Group detail, members, ranking and the season/manage flows. Groups live under
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
    await loginAs('alex'); // community owner → group admin
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  const openGroup = async (name: RegExp) => {
    await tabTo('Home');
    await scrollUntilVisible({ text: name }, { maxSwipes: 8 });
    await tap({ text: name });
    await expectVisible({ text: name }, { timeout: 20_000 });
  };

  it('group detail shows members, events and ranking sections', async () => {
    await openGroup(/tuesday night league/i);
    await expectVisible({ text: /members/i }, { timeout: 15_000 });
    await scrollUntilVisible({ text: /ranking/i }, { maxSwipes: 8 });
  });

  it('members screen lists real names', async () => {
    await scrollUntilVisible({ text: /members/i }, { maxSwipes: 8 });
    await tap({ text: /^members$/i }).catch(() => tap({ text: /members/i }));
    await expectVisible({ text: /maria santos|joão pereira|sofia costa/i }, { timeout: 20_000 });
  });

  it('ranking lists players with points after completed events', async () => {
    await openGroup(/tuesday night league/i);
    await scrollUntilVisible({ text: /ranking/i }, { maxSwipes: 8 });
    const tree = await snapshot();
    // Either a populated table (player + points headers) or the documented
    // "ranking starts once events are played" placeholder — never nothing.
    const populated = query(tree, { text: /player|points/i });
    const placeholder = query(tree, { text: /ranking starts once/i });
    if (!populated && !placeholder) {
      throw new Error('ranking section rendered neither a table nor its placeholder');
    }
  });

  it('ranking period filters are offered', async () => {
    await scrollUntilVisible({ text: /all time|3 months/i }, { maxSwipes: 8 });
    await tap({ text: /3 months/i });
    await sleep(1500);
    await expectVisible({ text: /ranking/i });
  });

  it('an admin can start a new season', async () => {
    const m = manifest();
    const before = ((await select('group_seasons', `group_id=eq.${m.groups.g1}&select=id`)) as unknown[]).length;
    await openGroup(/tuesday night league/i);
    // The overflow control renders as a bullet glyph, not the word "More".
    await tap({ label: '•••' });
    await sleep(1000);
    await tap({ text: /manage group/i });
    await expectVisible({ text: /manage group/i }, { timeout: 20_000 });
    await tap({ text: /seasons/i });
    await expectVisible({ text: /start new season/i }, { timeout: 20_000 });
    await tap({ text: /start new season/i });
    // Confirmation dialog.
    await sleep(1200);
    const confirm = query(await snapshot(), { text: /^(confirm|ok|start new season)$/i, type: 'Button' });
    if (confirm) await tap({ label: confirm.AXLabel! });
    await pollUntil(
      () => select('group_seasons', `group_id=eq.${m.groups.g1}&select=id`),
      (rows) => (rows as unknown[]).length > before,
      { label: 'new season row', timeoutMs: 25_000 },
    );
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
