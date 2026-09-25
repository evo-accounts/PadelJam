import { beforeAll, describe, expect, it } from 'vitest';
import { query, queryAll, snapshot, type AxElement } from '../driver/a11y';
import { scrollUntilVisible, tap, typeText } from '../driver/actions';
import { expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { loginAs, tabTo } from '../driver/flows';
import { select } from '../fixtures/db';
import { pollUntil } from '../fixtures/poll';
import { manifest, resetDb } from '../fixtures/seed';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The create-event wizard (UX-CEVT-01..05). Each step is named by its heading — Group, Format,
 * Players, Scoring, Location, Courts, Date, Preferences, Details, Invite players — and progress
 * is a bar with a percentage, not "Step N of 10". The path is dynamic: a public group event has
 * no Invite players step, so it is nine steps long; a standalone event keeps all ten.
 *
 * Group, Format and Players are tap-to-advance: the card IS the answer, and there is no Next.
 */
describe('05 event create wizard', () => {
  beforeAll(async () => {
    await resetDb('full');
    await freshInstall();
    await loginAs('alex'); // community admin → can create group events
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  const onStep = (title: RegExp, timeout = 10_000) =>
    expectVisible({ text: title, type: 'Heading' }, { timeout });

  const progressText = (tree: AxElement[]): string => {
    const bar = query(tree, { id: 'event-wizard-progress' });
    return `${bar?.AXLabel ?? ''} ${bar?.AXValue ?? ''}`;
  };

  const hasNext = (tree: AxElement[]) => !!query(tree, { text: /^next$/i, type: 'Button' });

  /** Tap the primary button and wait for the next step's heading. */
  const nextTo = async (title: RegExp) => {
    await tap({ text: /^next$/i, type: 'Button' });
    await onStep(title);
  };

  /**
   * Push the start time a few hours out before leaving the Date step.
   *
   * The picker pre-fills the NEXT WHOLE HOUR, which can be seconds away, and
   * `my_events` only returns rows with `starts_at >= now()`. So an event created
   * at 16:59:5x for 17:00:00 drops out of the organizer's list the instant the
   * clock ticks over — it is not late, it is simply no longer "upcoming" and
   * nothing has marked it in_progress yet.
   *
   * That is exactly how this suite failed on run 34377160736: created just
   * before 17:00, asserted at 17:00:34, filtered out by the RPC. It passes at
   * every other minute of the hour, which is what made it look like a flake.
   */
  const pushStartTimeOut = async () => {
    const INCREASE_HOUR = 'Increase hour'; // DateTimePicker's accessibilityLabel, `event` namespace
    if (!query(await snapshot(), { label: INCREASE_HOUR })) {
      throw new Error(
        `date step: no "${INCREASE_HOUR}" control — the picker's accessibility label changed, ` +
          'so the start time is back to defaulting to the next whole hour and this suite is ' +
          'flaky again near the top of the hour.',
      );
    }
    for (let i = 0; i < 3; i += 1) {
      await tap({ label: INCREASE_HOUR });
      await sleep(250);
    }
  };

  it('opens on Group: a progress bar, no step counter, no Next, and your groups (B14)', async () => {
    await tabTo('Home');
    await tap({ text: /create event/i });
    await onStep(/^group$/i, 20_000);
    // Opened from Home, with no community: the list still shows the groups alex may create in.
    await expectVisible({ text: /tuesday night league/i, type: 'Button' }, { timeout: 15_000 });
    const tree = await snapshot();
    expect(query(tree, { text: /step \d+ of \d+/i }), 'the "Step N of N" label is gone').toBeUndefined();
    expect(hasNext(tree), 'Group is tap-to-advance: no Next').toBe(false);
    expect(progressText(tree), 'progress starts at 0%').toMatch(/\b0\s*%/);
    expect(query(tree, { text: /continue without group/i, type: 'Button' })).toBeDefined();
  });

  it('a tapped group advances straight to Format, on a nine-step path', async () => {
    await tap({ text: /tuesday night league/i, type: 'Button' });
    await onStep(/^format$/i);
    // A public group event skips Invite players: 1 of 9 = 11%.
    expect(progressText(await snapshot())).toMatch(/\b11\s*%/);
    await tap({ label: 'Back' });
    await onStep(/^group$/i);
  });

  it('continuing without a group confirms in a sheet first, then walks ten steps', async () => {
    await tap({ text: /continue without group/i, type: 'Button' });
    await expectVisible({ text: /event without group/i }, { timeout: 10_000 });
    await expectVisible({ text: /ranking/i });
    await tap({ text: /^continue$/i, type: 'Button' });
    await onStep(/^format$/i);
    expect(progressText(await snapshot()), 'standalone keeps Invite players: 1 of 10').toMatch(/\b10\s*%/);
  });

  it('Format and Players advance on the tap, and Players shows the chosen format', async () => {
    expect(hasNext(await snapshot()), 'Format has no Next').toBe(false);
    await tap({ text: /^americano/i, type: 'Button' });
    await onStep(/^players$/i);
    const tree = await snapshot();
    expect(hasNext(tree), 'Players has no Next').toBe(false);
    expect(query(tree, { text: /^americano$/i }), 'the format chip').toBeDefined();
    await tap({ text: /^classic/i, type: 'Button' });
    await onStep(/^scoring$/i);
  });

  it('Scoring asks for a choice on Next, then expands Points with 32 picked', async () => {
    await tap({ text: /^next$/i, type: 'Button' });
    await sleep(900);
    await onStep(/^scoring$/i, 2_000); // still here — validated on tap, not a disabled button
    await tap({ text: /^points/i, type: 'Button' });
    await expectVisible({ text: /^32$/, type: 'Button' }, { timeout: 5_000 });
    const presets = queryAll(await snapshot(), { type: 'Button' }).filter((b) =>
      /^(8|11|16|21|24|32|40)$/.test(b.AXLabel ?? ''),
    );
    expect(presets.length, 'the seven point presets').toBe(7);
    await nextTo(/^location$/i);
  });

  it('walks Location → Courts → Date → Preferences → Details', async () => {
    await nextTo(/^courts$/i); // no location at all keeps the Courts step
    await nextTo(/^date$/i);
    await pushStartTimeOut();
    await nextTo(/^preferences$/i);
    await nextTo(/^details$/i);
  });

  it('blocks Next on Details until an event name is entered', async () => {
    await tap({ text: /^next$/i, type: 'Button' });
    await sleep(1200);
    await onStep(/^details$/i, 2_000);
  });

  it('creates the event end to end', async () => {
    const m = manifest();
    const name = `E2E Wizard ${Date.now() % 100000}`;
    await typeText({ text: /saturday americano/i, type: 'TextField' }, name);
    await nextTo(/^invite players$/i);
    await scrollUntilVisible({ text: /^create event$/i, type: 'Button' }, { maxSwipes: 5 });
    await tap({ text: /^create event$/i, type: 'Button' });
    const rows = await pollUntil(
      () =>
        select(
          'events',
          `name=eq.${encodeURIComponent(name)}&select=id,organizer_id,scoring_mode,scoring_value,group_id`,
        ),
      (r) => (r as unknown[]).length === 1,
      { label: 'event row created', timeoutMs: 30_000 },
    );
    const created = (
      rows as { organizer_id: string; scoring_mode: string; scoring_value: number | null; group_id: string | null }[]
    )[0]!;
    if (created.organizer_id !== m.users.alex) throw new Error('organizer_id is not the creating user');
    expect(created.group_id, 'continued without a group').toBeNull();
    expect([created.scoring_mode, created.scoring_value], 'Points defaults to 32 (B16)').toEqual(['points', 32]);
    // And it surfaces in the organizer's own list.
    await tabTo('Events');
    await tap({ text: /organizing/i });
    await expectVisible({ text: /e2e wizard/i }, { timeout: 20_000 });
  });
});
