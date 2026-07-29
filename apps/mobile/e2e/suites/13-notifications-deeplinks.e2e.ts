import { beforeAll, describe, it } from 'vitest';
import { query, snapshot } from '../driver/a11y';
import { tap } from '../driver/actions';
import { expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { deepLink, loginAs, tabTo } from '../driver/flows';
import { OpenUrlUnavailableError, push } from '../driver/sim';
import { rest, select } from '../fixtures/db';
import { pollUntil } from '../fixtures/poll';
import { manifest, resetDb } from '../fixtures/seed';

/**
 * Navigation here goes through the UI, not deep links: `simctl openurl` degrades
 * on long-running simulators (10s timeouts that can kill the foreground app), so
 * URL routing is confined to the single tolerant test at the end.
 */
describe('13 notifications & deep links', () => {
  beforeAll(async () => {
    await resetDb('full');
    await freshInstall();
    await loginAs('alex');
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  it('notification bell opens the list with seeded items', async () => {
    const m = manifest();
    const rows = await select('notifications', `user_id=eq.${m.users.alex}&select=id`);
    if ((rows as unknown[]).length === 0) throw new Error('no seeded notifications for alex');
    await tap({ label: 'Notifications', type: 'Button' });
    // The screen renders rows directly (no heading element) — assert on content.
    await expectVisible({ text: /joined|partner requests/i }, { timeout: 20_000 });
  });

  it('a notification inserted via service role appears without relaunch (realtime)', async () => {
    const m = manifest();
    await rest('/rest/v1/notifications', {
      method: 'POST',
      body: {
        user_id: m.users.alex,
        type: 'community_invite',
        actor_id: m.users.maria,
        community_id: m.communities.C,
        actor_name: 'Maria Santos',
        entity_name: 'Cascais Social',
      },
      prefer: 'return=minimal',
    });
    await expectVisible({ text: /cascais social/i }, { timeout: 30_000 });
  });

  it('tapping a notification marks it read', async () => {
    const m = manifest();
    const before = await select('notifications', `user_id=eq.${m.users.alex}&read_at=is.null&select=id`);
    const unreadCount = (before as unknown[]).length;
    if (unreadCount === 0) throw new Error('expected unread notifications to tap');
    // Pick a plain row: invite rows carry an inline "Join" CTA that would be
    // actioned instead of opening (and marking) the notification.
    const row = await expectVisible({ text: /joined/i });
    await tap({ x: row.frame.x + 24, y: row.frame.y + row.frame.height / 2 });
    await pollUntil(
      () => select('notifications', `user_id=eq.${m.users.alex}&read_at=is.null&select=id`),
      (rows) => (rows as unknown[]).length < unreadCount,
      { label: 'notification marked read', timeoutMs: 15_000 },
    );
    await tabTo('Home');
  });

  it('push payload delivery leaves the app interactive', async () => {
    // Delivery-side fan-out is a documented local no-op; this asserts the app
    // survives an APNs payload. Banner tap-routing is timing-dependent and is
    // covered by the manual checklist in e2e/README.md.
    const m = manifest();
    await tabTo('Home'); // start from a known screen so the assertion is meaningful
    await push({
      aps: { alert: { title: 'PadelJam', body: 'Event starting soon' } },
      route: { event_id: m.events.e1 },
    });
    await new Promise((r) => setTimeout(r, 3000));
    // No blind banner tap: a miss lands on whatever sits near the top of the
    // screen. Assert the app absorbed the payload and is still on the tabs.
    await expectVisible({ text: /, tab, \d of 5/ }, { timeout: 20_000 });
    await expectVisible({ text: 'Home', type: 'Heading' });
  });

  it('warm deep link routes to a profile (skipped if openurl is unresponsive)', async (ctx) => {
    const m = manifest();
    try {
      await deepLink(`mobile:///profile/${m.users.maria}`, /maria santos/i);
    } catch (e) {
      if (e instanceof OpenUrlUnavailableError) {
        console.warn(`[e2e] SKIP deep-link test: ${e.message}`);
        ctx.skip();
        return;
      }
      throw e;
    }
    await expectVisible({ text: /maria santos/i });
    if (!query(await snapshot(), { text: /, tab, \d of 5/ })) await tabTo('Home');
  });
});
