import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { query, snapshot } from '../driver/a11y';
import { backGesture, clearText, scrollUntilVisible, tap, typeText } from '../driver/actions';
import { expectGone, expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { CONFIG } from '../driver/config';
import { screenshot } from '../driver/sim';
import { loginAs, switchUser, tabTo } from '../driver/flows';
import { select } from '../fixtures/db';
import { pollUntil } from '../fixtures/poll';
import { manifest, resetDb } from '../fixtures/seed';

/**
 * Organizer-only management of an event (UX-MEVT-03..21): the Manage Event dashboard, reached from
 * the settings icon on the event page, its edit sheets, the roster and payment lists behind the
 * Confirmed and Paid cards, the activity log, duplication and cancellation. Every mutation is
 * asserted in the database rather than from the screen alone.
 */
describe('06 event manage (organizer)', () => {
  // Review captures of the dashboard and its sheets (UX-MEVT-03..20), like suite 00's gallery.
  const shot = (file: string) => screenshot(join(CONFIG.artifactsDir, 'manage-event', file));

  beforeAll(async () => {
    await resetDb('full');
    await freshInstall();
    await loginAs('alex'); // organizes E3 (in progress), E4, E5, E6
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  /** Open an event this user organizes, then Manage Event through the header's settings icon. */
  const openManage = async (name: RegExp) => {
    await tabTo('Events');
    await tap({ text: /organizing/i });
    await scrollUntilVisible({ text: name }, { maxSwipes: 8 });
    await tap({ text: name });
    await expectVisible({ text: name }, { timeout: 20_000 });
    await tap({ id: 'event-settings' });
    await expectVisible({ id: 'manage-name' }, { timeout: 20_000 });
  };

  type EventRow = { name: string; num_courts: number; scoring_mode: string; entrance_fee_enabled: boolean; starts_at: string };
  const eventRow = async (id: string) =>
    ((await select('events', `id=eq.${id}&select=name,num_courts,scoring_mode,entrance_fee_enabled,starts_at`)) as EventRow[])[0];

  it('the dashboard lists the event, and Confirmed opens the roster', async () => {
    await openManage(/weekly friday social/i); // E5: alex + maria + joao
    // Format / modality / group are read-only chips (UX-MEVT-09); the cards carry their values.
    const name = query(await snapshot(), { id: 'manage-name' });
    expect(name?.AXLabel ?? '', 'the Event name card names the event').toMatch(/weekly friday social/i);
    await shot('01-dashboard.png');
    await tap({ id: 'manage-confirmed' });
    await expectVisible({ text: /^manage players$/i }, { timeout: 20_000 });
    // The roster must actually render names (regression guard for the PGRST201 embed bug that
    // made every roster come back empty).
    await scrollUntilVisible({ text: /maria santos|joão pereira/i }, { maxSwipes: 6 });
    await backGesture();
    await expectVisible({ id: 'manage-name' }, { timeout: 15_000 });
  });

  it('General Info saves a new name and leaves every other field as it was', async () => {
    const m = manifest();
    const before = await eventRow(m.events.e5);
    // Still on E5's dashboard.
    await tap({ id: 'manage-name' });
    await expectVisible({ id: 'sheet-general-save' }, { timeout: 15_000 });
    await shot('02-general-info.png');
    await clearText({ id: 'general-name' }, 40);
    await typeText({ id: 'general-name' }, 'Weekly Friday Social Plus');
    await tap({ id: 'sheet-general-save' });
    await pollUntil(
      () => eventRow(m.events.e5),
      (row) => row?.name === 'Weekly Friday Social Plus',
      { label: 'event renamed', timeoutMs: 20_000 },
    );
    // update_event replaces every column: the sheet must have sent the rest unchanged.
    const after = await eventRow(m.events.e5);
    expect(after).toMatchObject({
      num_courts: before!.num_courts,
      scoring_mode: before!.scoring_mode,
      entrance_fee_enabled: before!.entrance_fee_enabled,
      starts_at: before!.starts_at,
    });
    await expectVisible({ text: /weekly friday social plus/i }, { timeout: 15_000 });
  });

  it('duplicates an event onto a date picked in the sheet', async () => {
    const m = manifest();
    const before = (await select('events', `organizer_id=eq.${m.users.alex}&select=id`)) as { id: string }[];
    await openManage(/weekly friday social/i);
    await scrollUntilVisible({ id: 'manage-duplicate' }, { maxSwipes: 10 });
    await tap({ id: 'manage-duplicate' });
    await expectVisible({ id: 'sheet-duplicate-save' }, { timeout: 15_000 });
    await shot('03-duplicate.png');
    await tap({ id: 'sheet-duplicate-save' });
    const rows = await pollUntil(
      () => select('events', `organizer_id=eq.${m.users.alex}&select=id,name,starts_at`),
      (r) => (r as unknown[]).length > before.length,
      { label: 'duplicated event row', timeoutMs: 25_000 },
    );
    const copy = (rows as { id: string; name: string; starts_at: string }[]).find(
      (r) => !before.some((b) => b.id === r.id),
    );
    // B8: never "now" — the sheet's date, a week on from the original.
    expect(new Date(copy!.starts_at).getTime(), 'the copy starts in the future').toBeGreaterThan(Date.now() + 60 * 60_000);
    expect(copy!.name).toMatch(/weekly friday social/i);
  });

  it('cancels an event from the footer, through its confirmation sheet', async () => {
    const m = manifest();
    await openManage(/cutoff closing soon/i); // E6, alex organizes, not recurring
    await scrollUntilVisible({ id: 'manage-cancel' }, { maxSwipes: 10 });
    await tap({ id: 'manage-cancel' });
    await expectVisible({ text: /^cancel event$/i, type: 'Heading' }, { timeout: 15_000 });
    await shot('04-cancel.png');
    await tap({ id: 'sheet-cancel-save' });
    await pollUntil(
      () => select('events', `id=eq.${m.events.e6}&select=status`),
      (rows) => (rows as { status: string }[])[0]?.status === 'cancelled',
      { label: 'event cancelled', timeoutMs: 20_000 },
    );
  });

  it('marks a participant as paid from the Payment list', async () => {
    const m = manifest();
    // The Paid card only renders for fee-enabled events. E1 "Tuesday Americano" is the seeded
    // one with a fee, and maria organizes it.
    await switchUser('maria');
    await openManage(/tuesday americano/i);
    await tap({ id: 'manage-paid' });
    await expectVisible({ text: /^payment list$/i }, { timeout: 20_000 });
    // Each row carries a chip showing its CURRENT state ("Unpaid"/"Paid"); tapping it toggles.
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
    await tap({ text: /mark all paid/i });
    await pollUntil(
      () =>
        select(
          'event_participants',
          `event_id=eq.${m.events.e1}&status=eq.confirmed&has_paid=is.false&select=user_id`,
        ),
      (rows) => (rows as unknown[]).length === 0,
      { label: 'no unpaid confirmed participants remain', timeoutMs: 15_000 },
    );
  });

  it('records those actions in the activity log', async () => {
    await backGesture();
    await scrollUntilVisible({ id: 'manage-activity' }, { maxSwipes: 10 });
    await tap({ id: 'manage-activity' });
    await expectVisible({ text: /activity/i }, { timeout: 20_000 });
    // "{actor} marked everyone as paid" must be listed.
    await expectVisible({ text: /marked everyone as paid|marked .* as paid/i }, { timeout: 20_000 });
  });

  // --- Manage players, Invite, Add manually (UX-MEVT-10..13) ---------------------------------

  type Part = { user_id: string | null; guest_name: string | null; status: string };
  const participantsOf = (eventId: string) =>
    select('event_participants', `event_id=eq.${eventId}&select=user_id,guest_name,status`) as Promise<Part[]>;
  const openManagePlayers = async (name: RegExp) => {
    await openManage(name);
    await tap({ id: 'manage-confirmed' });
    await expectVisible({ text: /^manage players$/i }, { timeout: 20_000 });
  };

  it('public group event: the header adds a guest manually, straight onto Confirmed', async () => {
    const m = manifest();
    await switchUser('alex');
    await openManagePlayers(/weekly friday social/i); // E5, public g1 event
    // Confirmed n/capacity (UX-MEVT-10).
    await expectVisible({ text: /^confirmed \d+\/\d+$/i }, { timeout: 15_000 });
    await shot('05-manage-players.png');
    await tap({ id: 'manage-players-add' }); // "+ Add manually" on a public group event
    await expectVisible({ id: 'sheet-add-manual-save' }, { timeout: 15_000 });
    await shot('06-add-manually.png');
    await typeText({ id: 'add-manual-name' }, 'Guest Gil');
    await tap({ id: 'sheet-add-manual-save' });
    await pollUntil(
      () => participantsOf(m.events.e5),
      (rows) => rows.some((r) => r.guest_name === 'Guest Gil' && r.status === 'confirmed'),
      { label: 'guest added and confirmed', timeoutMs: 20_000 },
    );
    await scrollUntilVisible({ text: /^guest gil$/i }, { maxSwipes: 6 });
  });

  it('public group event: removing a confirmed player offers "Remove from event" only (D3)', async () => {
    const m = manifest();
    await scrollUntilVisible({ text: /^joão pereira$/i }, { maxSwipes: 6 });
    await tap({ text: /^joão pereira$/i });
    await expectVisible({ id: 'action-sheet-from_event' }, { timeout: 15_000 });
    expect(query(await snapshot(), { id: 'action-sheet-to_invited' }), 'no invited state on a public group event').toBeUndefined();
    await shot('07-remove-public.png');
    await tap({ id: 'action-sheet-from_event' });
    await pollUntil(
      () => participantsOf(m.events.e5),
      (rows) => !rows.some((r) => r.user_id === m.users.joao),
      { label: 'joão removed from the event', timeoutMs: 20_000 },
    );
  });

  it('private event: Invite searches, selects and sends (UX-MEVT-13)', async () => {
    const m = manifest();
    await switchUser('nina');
    await openManagePlayers(/secret standalone/i); // E8, nina's private group-less event
    await tap({ id: 'manage-players-add' }); // "+ Invite"
    await expectVisible({ id: 'event-invite-search' }, { timeout: 15_000 });
    await typeText({ id: 'event-invite-search' }, 'Maria');
    await expectVisible({ id: `event-invite-row-${m.users.maria}` }, { timeout: 20_000 });
    await tap({ id: `event-invite-row-${m.users.maria}` });
    await shot('08-invite.png');
    await tap({ id: 'event-invite-send' });
    await pollUntil(
      () => select('event_invitations', `event_id=eq.${m.events.e8}&invitee_id=eq.${m.users.maria}&select=status`),
      (rows) => (rows as { status: string }[])[0]?.status === 'pending',
      { label: 'maria invited', timeoutMs: 20_000 },
    );
    await expectVisible({ text: /^manage players$/i }, { timeout: 20_000 });
    // The success banner sits over the top of the screen for 4 s; the next test taps the tabs.
    await expectGone({ text: /^invite sent\.$/i }, { timeout: 15_000 });
  });

  it('private event: an invitee is marked as confirmed from the Invited tab', async () => {
    const m = manifest();
    await tap({ id: 'manage-players-tabs-invited' });
    await expectVisible({ text: /^maria santos$/i }, { timeout: 20_000 });
    await tap({ text: /^maria santos$/i });
    await expectVisible({ id: 'action-sheet-confirm' }, { timeout: 15_000 });
    await tap({ id: 'action-sheet-confirm' });
    await pollUntil(
      () => participantsOf(m.events.e8),
      (rows) => rows.some((r) => r.user_id === m.users.maria && r.status === 'confirmed'),
      { label: 'maria confirmed by the organizer', timeoutMs: 20_000 },
    );
    await expectGone({ text: /is confirmed\.$/i }, { timeout: 15_000 });
  });

  it('private event: "Remove from confirmed list" sends the player back to Invited', async () => {
    const m = manifest();
    await tap({ id: 'manage-players-tabs-confirmed' });
    await expectVisible({ text: /^maria santos$/i }, { timeout: 20_000 });
    await tap({ text: /^maria santos$/i });
    await expectVisible({ id: 'action-sheet-to_invited' }, { timeout: 15_000 });
    await shot('09-remove-private.png');
    await tap({ id: 'action-sheet-to_invited' });
    await pollUntil(
      async () => ({
        parts: await participantsOf(m.events.e8),
        invs: (await select('event_invitations', `event_id=eq.${m.events.e8}&invitee_id=eq.${m.users.maria}&select=status`)) as {
          status: string;
        }[],
      }),
      ({ parts, invs }) => !parts.some((r) => r.user_id === m.users.maria) && invs[0]?.status === 'pending',
      { label: 'maria back to a pending invitation', timeoutMs: 20_000 },
    );
  });
});
