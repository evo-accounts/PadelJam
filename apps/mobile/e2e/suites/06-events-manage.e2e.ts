import { beforeAll, describe, it } from 'vitest';
import { query, snapshot } from '../driver/a11y';
import { scrollUntilVisible, tap } from '../driver/actions';
import { expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { loginAs, tabTo } from '../driver/flows';
import { select } from '../fixtures/db';
import { pollUntil } from '../fixtures/poll';
import { manifest, resetDb } from '../fixtures/seed';

/**
 * Organizer-only management of an event: roster operations, payment tracking,
 * the audit log, duplication and cancellation. Every mutation is asserted in
 * the database rather than from the screen alone.
 */
describe('06 event manage (organizer)', () => {
  beforeAll(async () => {
    await resetDb('full');
    await freshInstall();
    await loginAs('alex'); // organizes E3 (in progress), E4, E5, E6
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  /** Open an event this user organizes, then its Manage screen. */
  const openManage = async (name: RegExp) => {
    await tabTo('Events');
    await tap({ text: /organizing/i });
    await scrollUntilVisible({ text: name }, { maxSwipes: 8 });
    await tap({ text: name });
    await expectVisible({ text: name }, { timeout: 20_000 });
    await scrollUntilVisible({ text: /^Manage$/ }, { maxSwipes: 8 });
    await tap({ text: /^Manage$/ });
    await expectVisible({ text: /manage event/i }, { timeout: 20_000 });
  };

  it('shows the roster with confirmed players and capacity', async () => {
    await openManage(/weekly friday social/i); // E5: alex + maria + joao
    await expectVisible({ text: /confirmed/i });
    // The roster must actually render names (regression guard for the
    // PGRST201 embed bug that made every roster come back empty).
    await scrollUntilVisible({ text: /maria santos|joão pereira/i }, { maxSwipes: 6 });
  });

  it('duplicates an event', async () => {
    const m = manifest();
    const before = await select('events', `organizer_id=eq.${m.users.alex}&select=id`);
    await openManage(/weekly friday social/i);
    await scrollUntilVisible({ text: /duplicate event/i }, { maxSwipes: 10 });
    await tap({ text: /duplicate event/i });
    await pollUntil(
      () => select('events', `organizer_id=eq.${m.users.alex}&select=id`),
      (rows) => (rows as unknown[]).length > (before as unknown[]).length,
      { label: 'duplicated event row', timeoutMs: 25_000 },
    );
  });

  it('cancels an event and notifies via status', async () => {
    const m = manifest();
    await openManage(/cutoff closing soon/i); // E6, alex organizes
    await scrollUntilVisible({ text: /cancel event/i }, { maxSwipes: 10 });
    await tap({ text: /cancel event/i });
    // Confirmation alert: "Cancel this event?" → confirm.
    await expectVisible({ text: /cancel this event\?/i }, { timeout: 15_000 });
    const confirm = query(await snapshot(), { text: /^cancel event$/i, type: 'Button' })
      ?? query(await snapshot(), { text: /^(yes|confirm|cancel event)$/i, type: 'Button' });
    if (confirm) await tap({ label: confirm.AXLabel! });
    await pollUntil(
      () => select('events', `id=eq.${m.events.e6}&select=status`),
      (rows) => (rows as { status: string }[])[0]?.status === 'cancelled',
      { label: 'event cancelled', timeoutMs: 20_000 },
    );
  });

  it('marks a participant as paid', async () => {
    const m = manifest();
    // Payment controls only render for fee-enabled events. E1 "Tuesday
    // Americano" is the seeded one with a fee, and maria organizes it.
    const { switchUser } = await import('../driver/flows');
    await switchUser('maria');
    await openManage(/tuesday americano/i);
    // Each roster row carries a payment pill showing its CURRENT state
    // ("Unpaid"/"Paid"); tapping it toggles. "Mark paid" only exists as the
    // bulk action label.
    await scrollUntilVisible({ text: /^unpaid$/i, type: 'Button' }, { maxSwipes: 8 });
    await tap({ text: /^unpaid$/i, type: 'Button' });
    await pollUntil(
      () => select('event_participants', `event_id=eq.${m.events.e1}&has_paid=is.true&select=user_id`),
      (rows) => (rows as unknown[]).length >= 1,
      { label: 'a participant marked paid', timeoutMs: 15_000 },
    );
  });

  it('marks everyone as paid', async () => {
    const m = manifest();
    await scrollUntilVisible({ text: /mark all paid/i }, { maxSwipes: 8 });
    await tap({ text: /mark all paid/i });
    await pollUntil(
      () => select('event_participants', `event_id=eq.${m.events.e1}&has_paid=is.false&select=user_id`),
      (rows) => (rows as unknown[]).length === 0,
      { label: 'no unpaid participants remain', timeoutMs: 15_000 },
    );
  });

  it('records those actions in the activity log', async () => {
    await scrollUntilVisible({ text: /activity log/i }, { maxSwipes: 10 });
    await tap({ text: /activity log/i });
    await expectVisible({ text: /activity/i }, { timeout: 20_000 });
    // "{actor} marked everyone as paid" must be listed.
    await expectVisible({ text: /marked everyone as paid|marked .* as paid/i }, { timeout: 20_000 });
  });
});
