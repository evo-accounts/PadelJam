import { beforeAll, describe, expect, it } from 'vitest';
import { query, queryAll, snapshot, type AxElement } from '../driver/a11y';
import { clearText, dismissKeyboard, scrollUntilVisible, tap, typeText } from '../driver/actions';
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
 * Location is too, until the manual venue form is opened (UX-CEVT-06). Courts follows the
 * registry venue picked (UX-CEVT-07); Date is four cards over a fixed summary (UX-CEVT-08).
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

  /** YYYY-MM-DD of the day `offset` days from today, in local time — the day scroller's testIDs. */
  const dayId = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `date-day-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const summaryText = (tree: AxElement[]) => {
    const box = query(tree, { id: 'date-summary' });
    return `${box?.AXLabel ?? ''} ${box?.AXValue ?? ''}`;
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

  it('Location opens on the venue registry: search, Add manually, venue cards, and a fixed "no location"', async () => {
    await expectVisible({ id: 'venue-search' }, { timeout: 10_000 });
    await expectVisible({ id: 'venue-add-manually' });
    await expectVisible({ id: 'venue-no-location' });
    // The seeded registry venue, as a card with its address and number of courts.
    await expectVisible({ text: /lisbon padel arena/i, type: 'Button' }, { timeout: 15_000 });
    const card = query(await snapshot(), { text: /lisbon padel arena/i, type: 'Button' });
    expect(card?.AXLabel ?? '', 'the card names the courts').toMatch(/2 courts/i);
    expect(hasNext(await snapshot()), 'the registry list is tap-to-advance: no Next').toBe(false);
  });

  it('a search with no hits says "Location not found" and offers the manual form', async () => {
    await typeText({ id: 'venue-search' }, 'zzqxnowhere');
    await expectVisible({ text: /location not found/i }, { timeout: 10_000 });
    await tap({ text: /^add manually$/i, type: 'Button' });
    // The manual venue form: its note, its fields, and a Next that wants an address.
    await expectVisible({ text: /this event only/i }, { timeout: 5_000 });
    await expectVisible({ id: 'manual-venue-address' });
    await dismissKeyboard();
    await tap({ text: /^next$/i, type: 'Button' });
    await sleep(900);
    await onStep(/^location$/i, 2_000); // no address → still here
    await expectVisible({ text: /enter the address/i });
    await scrollUntilVisible({ id: 'venue-back-to-list' }, { maxSwipes: 5 });
    await tap({ id: 'venue-back-to-list' });
    await expectVisible({ id: 'venue-search' }, { timeout: 5_000 });
    await clearText({ id: 'venue-search' }, 15);
    await dismissKeyboard();
  });

  it('picking a registry venue advances to Courts, where its courts can be ticked', async () => {
    await tap({ text: /lisbon padel arena/i, type: 'Button' }, { timeout: 15_000 });
    await onStep(/^courts$/i);
    await expectVisible({ id: 'courts-mode-select' }, { timeout: 10_000 });
    await tap({ id: 'courts-mode-select' });
    await expectVisible({ text: /doesn't reserve them/i }, { timeout: 5_000 });
    // "Select courts" with nothing ticked is flagged on Next.
    await tap({ text: /^next$/i, type: 'Button' });
    await sleep(900);
    await onStep(/^courts$/i, 2_000);
    await expectVisible({ text: /select at least one court/i });
    await tap({ text: /^court 1$/i });
    await tap({ text: /^court 2$/i });
    // Two courts → eight players.
    const cap = query(await snapshot(), { id: 'courts-capacity' });
    expect(`${cap?.AXLabel ?? ''}`).toMatch(/8 players/i);
    await nextTo(/^date$/i);
  });

  it('Date: day scroller, period tabs with start times, duration presets + custom, and a live summary', async () => {
    // Tomorrow, so the start is never in the past whatever the clock says.
    await tap({ id: dayId(1) });
    await tap({ id: 'time-period-evening' });
    await tap({ id: 'time-slot-19:00' });
    await sleep(300);
    expect(summaryText(await snapshot()), 'default duration is 60').toMatch(/19:00–20:00/);
    await tap({ id: 'duration-90' });
    await sleep(300);
    expect(summaryText(await snapshot())).toMatch(/19:00–20:30/);
    await tap({ id: 'duration-custom' });
    await expectVisible({ id: 'custom-duration-input' }, { timeout: 5_000 });
    await typeText({ id: 'custom-duration-input' }, '75');
    await tap({ id: 'custom-duration-save' });
    await sleep(600);
    expect(summaryText(await snapshot())).toMatch(/19:00–20:15/);
    // No steppers any more.
    expect(query(await snapshot(), { label: 'Increase hour' })).toBeUndefined();
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
          `name=eq.${encodeURIComponent(name)}&select=id,organizer_id,scoring_mode,scoring_value,group_id,venue_id,num_courts,duration_minutes`,
        ),
      (r) => (r as unknown[]).length === 1,
      { label: 'event row created', timeoutMs: 30_000 },
    );
    const created = (
      rows as {
        id: string;
        organizer_id: string;
        scoring_mode: string;
        scoring_value: number | null;
        group_id: string | null;
        venue_id: string | null;
        num_courts: number;
        duration_minutes: number;
      }[]
    )[0]!;
    if (created.organizer_id !== m.users.alex) throw new Error('organizer_id is not the creating user');
    expect(created.group_id, 'continued without a group').toBeNull();
    expect([created.scoring_mode, created.scoring_value], 'Points defaults to 32 (B16)').toEqual(['points', 32]);
    const [venue] = await select<{ id: string }[]>('venues', `name=eq.${encodeURIComponent('Lisbon Padel Arena')}&select=id`);
    expect(created.venue_id, 'the registry venue').toBe(venue?.id);
    expect([created.num_courts, created.duration_minutes], 'two ticked courts, custom 75 min').toEqual([2, 75]);
    const courts = await select<unknown[]>('event_courts', `event_id=eq.${created.id}&select=court_id`);
    expect(courts, 'the ticked courts are stored').toHaveLength(2);
    // And it surfaces in the organizer's own list.
    await tabTo('Events');
    await tap({ text: /organizing/i });
    await expectVisible({ text: /e2e wizard/i }, { timeout: 20_000 });
  });
});
