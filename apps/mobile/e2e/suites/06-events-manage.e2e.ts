import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { query, snapshot, type AxElement } from '../driver/a11y';
import { backGesture, clearText, scrollUntilVisible, tap, typeText } from '../driver/actions';
import { expectGone, expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { CONFIG } from '../driver/config';
import { screenshot } from '../driver/sim';
import { loginAs, switchUser, tabTo } from '../driver/flows';
import { psql, rest, select } from '../fixtures/db';
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

  // --- Payment list (UX-MEVT-16) and Activity (UX-MEVT-17) ------------------------------------

  type PaidRow = { id: string; user_id: string | null; has_paid: boolean; paid_amount: number };
  const paymentsOf = (eventId: string) =>
    select('event_participants', `event_id=eq.${eventId}&status=eq.confirmed&select=id,user_id,has_paid,paid_amount`) as Promise<PaidRow[]>;

  it('the Payment list toggles one player to Paid, crediting the fee', async () => {
    const m = manifest();
    // The Paid card only renders for fee-enabled events. E1 "Tuesday Americano" is the seeded
    // one with a fee (5 €), and maria organizes it.
    await switchUser('maria');
    await openManage(/tuesday americano/i);
    await tap({ id: 'manage-paid' });
    await expectVisible({ text: /^payment list$/i }, { timeout: 20_000 });
    // Total card: nothing collected yet, against fee × confirmed (guests and stand-by included).
    // Matched by text: a plain Text's testID never reaches the E2E tree.
    const confirmed = await paymentsOf(m.events.e1);
    await expectVisible({ text: new RegExp(`^€0 of €${5 * confirmed.length}$`) }, { timeout: 15_000 });
    await expectVisible({ text: new RegExp(`^${confirmed.length} players$`) });
    await shot('10-payment-list.png');
    const alex = confirmed.find((r) => r.user_id === m.users.alex)!;
    await scrollUntilVisible({ id: `payment-toggle-${alex.id}` }, { maxSwipes: 6 });
    expect(query(await snapshot(), { id: `payment-toggle-${alex.id}` })?.AXLabel ?? '').toMatch(/^pending$/i);
    await tap({ id: `payment-toggle-${alex.id}` });
    await pollUntil(
      () => paymentsOf(m.events.e1),
      (rows) => rows.some((r) => r.id === alex.id && r.has_paid && Number(r.paid_amount) === 5),
      { label: 'alex marked paid with the fee credited', timeoutMs: 15_000 },
    );
    await expectVisible({ text: new RegExp(`^€5 of €${5 * confirmed.length}$`) }, { timeout: 15_000 });
  });

  it('"Mark all as paid" asks first, then marks every confirmed player', async () => {
    const m = manifest();
    await tap({ id: 'payments-mark-all' });
    await expectVisible({ id: 'confirm-sheet-confirm' }, { timeout: 10_000 });
    await shot('11-mark-all-confirm.png');
    await tap({ id: 'confirm-sheet-confirm' });
    await pollUntil(
      () => paymentsOf(m.events.e1),
      (rows) => rows.length > 0 && rows.every((r) => r.has_paid),
      { label: 'no unpaid confirmed participants remain', timeoutMs: 15_000 },
    );
    await tap({ id: 'payments-tabs-pending' });
    await expectVisible({ text: /^everyone has paid$/i }, { timeout: 10_000 });
  });

  it('the Activity log lists who / what / when for those actions, newest first', async () => {
    await backGesture();
    await scrollUntilVisible({ id: 'manage-activity' }, { maxSwipes: 10 });
    await tap({ id: 'manage-activity' });
    await expectVisible({ text: /^activity$/i }, { timeout: 20_000 });
    // One element per entry: "{who}, {what}, {when}" — the relative time comes from i18n (B14).
    const markAll = await expectVisible({ id: 'activity-row-marked_all_paid' }, { timeout: 20_000 });
    expect(markAll.AXLabel ?? '').toMatch(/^maria santos, marked \d+ players? as paid, (just now|\d+ minutes? ago)$/i);
    const markOne = query(await snapshot(), { id: 'activity-row-marked_paid' });
    expect(markOne?.AXLabel ?? '').toMatch(/^maria santos, marked alex.* as paid, /i);
    // Newest first: the bulk action sits above the single one.
    expect(markAll.frame.y).toBeLessThan(markOne!.frame.y);
    await shot('12-activity.png');
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
  it('private event: a pending invitation without a roster row is withdrawn from the Invited tab (0127)', async () => {
    const m = manifest();
    // Still nina on E8: maria's invitation is pending again and she has no roster row.
    await tap({ id: 'manage-players-tabs-invited' });
    await expectVisible({ text: /^maria santos$/i }, { timeout: 20_000 });
    await tap({ text: /^maria santos$/i });
    await expectVisible({ id: 'action-sheet-remove' }, { timeout: 15_000 });
    await tap({ id: 'action-sheet-remove' });
    await expectVisible({ id: 'confirm-sheet-confirm' }, { timeout: 15_000 });
    await shot('10-revoke-invitation.png');
    await tap({ id: 'confirm-sheet-confirm' });
    await pollUntil(
      () => select('event_invitations', `event_id=eq.${m.events.e8}&invitee_id=eq.${m.users.maria}&select=status`),
      (rows) => (rows as unknown[]).length === 0,
      { label: "maria's invitation withdrawn", timeoutMs: 20_000 },
    );
    await expectGone({ text: /^maria santos$/i }, { timeout: 15_000 });
  });

  // --- Team management (UX-MEVT-14, 15, 26) --------------------------------------------------
  //
  // E2 "Team Cup": maria organizes; 1 court + 2 stand-by spots = 3 teams. Seeded: sofia + bruno
  // are team 1; rita is interested (her partner request to alex is pending).

  type TeamRow = { team_number: number; player_a_id: string | null; player_b_id: string | null; is_confirmed: boolean };
  const teamsOf = (eventId: string) =>
    select('event_teams', `event_id=eq.${eventId}&select=team_number,player_a_id,player_b_id,is_confirmed&order=team_number`) as Promise<
      TeamRow[]
    >;
  type Row = { id: string; user_id: string | null; guest_name: string | null; status: string };
  const rosterOf = (eventId: string) =>
    select('event_participants', `event_id=eq.${eventId}&select=id,user_id,guest_name,status`) as Promise<Row[]>;
  const pidOf = async (eventId: string, userId: string) => (await rosterOf(eventId)).find((r) => r.user_id === userId)!.id;

  it('team event: the Confirmed card counts complete teams; Manage players opens on Teams (UX-MEVT-26)', async () => {
    const m = manifest();
    await switchUser('maria');
    await openManage(/team cup/i);
    const card = query(await snapshot(), { id: 'manage-confirmed' });
    expect(card?.AXLabel ?? '', 'the Confirmed card names the complete teams').toMatch(/1 complete team/i);
    await tap({ id: 'manage-confirmed' });
    await expectVisible({ text: /^manage players$/i }, { timeout: 20_000 });
    // Two empty teams: four open slots, none of them in a half-formed team.
    await expectVisible({ text: /^4 open slots$/i }, { timeout: 20_000 });
    const rita = await pidOf(m.events.e2, m.users.rita!);
    await expectVisible({ id: `team-unassigned-${rita}` }, { timeout: 15_000 });
    await shot('11-teams.png');
  });

  it('team event: an Interested player is confirmed into a team from the Players tab (UX-MEVT-14)', async () => {
    const m = manifest();
    const rita = await pidOf(m.events.e2, m.users.rita!);
    await tap({ id: 'manage-players-view-players' });
    await tap({ id: 'manage-players-tabs-interested' });
    await expectVisible({ id: `manage-player-${rita}` }, { timeout: 15_000 });
    await shot('12-interested.png');
    await tap({ id: `manage-player-${rita}` });
    await expectVisible({ id: 'action-sheet-confirm' }, { timeout: 15_000 });
    await tap({ id: 'action-sheet-confirm' });
    await expectVisible({ id: 'pick-team-2' }, { timeout: 15_000 });
    await shot('13-pick-team.png');
    await tap({ id: 'pick-team-2' });
    await pollUntil(
      () => teamsOf(m.events.e2),
      (rows) => rows.some((r) => r.team_number === 2 && r.player_a_id === rita),
      { label: 'rita in team 2', timeoutMs: 20_000 },
    );
    await expectGone({ id: `manage-player-${rita}` }, { timeout: 15_000 });
  });

  it('team event: "+" adds a guest manually into the open slot, completing the pair (D7)', async () => {
    const m = manifest();
    const rita = await pidOf(m.events.e2, m.users.rita!);
    await expectGone({ text: /is in team 2\.$/i }, { timeout: 15_000 });
    await tap({ id: 'manage-players-view-teams' });
    await scrollUntilVisible({ id: 'team-slot-2-b-add' }, { maxSwipes: 4 });
    await tap({ id: 'team-slot-2-b-add' });
    await expectVisible({ id: 'sheet-select-player-save' }, { timeout: 15_000 });
    await shot('14-select-player.png');
    await tap({ id: 'select-player-add-manually' });
    await expectVisible({ id: 'team-guest-name' }, { timeout: 15_000 });
    await typeText({ id: 'team-guest-name' }, 'Guest Gus');
    await tap({ id: 'sheet-team-guest-save' });
    await pollUntil(
      async () => ({ teams: await teamsOf(m.events.e2), roster: await rosterOf(m.events.e2) }),
      ({ teams, roster }) => {
        const gus = roster.find((r) => r.guest_name === 'Guest Gus');
        const t2 = teams.find((r) => r.team_number === 2);
        return !!gus && t2?.player_b_id === gus.id && !!t2.is_confirmed && roster.find((r) => r.id === rita)?.status === 'confirmed';
      },
      { label: 'Guest Gus completes team 2, rita confirmed', timeoutMs: 20_000 },
    );
  });

  it('team event: ✕ → "Remove from team" sends the player back to Invited (UX-MEVT-15)', async () => {
    const m = manifest();
    const rita = await pidOf(m.events.e2, m.users.rita!);
    await expectGone({ text: /was added to team 2\.$/i }, { timeout: 15_000 });
    await scrollUntilVisible({ id: 'team-slot-2-a-remove' }, { maxSwipes: 4 });
    await tap({ id: 'team-slot-2-a-remove' });
    await expectVisible({ id: 'action-sheet-from_team' }, { timeout: 15_000 });
    await shot('15-remove-player.png');
    await tap({ id: 'action-sheet-from_team' });
    await pollUntil(
      async () => ({ teams: await teamsOf(m.events.e2), roster: await rosterOf(m.events.e2) }),
      ({ teams, roster }) =>
        !teams.some((r) => r.player_a_id === rita || r.player_b_id === rita) &&
        roster.find((r) => r.id === rita)?.status === 'invited',
      { label: 'rita out of team 2, invited', timeoutMs: 20_000 },
    );
  });

  it('team event: "+" places an invited player through Select and Confirm player (UX-MEVT-15)', async () => {
    const m = manifest();
    const rita = await pidOf(m.events.e2, m.users.rita!);
    await expectGone({ text: /is back on the invited list\.$/i }, { timeout: 15_000 });
    await scrollUntilVisible({ id: 'team-slot-2-a-add' }, { maxSwipes: 4 });
    await tap({ id: 'team-slot-2-a-add' });
    await expectVisible({ id: `select-player-row-${rita}` }, { timeout: 15_000 });
    await tap({ id: `select-player-row-${rita}` });
    // Not confirmed: the sheet asks first, in place.
    await expectVisible({ id: 'sheet-confirm-player-save' }, { timeout: 15_000 });
    await shot('16-confirm-player.png');
    await tap({ id: 'sheet-confirm-player-save' });
    await expectVisible({ id: `select-player-unpick-${rita}` }, { timeout: 15_000 });
    await tap({ id: 'sheet-select-player-save' });
    await pollUntil(
      async () => ({ teams: await teamsOf(m.events.e2), roster: await rosterOf(m.events.e2) }),
      ({ teams, roster }) =>
        teams.some((r) => r.team_number === 2 && r.player_a_id === rita && r.is_confirmed) &&
        roster.find((r) => r.id === rita)?.status === 'confirmed',
      { label: 'rita back in team 2, confirmed with the pair', timeoutMs: 20_000 },
    );
  });

  it('team event: the switch icon swaps two players between teams (UX-MEVT-15)', async () => {
    const m = manifest();
    const rita = await pidOf(m.events.e2, m.users.rita!);
    const sofia = await pidOf(m.events.e2, m.users.sofia!);
    await expectGone({ text: /is in team 2\.$/i }, { timeout: 15_000 });
    const before = (await teamsOf(m.events.e2)).find((r) => r.team_number === 1)!;
    const slot = before.player_a_id === sofia ? 'a' : 'b';
    await scrollUntilVisible({ id: `team-slot-1-${slot}-switch` }, { direction: 'down', maxSwipes: 4 });
    await tap({ id: `team-slot-1-${slot}-switch` });
    await expectVisible({ id: `switch-player-row-${rita}` }, { timeout: 15_000 });
    await tap({ id: `switch-player-row-${rita}` });
    await shot('17-switch-player.png');
    await tap({ id: 'sheet-switch-player-save' });
    await pollUntil(
      () => teamsOf(m.events.e2),
      (rows) => {
        const t1 = rows.find((r) => r.team_number === 1);
        const t2 = rows.find((r) => r.team_number === 2);
        return (slot === 'a' ? t1?.player_a_id : t1?.player_b_id) === rita && t2?.player_a_id === sofia;
      },
      { label: 'rita and sofia switched', timeoutMs: 20_000 },
    );
  });

  // --- Send blast (UX-MEVT-18) ------------------------------------------------------------------

  it('group-less event: a template blast goes out by email, then "Blast sent!"', async () => {
    const m = manifest();
    // E8: nina's private event without a group; nina has no Jammer+ plan.
    await switchUser('nina');
    await openManage(/secret standalone/i);
    await scrollUntilVisible({ id: 'manage-blast' }, { maxSwipes: 10 });
    await tap({ id: 'manage-blast' });
    await expectVisible({ id: 'blast-template-0' }, { timeout: 20_000 });
    // Without customisation: one Templates grid, no Your blasts tab, and the plan prompt below.
    expect(query(await snapshot(), { id: 'blast-tabs-saved' }), 'no Your blasts tab without a plan').toBeUndefined();
    await scrollUntilVisible({ id: 'blast-customize-upgrade-cta' }, { maxSwipes: 6 });
    await shot('13-blast-templates.png');
    await scrollUntilVisible({ id: 'blast-template-0' }, { maxSwipes: 6, direction: 'down' });
    await tap({ id: 'blast-template-0' });
    await expectVisible({ id: 'blast-compose-save' }, { timeout: 15_000 });
    // Send to → Confirmed only; Email is ticked by default.
    await tap({ id: 'blast-send-to' });
    await tap({ id: 'blast-send-to-confirmed' });
    await expectVisible({ id: 'blast-send-to', text: /confirmed only/i });
    await shot('14-blast-compose.png');
    await tap({ id: 'blast-compose-save' });
    await expectVisible({ text: /^blast sent!$/i, type: 'Heading' }, { timeout: 20_000 });
    await shot('15-blast-sent.png');
    const rows = (await select('event_blasts', `event_id=eq.${m.events.e8}&select=send_to,channels,source_template_id`)) as {
      send_to: string;
      channels: string[];
      source_template_id: string | null;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ send_to: 'confirmed', channels: ['email'] });
    expect(rows[0]!.source_template_id).not.toBeNull();
    await tap({ id: 'blast-sent-ok' });
    await expectVisible({ id: 'manage-name' }, { timeout: 15_000 });
  });


  // --- Pending actions, start flow, recurring occurrences (UX-MEVT-22..24, M5) ---------------

  /**
   * Each M5 test signs in as the user it needs and opens its own screen, so it does not depend on
   * where the test before it stopped. `signedIn` skips the (slow) sign-out when already that user.
   */
  let signedIn: string | null = null;
  const as = async (key: 'alex' | 'maria' | 'nina') => {
    if (signedIn === key) return;
    await switchUser(key);
    signedIn = key;
  };

  /** Open an event this user organizes on its event page (not Manage). */
  const openEventPage = async (name: RegExp) => {
    await tabTo('Events');
    await tap({ text: /organizing/i });
    await scrollUntilVisible({ text: name }, { maxSwipes: 8 });
    await tap({ text: name });
    await expectVisible({ text: name }, { timeout: 20_000 });
  };

  it('pending actions: a collapsed card with the count; each row opens what resolves it (UX-MEVT-24)', async () => {
    const m = manifest();
    await as('alex');
    // E10 "Cutoff No Invites": alex alone on a 1-court event (5 of 6 spots open). Courts not
    // reserved is the wizard's "Have not reserved yet" (decision 13).
    await psql(`update events set courts_reserved = false where id = '${m.events.e10}'`);
    await openEventPage(/cutoff no invites/i);
    const toggle = await expectVisible({ id: 'pending-actions-toggle' }, { timeout: 20_000 });
    expect(toggle.AXLabel ?? '', 'titled with the number of pending actions').toMatch(/2 pending actions/i);
    // Collapsed by default.
    expect(query(await snapshot(), { id: 'pending-action-spots' }), 'collapsed by default').toBeUndefined();
    await tap({ id: 'pending-actions-toggle' });
    await expectVisible({ id: 'pending-action-spots' }, { timeout: 10_000 });
    await expectVisible({ id: 'pending-action-courts' });
    await shot('30-pending-actions.png');
    await tap({ id: 'pending-action-courts' });
    // Location & Courts, opened on arrival (manage?sheet=location).
    await expectVisible({ id: 'sheet-location-save' }, { timeout: 20_000 });
    await tap({ id: 'sheet-location-cancel' });
    await expectGone({ id: 'sheet-location-save' }, { timeout: 10_000 });
  });

  it('start event: fewer than 4 players is a blocking sheet with no way to start anyway (UX-MEVT-23)', async () => {
    const m = manifest();
    await as('alex');
    // Start works any time from Manage Event (an early start, decision 1).
    await openManage(/cutoff no invites/i); // E10: alex alone
    await scrollUntilVisible({ id: 'manage-start' }, { maxSwipes: 10 });
    await tap({ id: 'manage-start' });
    // The blocker's line is plain text (a Text's testID never reaches the tree): match its copy.
    await expectVisible({ text: /^can't start yet$/i, type: 'Heading' }, { timeout: 20_000 });
    await expectVisible({ text: /at least 4 confirmed players/i });
    expect(query(await snapshot(), { id: 'start-anyway' }), 'a blocker offers no start anyway').toBeUndefined();
    await expectVisible({ id: 'start-manage-players' });
    await shot('31-start-blocked.png');
    await tap({ id: 'start-close' });
    await expectGone({ id: 'start-close' }, { timeout: 10_000 });
    const rows = (await select('events', `id=eq.${m.events.e10}&select=status`)) as { status: string }[];
    expect(rows[0]?.status, 'still scheduled').toBe('scheduled');
  });

  it('start event: below capacity warns, and "Start anyway" starts it (UX-MEVT-23)', async () => {
    const m = manifest();
    // Four confirmed on a six-spot event: startable, two spots open. Inside the join cut-off, so
    // written directly (as the seed back-dates events).
    await rest('/rest/v1/event_participants', {
      method: 'POST',
      prefer: 'return=minimal',
      body: ['joao', 'sofia', 'bruno'].map((k) => ({
        event_id: m.events.e10,
        user_id: m.users[k],
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
      })),
    });
    await as('alex');
    await openManage(/cutoff no invites/i);
    await scrollUntilVisible({ id: 'manage-start' }, { maxSwipes: 10 });
    await tap({ id: 'manage-start' });
    await expectVisible({ text: /^start the event\?$/i, type: 'Heading' }, { timeout: 20_000 });
    await expectVisible({ text: /2 spots are still open/i });
    await expectVisible({ id: 'start-add-players' });
    await shot('32-start-warning.png');
    await tap({ id: 'start-anyway' });
    await pollUntil(
      () => select('events', `id=eq.${m.events.e10}&select=status`),
      (rows) => (rows as { status: string }[])[0]?.status === 'in_progress',
      { label: 'event started', timeoutMs: 25_000 },
    );
    await expectVisible({ text: /round 1/i }, { timeout: 20_000 });
  });

  it('recurring event: saving Preferences asks this occurrence only / this and upcoming (UX-MEVT-22)', async () => {
    await as('alex');
    await openManage(/weekly friday social/i); // E5, recurring
    await tap({ id: 'manage-preferences' });
    await expectVisible({ id: 'sheet-preferences-save' }, { timeout: 15_000 });
    await tap({ id: 'sheet-preferences-save' });
    await expectVisible({ id: 'edit-scope-this_and_upcoming' }, { timeout: 10_000 });
    await expectVisible({ id: 'edit-scope-only_this' });
    await shot('33-edit-scope.png');
    await tap({ id: 'sheet-preferences-save' });
    await expectGone({ id: 'edit-scope-only_this' }, { timeout: 15_000 });
  });

  it('recurring event: Next occurrences lists the series; "Send invitation now" makes one Scheduled (UX-MEVT-22)', async () => {
    const m = manifest();
    const seriesOf = async () =>
      ((await select('events', `id=eq.${m.events.e5}&select=series_id`)) as { series_id: string }[])[0]!.series_id;
    const series = await seriesOf();
    const occurrencesInDb = () =>
      select('events', `series_id=eq.${series}&deleted_at=is.null&select=id,starts_at`) as Promise<
        { id: string; starts_at: string }[]
      >;
    const before = (await occurrencesInDb()).length;

    await as('alex');
    await openManage(/weekly friday social/i);

    await scrollUntilVisible({ text: /^next occurrences$/i }, { maxSwipes: 10 });
    const cards = (tree: AxElement[]) => tree.filter((e) => (e.AXUniqueId ?? '').startsWith('manage-occurrence-'));
    const upcoming = cards(await snapshot()).find((e) => /upcoming/i.test(e.AXLabel ?? ''));
    if (!upcoming) throw new Error('no Upcoming occurrence card on a recurring event');
    const cardId = upcoming.AXUniqueId!;
    await shot('34-next-occurrences.png');
    await tap({ id: cardId });
    await expectVisible({ id: 'occurrence-settings' }, { timeout: 20_000 });
    // No participation on an occurrence nobody has been invited to yet.
    expect(query(await snapshot(), { id: 'event-manage-players' }), 'no players on an occurrence').toBeUndefined();
    await shot('35-occurrence.png');
    await tap({ id: 'occurrence-settings' });
    await expectVisible({ id: 'action-sheet-send' }, { timeout: 10_000 });
    await expectVisible({ id: 'action-sheet-cancel' });
    await tap({ id: 'action-sheet-send' });
    await expectVisible({ id: 'confirm-sheet-confirm' }, { timeout: 10_000 });
    await tap({ id: 'confirm-sheet-confirm' });
    await pollUntil(occurrencesInDb, (rows) => rows.length === before + 1, {
      label: 'the occurrence materialised',
      timeoutMs: 25_000,
    });
    // Back on Manage Event, the same slot now reads Scheduled.
    const card = await expectVisible({ id: cardId }, { timeout: 20_000 });
    await pollUntil(
      async () => query(await snapshot(), { id: cardId })?.AXLabel ?? card.AXLabel ?? '',
      (label) => /scheduled/i.test(label),
      { label: 'the card reads Scheduled', timeoutMs: 15_000 },
    );
  });
});
