import { beforeAll, describe, it } from 'vitest';
import { query, snapshot } from '../driver/a11y';
import { dismissKeyboard, scrollUntilVisible, tap, toggleSwitch, typeText } from '../driver/actions';
import { expectGone, expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { loginAs, tabTo } from '../driver/flows';
import { select } from '../fixtures/db';
import { pollUntil } from '../fixtures/poll';
import { manifest, resetDb } from '../fixtures/seed';

/**
 * Community administration — the six screens under `community/[id]/manage/`.
 *
 * This whole area had no coverage: approving and declining join requests,
 * promoting members and the permission toggles all shipped unguarded, and they
 * are the operations where a mistake is least recoverable (the wrong person
 * admitted to a private community, or an admin unable to remove them).
 *
 * The seed already sets this up exactly, so nothing new was needed: alex is an
 * ADMIN of community C "Cascais Social" (maria created it and also administers it — since
 * migration 0098 there are only two roles), and rita and pedro both
 * hold PENDING join requests there. That is a request-to-join community, which
 * is what makes the approval queue meaningful.
 */
describe('11 community admin', () => {
  beforeAll(async () => {
    await resetDb('full');
    await freshInstall();
    await loginAs('alex'); // admin of community C
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  /**
   * Put the tab on a given community.
   *
   * The tab IS a community now (UX-COMM-08), so there is no list to scroll and
   * tap. It opens on whichever community is active; anything else is reached
   * through the switcher sheet.
   *
   * The active one is checked FIRST rather than always opening the sheet,
   * because the community's name is in the header as well as in the sheet's
   * rows — with both on screen a `{ text: name }` selector is ambiguous, and
   * the header match would just re-open the switcher.
   */
  const switchTo = async (name: RegExp) => {
    await tabTo('Community');
    if (query(await snapshot(), { text: name })) return;
    await tap({ id: 'community-switcher-trigger' });
    await tap({ text: name });
    await expectVisible({ text: name }, { timeout: 20_000 });
  };

  /** Community tab → Cascais Social → the admin menu. */
  const openManage = async () => {
    await switchTo(/cascais social/i);
    // The gear is a header action, always on screen, so there is nothing to
    // scroll to. Its accessibility label is still t('manageTitle'). Since
    // UX-COMM-15 it opens a SHEET rather than pushing a hub screen, so every
    // openSection() below is a row in that sheet and the app returns to the tab
    // — not to a hub — when the pushed screen is dismissed.
    await tap({ text: /manage community/i });
    await expectVisible({ text: /community settings/i }, { timeout: 20_000 });
  };

  /** From the admin menu into one of the screens it opens. */
  const openSection = async (label: RegExp) => {
    await scrollUntilVisible({ text: label }, { maxSwipes: 8 });
    await tap({ text: label });
  };

  it('the admin menu lists every admin action', async () => {
    await openManage();
    for (const action of [
      /community settings/i,
      /member permissions/i,
      /manage members/i,
      /member requests/i,
      /community plan/i,
      /share community/i,
      /archive community|^archive$/i,
      /^leave/i,
    ]) {
      await expectVisible({ text: action }, { timeout: 15_000 });
    }
    // Inviting is deliberately NOT here (UX-COMM-15): it lives on the Members
    // tab and inside Manage Members, so the menu does not offer a third way in.
    await expectGone({ text: /invite members/i }, { timeout: 3_000 });
  });

  it('the plan section shows the plan the community is on, not Starter', async () => {
    // Cascais Social is seeded on Basic (seed-e2e.mjs) and alex administers it without having
    // created it. Since migration 0098 there are two roles and set_community_plan accepts any
    // admin, so the read-only "only the owner can change the plan" hint is gone and alex gets the
    // upgrade action instead. The left card must still say Basic (with the Current badge), never
    // Starter.
    await openManage();
    // The plan is the one piece of administration that stayed a screen; the hub
    // around it became the menu, so it is now reached by its own row.
    await openSection(/community plan/i);
    await scrollUntilVisible({ text: /^plan$/i }, { maxSwipes: 8, direction: 'down' });
    await expectVisible({ text: /^basic$/i }, { timeout: 15_000 });
    await expectVisible({ text: /^current$/i }, { timeout: 15_000 });
    await expectVisible({ text: /^community pro$/i }, { timeout: 15_000 });
    await expectVisible({ text: /upgrade to community pro/i }, { timeout: 15_000 });
    await expectGone({ text: /only the owner can change the plan/i }, { timeout: 3_000 });
    await expectGone({ text: /^starter$/i }, { timeout: 3_000 });
  });

  it('approving a join request admits the requester', async () => {
    const m = manifest();
    // Precondition, asserted rather than assumed: without it this test passes
    // vacuously if rita is ALREADY a member — the post-tap check would be
    // satisfied by seed state alone and the Accept could do nothing.
    const seededMembership = await select(
      'community_members',
      `community_id=eq.${m.communities.C}&user_id=eq.${m.users.rita}&select=user_id`,
    );
    if ((seededMembership as unknown[]).length !== 0) {
      throw new Error('fixture drift: rita is already a member, so this test cannot prove anything');
    }

    await openManage();
    await openSection(/member requests/i);
    // Both rita and pedro are pending; act on rita's row specifically rather
    // than "the first Accept", so the decline test below has a known subject.
    await expectVisible({ text: /rita fernandes/i }, { timeout: 20_000 });
    const rows = await snapshot();
    if (!query(rows, { text: /^accept$/i })) throw new Error('no Accept control on the requests screen');
    await tap({ text: /^accept$/i });

    await pollUntil(
      () => select('community_members', `community_id=eq.${m.communities.C}&user_id=eq.${m.users.rita}&select=role`),
      (r) => (r as unknown[]).length === 1,
      { label: 'rita admitted to the community', timeoutMs: 20_000 },
    );
    await pollUntil(
      () => select('community_join_requests', `community_id=eq.${m.communities.C}&user_id=eq.${m.users.rita}&select=status`),
      (r) => (r as { status: string }[])[0]?.status !== 'pending',
      { label: 'rita request left pending', timeoutMs: 20_000 },
    );
  });

  it('declining a join request leaves the requester out', async () => {
    const m = manifest();
    const [seededRequest] = (await select(
      'community_join_requests',
      `community_id=eq.${m.communities.C}&user_id=eq.${m.users.pedro}&select=status`,
    )) as { status: string }[];
    if (seededRequest?.status !== 'pending') {
      throw new Error(`fixture drift: pedro's request is "${seededRequest?.status}", not pending`);
    }

    await expectVisible({ text: /pedro lopes/i }, { timeout: 20_000 });
    // Decline now opens a confirm sheet rather than acting immediately — the
    // row's own Decline button opens it, and the sheet's Decline button (same
    // label, formerly the alert's destructive button) carries out the action.
    await tap({ text: /^decline$/i });
    await tap({ text: /^decline$/i, type: 'Button' });

    await pollUntil(
      () => select('community_join_requests', `community_id=eq.${m.communities.C}&user_id=eq.${m.users.pedro}&select=status`),
      (r) => (r as { status: string }[])[0]?.status !== 'pending',
      { label: 'pedro request resolved', timeoutMs: 20_000 },
    );
    // The decisive half: resolving the request must NOT have admitted him.
    const members = await select(
      'community_members',
      `community_id=eq.${m.communities.C}&user_id=eq.${m.users.pedro}&select=user_id`,
    );
    if ((members as unknown[]).length !== 0) {
      throw new Error('declining a join request still added the requester to the community');
    }
  });

  it('the members screen lists the roster', async () => {
    await openManage();
    await openSection(/manage members/i);
    // maria created it, alex administers it too, and rita was admitted above.
    await expectVisible({ text: /maria santos/i, }, { timeout: 20_000 });
    await expectVisible({ text: /rita fernandes/i }, { timeout: 20_000 });
  });

  it('toggling a member permission persists it', async () => {
    const m = manifest();
    await openManage();
    await openSection(/member permissions/i);
    await expectVisible({ text: /without being admins/i }, { timeout: 20_000 });

    // RN's Switch surfaces here as an UNLABELED element of type CheckBox, with
    // AXValue "0"/"1" — not as type Switch, and with no text of its own to
    // match on. So address it by ordinal. Migration 0098 added two toggles and
    // the screen now renders UX-COMM-17's order:
    //   0 Create groups / 1 Create events / 2 Invite members /
    //   3 Approve join requests / 4 Create posts
    // Invite members therefore moved from index 0 to index 2. The order lives in
    // app/community/[id]/manage/permissions.tsx — change it there and these
    // indices move with it.
    await expectVisible({ text: /create groups/i }, { timeout: 15_000 });
    await expectVisible({ text: /create events/i }, { timeout: 15_000 });
    await expectVisible({ text: /invite members/i }, { timeout: 15_000 });
    const [before] = (await select(
      'community_permissions',
      `community_id=eq.${m.communities.C}&select=invite_members`,
    )) as { invite_members: boolean }[];

    await toggleSwitch({ type: 'CheckBox', nth: 2 });

    // The DB is the assertion, not the pixel: a switch that animates but never
    // writes would look identical on screen.
    await pollUntil(
      () => select('community_permissions', `community_id=eq.${m.communities.C}&select=invite_members`),
      (r) => (r as { invite_members: boolean }[])[0]?.invite_members !== before?.invite_members,
      { label: 'invite_members flipped', timeoutMs: 20_000 },
    );
  });

  it('inviting a non-member records the invitation', async () => {
    const m = manifest();
    // sofia belongs to community A, not C, and holds no invitation here — so a
    // row appearing is necessarily this test's doing.
    const existing = await select(
      'community_invitations',
      `community_id=eq.${m.communities.C}&invitee_id=eq.${m.users.sofia}&select=id`,
    );
    if ((existing as unknown[]).length !== 0) {
      throw new Error('fixture drift: sofia already has an invitation to community C');
    }

    // UX-COMM-15 took invite out of the admin menu, so this is the Members tab's
    // pinned entry (testID from #142) — the path a real admin takes.
    await switchTo(/cascais social/i);
    await tap({ text: /^members$/i });
    await tap({ id: 'invite-member-entry' });
    await typeText({ type: 'TextField' }, 'Sofia');
    await expectVisible({ text: /sofia costa/i }, { timeout: 20_000 });
    await tap({ text: /sofia costa/i });
    // The CTA counts the selection — "Invite 1 person", not "Invite" — so an
    // anchored /^invite$/ never matches it.
    await tap({ text: /^invite \d+ (person|people)$/i });
    // The confirm sheet's primary button is labelled "Invite" (same label the
    // alert button used to carry) — tap it like any other in-app control now
    // that it's a bottom sheet rather than a native alert. Success is a banner
    // that auto-dismisses and doesn't block navigation, so there's no second
    // button to answer.
    //
    // Matched by testID, not `{ text, type: 'Button' }`: the sheet's primary
    // CTA (SheetHost's confirm Button, non-destructive variant here) has been
    // observed reporting as AX type GenericElement rather than Button even
    // though it renders with accessibilityRole="button" like every other
    // Button — the same "enabled" unreliability documented on tap() in
    // actions.ts, but for `type`. AXUniqueId (testID="confirm-sheet-confirm")
    // doesn't depend on that trait and is exactly what suite 00 already uses
    // for the sheet's close button.
    await tap({ id: 'confirm-sheet-confirm' });

    await pollUntil(
      () => select('community_invitations', `community_id=eq.${m.communities.C}&invitee_id=eq.${m.users.sofia}&select=status`),
      (r) => (r as unknown[]).length === 1,
      { label: 'invitation recorded for sofia', timeoutMs: 20_000 },
    );
  });

  it('editing the community name persists', async () => {
    const m = manifest();
    const [before] = (await select('communities', `id=eq.${m.communities.C}&select=name`)) as { name: string }[];
    if (!before?.name) throw new Error('fixture drift: community C has no name to edit');
    const renamed = `${before.name} Renamed`;

    await openManage();
    await openSection(/community settings/i);
    // The name is the first text field on the screen. typeText handles the
    // pre-filled value: its first pass appends, settled() rejects that, and the
    // retry clears the field before retyping.
    await typeText({ type: 'TextField' }, renamed);
    // Save is PINNED to the bottom since UX-COMM-16, so the scroll-and-clamp
    // hazard this test used to document is gone: it no longer sits below the
    // fold where tap()'s clamp landed in the cover-image picker and opened the
    // iOS photo library. The keyboard is still dismissed first — the footer sits
    // inside the KeyboardAvoidingView, and iOS drops anything under the
    // keyboard's top edge from the accessibility tree.
    await dismissKeyboard();
    await tap({ text: /^save$/i });

    await pollUntil(
      () => select('communities', `id=eq.${m.communities.C}&select=name`),
      (r) => (r as { name: string }[])[0]?.name === renamed,
      { label: 'community renamed', timeoutMs: 20_000 },
    );
  });
});
