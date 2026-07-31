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
 * Partner requests for team-spec events. The seed leaves a pending request
 * from rita to alex on E2 "Team Cup", so the inbox has content on first open.
 */
describe('08 partner requests', () => {
  beforeAll(async () => {
    await resetDb('full');
    await freshInstall();
    await loginAs('alex'); // holds rita's pending partner request
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  it('the notifications screen surfaces pending partner requests', async () => {
    const m = manifest();
    const pending = await select(
      'partner_requests',
      `target_id=eq.${m.users.alex}&status=eq.pending&select=id`,
    );
    if ((pending as unknown[]).length === 0) throw new Error('seed left no pending request for alex');
    await tap({ label: 'Notifications', type: 'Button' });
    await expectVisible({ text: /partner requests/i }, { timeout: 20_000 });
  });

  it('opens the partner-requests inbox', async () => {
    // Tap the pinned banner ("Partner Requests, N pending"). Asserting on the
    // words "partner request" alone would match that banner and pass without
    // ever leaving the notifications list.
    await tap({ text: /partner requests, \d+ pending/i });
    await expectVisible({ text: /rita fernandes/i }, { timeout: 20_000 });
    await expectVisible({ text: /^accept$/i }, { timeout: 20_000 });
  });

  it('accepting a request forms the team', async () => {
    const m = manifest();
    await scrollUntilVisible({ text: /^accept$/i }, { maxSwipes: 6 });
    await tap({ text: /^accept$/i });
    await pollUntil(
      () => select('partner_requests', `target_id=eq.${m.users.alex}&status=eq.accepted&select=id`),
      (rows) => (rows as unknown[]).length >= 1,
      { label: 'request accepted', timeoutMs: 20_000 },
    );
    // Accepting pairs both players onto a team for the event.
    await pollUntil(
      () => select('event_teams', `event_id=eq.${m.events.e2}&select=id`),
      (rows) => (rows as unknown[]).length >= 2, // sofia+bruno from the seed, plus the new pair
      { label: 'team row created', timeoutMs: 20_000 },
    );
  });

  it('a team-spec event routes a new player to partner selection', async () => {
    // E12 "Duo Selection" is team-spec and carries NO invitations, so joao
    // arrives with nothing to accept. On E2 "Team Cup" he is auto-invited, and
    // accepting leaves him "You're going" with a Leave CTA and no partner
    // prompt — which is why this needed its own fixture rather than E2.
    await switchUser('joao');
    await tabTo('Home');
    await tap({ text: /find event/i });
    await scrollUntilVisible({ text: /duo selection/i }, { maxSwipes: 10 });
    await tap({ text: /duo selection/i });
    await expectVisible({ text: /duo selection/i }, { timeout: 20_000 });
    // The fixture's name deliberately excludes the word "partner", so this
    // selector can only match an actual CTA and not the event title.
    await scrollUntilVisible({ text: /join with a partner|ask to partner|choose a partner/i }, { maxSwipes: 8 });
    const cta = query(await snapshot(), { text: /join with a partner|ask to partner|choose a partner/i });
    if (!cta) throw new Error('team event offered no partner-selection path');
  });
});
