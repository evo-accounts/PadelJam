import { beforeAll, describe, it } from 'vitest';
import { query, snapshot } from '../driver/a11y';
import { scrollUntilVisible, tap, typeText } from '../driver/actions';
import { expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { loginAs, switchUser, tabTo } from '../driver/flows';
import { select } from '../fixtures/db';
import { pollUntil } from '../fixtures/poll';
import { manifest, resetDb } from '../fixtures/seed';

/**
 * Team events (UX-JEVT-09..13).
 *
 *   inbox       the seed leaves a pending request from rita to alex on E2 "Team Cup": the
 *               Partner Requests row in Notifications opens it, grouped under the event, and
 *               Accept asks first (it declines every other request for that event) — JEVT-12.
 *   entry       E12 "Duo Selection" is a public team event with no invitations. Its bottom action
 *               is a plain "Join" that opens the Team Event sheet — JEVT-09.
 *   guest       alex pairs with someone who is not on the app ("+ Add manually") — JEVT-10.
 *   need        joao lists himself as looking ("Let others invite me") and lands on the
 *               interested state with "Edit response" — JEVT-11 / JEVT-13.
 *   have        sofia picks joao, who was looking, and both are confirmed as a pair; the
 *               "You are going" screen names him — JEVT-10.
 *
 * The fixture's name deliberately excludes the word "partner", so a /partner/ selector can only
 * match the flow's own copy and never the event title.
 */
describe('08 team events & partner requests', () => {
  beforeAll(async () => {
    await resetDb('full');
    await freshInstall();
    await loginAs('alex'); // holds rita's pending partner request
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  /** Any event the user can see, through Home → Find Event (the Events tab lists only their own). */
  const openAnyEvent = async (name: RegExp) => {
    await tabTo('Home');
    await tap({ text: /find event/i });
    await scrollUntilVisible({ text: name }, { maxSwipes: 10 });
    await tap({ text: name });
    await expectVisible({ text: name }, { timeout: 20_000 });
  };

  /** From the event page: Join → the Team Event sheet → one of its two rows. */
  const chooseTeamPath = async (row: 'have' | 'need') => {
    await scrollUntilVisible({ id: 'event-team-join' }, { maxSwipes: 8 });
    await tap({ id: 'event-team-join' });
    await expectVisible({ text: /^team event$/i }, { timeout: 10_000 });
    await expectVisible({ id: 'team-sheet-have' });
    await tap({ id: row === 'have' ? 'team-sheet-have' : 'team-sheet-need' });
    await expectVisible({ text: row === 'have' ? /choose your partner/i : /whoever accepts first/i }, { timeout: 15_000 });
  };

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

  it('opens the partner-requests inbox, grouped by event', async () => {
    // Tap the pinned row ("Partner Requests, N pending"). Asserting on the words "partner request"
    // alone would match that row and pass without ever leaving the notifications list.
    await tap({ text: /partner requests, \d+ pending/i });
    await expectVisible({ text: /^team cup$/i }, { timeout: 20_000 }); // the event heading
    await expectVisible({ text: /rita fernandes/i });
  });

  it('accepting asks first, then forms the team', async () => {
    const m = manifest();
    const [req] = (await select(
      'partner_requests',
      `target_id=eq.${m.users.alex}&requester_id=eq.${m.users.rita}&status=eq.pending&select=id`,
    )) as { id: string }[];
    if (!req) throw new Error('no pending request from rita');
    await scrollUntilVisible({ id: `partner-request-accept-${req.id}` }, { maxSwipes: 6 });
    await tap({ id: `partner-request-accept-${req.id}` });
    // The confirmation explains the side effect before anything happens.
    await expectVisible({ text: /accept partner request\?/i }, { timeout: 10_000 });
    await expectVisible({ text: /declined automatically/i });
    await tap({ id: 'confirm-sheet-confirm' });
    await pollUntil(
      () => select('partner_requests', `id=eq.${req.id}&select=status`),
      (rows) => (rows as { status: string }[])[0]?.status === 'accepted',
      { label: 'request accepted', timeoutMs: 20_000 },
    );
    // Accepting pairs both players onto a team for the event.
    await pollUntil(
      () => select('event_teams', `event_id=eq.${m.events.e2}&select=id`),
      (rows) => (rows as unknown[]).length >= 2, // sofia+bruno from the seed, plus the new pair
      { label: 'team row created', timeoutMs: 20_000 },
    );
    // Answered requests leave the list: nothing else was pending, so the standard empty state.
    await expectVisible({ id: 'empty-partner-requests' }, { timeout: 15_000 });
  });

  it('a team event reads "Join" and opens the Team Event sheet; a guest partner confirms the pair', async () => {
    const m = manifest();
    await openAnyEvent(/duo selection/i);
    // No "Join with a partner" label any more (B9): the partner question comes after Join.
    if (query(await snapshot(), { text: /join with a partner/i })) {
      throw new Error('the team entry should read "Join", not "Join with a partner"');
    }
    await chooseTeamPath('have');
    await tap({ id: 'have-partner-add-manually' });
    await expectVisible({ text: /no access to the app/i }, { timeout: 10_000 });
    await typeText({ id: 'guest-partner-name' }, 'Rui Guest');
    await tap({ id: 'guest-partner-save' });
    await pollUntil(
      () => select('event_participants', `event_id=eq.${m.events.e12}&guest_name=eq.Rui%20Guest&select=status`),
      (rows) => (rows as { status: string }[])[0]?.status === 'confirmed',
      { label: 'guest partner confirmed', timeoutMs: 20_000 },
    );
    await expectVisible({ text: /you are going/i }, { timeout: 15_000 });
    await expectVisible({ text: /rui guest/i });
    await tap({ text: /^close$/i, type: 'Button' });
    await expectVisible({ id: 'event-banner-going' }, { timeout: 15_000 });
  });

  it('"I need a partner" → "Let others invite me" marks the player interested', async () => {
    const m = manifest();
    await switchUser('joao');
    await openAnyEvent(/duo selection/i);
    await chooseTeamPath('need');
    await tap({ id: 'need-partner-let-others' });
    await pollUntil(
      () => select('event_participants', `event_id=eq.${m.events.e12}&user_id=eq.${m.users.joao}&select=status`),
      (rows) => (rows as { status: string }[])[0]?.status === 'interested',
      { label: 'joao interested', timeoutMs: 20_000 },
    );
    // Back on the event: the interested banner and "Edit response" (UX-JEVT-13).
    await expectVisible({ text: /you are interested/i }, { timeout: 15_000 });
    await scrollUntilVisible({ id: 'event-edit-response' }, { maxSwipes: 8 });
    await tap({ id: 'event-edit-response' });
    await expectVisible({ id: 'edit-response-have' }, { timeout: 10_000 });
    await expectVisible({ id: 'edit-response-leave' });
    await tap({ id: 'edit-response-sheet-cancel' });
  });

  it('"I have a partner" confirms both players at once and names the partner', async () => {
    const m = manifest();
    await switchUser('sofia');
    await openAnyEvent(/duo selection/i);
    await chooseTeamPath('have');
    await scrollUntilVisible({ id: `partner-candidate-${m.users.joao}` }, { maxSwipes: 6 });
    await tap({ id: `partner-candidate-${m.users.joao}` });
    await tap({ id: 'have-partner-confirm' });
    await pollUntil(
      () =>
        select(
          'event_participants',
          `event_id=eq.${m.events.e12}&user_id=in.(${m.users.joao},${m.users.sofia})&select=status`,
        ),
      (rows) => (rows as { status: string }[]).filter((r) => r.status === 'confirmed').length === 2,
      { label: 'pair confirmed', timeoutMs: 20_000 },
    );
    await expectVisible({ text: /you are going/i }, { timeout: 15_000 });
    await expectVisible({ text: /joão pereira/i });
    await tap({ text: /^close$/i, type: 'Button' });
    await expectVisible({ id: 'event-banner-going' }, { timeout: 15_000 });
  });
});
