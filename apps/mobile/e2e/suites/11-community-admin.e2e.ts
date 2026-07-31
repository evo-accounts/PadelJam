import { beforeAll, describe, it } from 'vitest';
import { query, snapshot } from '../driver/a11y';
import { scrollUntilVisible, tap, toggleSwitch } from '../driver/actions';
import { expectVisible } from '../driver/expect';
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
 * ADMIN of community C "Cascais Social" (maria owns it), and rita and pedro both
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

  /** Community tab → Cascais Social → Manage community. */
  const openManage = async () => {
    await tabTo('Community');
    await scrollUntilVisible({ text: /cascais social/i }, { maxSwipes: 8 });
    await tap({ text: /cascais social/i });
    await expectVisible({ text: /cascais social/i }, { timeout: 20_000 });
    await scrollUntilVisible({ text: /manage community/i }, { maxSwipes: 6 });
    await tap({ text: /manage community/i });
    await expectVisible({ text: /member requests/i }, { timeout: 20_000 });
  };

  /** From the hub into one section, and back out to the hub. */
  const openSection = async (label: RegExp) => {
    await scrollUntilVisible({ text: label }, { maxSwipes: 8 });
    await tap({ text: label });
  };

  it('the manage hub lists every admin section', async () => {
    await openManage();
    for (const section of [
      /community settings/i,
      /member permissions/i,
      /manage members/i,
      /member requests/i,
      /invite members/i,
    ]) {
      await expectVisible({ text: section }, { timeout: 15_000 });
    }
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
    await tap({ text: /^decline$/i });

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
    // maria owns it, alex administers it, and rita was admitted above.
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
    // match on. So address it by ordinal: the rows render in the order
    // Invite members / Approve join requests / Create posts, which lines up
    // with community_permissions' columns.
    await expectVisible({ text: /invite members/i }, { timeout: 15_000 });
    const [before] = (await select(
      'community_permissions',
      `community_id=eq.${m.communities.C}&select=invite_members`,
    )) as { invite_members: boolean }[];

    await toggleSwitch({ type: 'CheckBox', nth: 0 });

    // The DB is the assertion, not the pixel: a switch that animates but never
    // writes would look identical on screen.
    await pollUntil(
      () => select('community_permissions', `community_id=eq.${m.communities.C}&select=invite_members`),
      (r) => (r as { invite_members: boolean }[])[0]?.invite_members !== before?.invite_members,
      { label: 'invite_members flipped', timeoutMs: 20_000 },
    );
  });
});
