import { beforeAll, describe, it } from 'vitest';
import { scrollUntilVisible, tap, toggleSwitch, typeText } from '../driver/actions';
import { expectGone, expectVisible } from '../driver/expect';
import { freshInstall, relaunch } from '../driver/app';
import { deepLink, dismissSavePasswordSheetIfPresent, loginAs, tabTo } from '../driver/flows';
import { psql, select } from '../fixtures/db';
import { pollUntil } from '../fixtures/poll';
import { manifest, resetDb } from '../fixtures/seed';
import { PASSWORD, PERSONAS } from '../fixtures/personas';

describe('12 profile & settings', () => {
  beforeAll(async () => {
    await resetDb('full');
    await freshInstall();
    await loginAs('maria');
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  it('self profile renders with name and counts', async () => {
    await tabTo('Profile');
    await expectVisible({ text: /maria santos/i });
    await expectVisible({ text: /follower/i });
  });

  /**
   * Was "edit profile persists a new bio", driven from an Edit button on the profile. UX-PROF-06
   * deleted both that button and the screen behind it — "there is no second place to edit the same
   * data" — so this now goes where the data lives, Account Settings (UX-SET-02).
   *
   * Deep-linked rather than navigated through Settings on purpose: the Settings hub is rebuilt
   * later in this plan, and a test that walks its rows would break again for a reason that has
   * nothing to do with whether the description saves.
   */
  it('account settings persists a new bio', async () => {
    await deepLink('mobile:///profile/account', /account settings/i);
    await expectVisible({ id: 'account-bio' }, { timeout: 15_000 });
    await typeText({ id: 'account-bio' }, ' Loves tie-breaks.');
    // The save button is pinned below the form, so it needs no scrolling — but the keyboard is
    // over it until something dismisses that.
    await scrollUntilVisible({ id: 'account-save' }, { maxSwipes: 6 });
    await tap({ id: 'account-save' });
    await pollUntil(
      () => select('profiles', `email=eq.${PERSONAS.maria.email}&select=description`),
      (rows) => ((rows as { description: string }[])[0]?.description ?? '').includes('Loves tie-breaks'),
      { label: 'bio persisted' },
    );
  });

  it('other profile supports follow and unfollow', async () => {
    const m = manifest();
    await deepLink(`mobile:///profile/${m.users.joao}`);
    await expectVisible({ text: /joão pereira/i }, { timeout: 20_000 });
    await tap({ text: /^follow$/i });
    await pollUntil(
      () => select('follows', `follower_id=eq.${m.users.maria}&followee_id=eq.${m.users.joao}&select=follower_id`),
      (rows) => (rows as unknown[]).length === 1,
      { label: 'follow row created' },
    );
    await tap({ text: /^following$/i });
    await pollUntil(
      () => select('follows', `follower_id=eq.${m.users.maria}&followee_id=eq.${m.users.joao}&select=follower_id`),
      (rows) => (rows as unknown[]).length === 0,
      { label: 'follow row removed' },
    );
  });

  /**
   * Selected by ID, not by text, and deep-linked rather than walked through Settings.
   *
   * Both were near misses. `{ text: /notifications/i }` with no type and no `nth` takes the FIRST
   * match in tree order, and UX-SET-01 puts a "Notifications" group HEADING above the
   * "Notifications" row — a heading is StaticText, so tapping it is a silent no-op and the suite
   * fails fifteen seconds later on `/push/i`, pointing at the wrong thing. And
   * `{ type: 'CheckBox', nth: 0 }` names a position rather than a control: it survived UX-SET-04
   * adding a description line under each label only because descriptions are Text, not CheckBox.
   * Neither selector was wrong yet. Both were one screen change away from it.
   */
  it('notification preference toggle persists', async () => {
    await deepLink('mobile:///profile/notifications', /^Notifications$/);
    await expectVisible({ id: 'setting-notifications_push' }, { timeout: 15_000 });
    await toggleSwitch({ id: 'setting-notifications_push' });
    const m = manifest();
    await pollUntil(
      () => select('user_settings', `user_id=eq.${m.users.maria}&select=notifications_push`),
      (rows) => (rows as { notifications_push: boolean }[])[0]?.notifications_push === false,
      { label: 'push pref persisted false' },
    );
  });

  /**
   * The Change Password row, for an account that HAS a password and for one that does not.
   *
   * The row used to be unconditional, and the screen behind it requires the current password and
   * verifies it with signInWithPassword. For an account with no password that call can only ever
   * fail, so a Google or Apple sign-up was told their password was wrong forever, with no way
   * forward and no explanation — and the one mechanism that could have given them a password
   * (setPassword, via recovery) is itself gated behind the "Try another way" sheet offering a
   * password row, which requires has_password to already be true.
   *
   * There is no seeded passwordless persona to test the second half with, and there cannot easily
   * be one: every seeded persona ends up WITH a password, which is also the only way this suite
   * can sign one in. (Since migration 0101 the seed gets there in TWO admin calls — create, then
   * set — because only the UPDATE is recorded; a one-step create is an INSERT, which `0101`'s
   * trigger deliberately ignores.) So the password is taken away from maria UNDERNEATH the live
   * session, which is exactly the state a social sign-up is in from its first day. The access
   * token is already issued, so the session survives it; blanking `encrypted_password` is an
   * UPDATE, so the trigger fires and DELETES her `auth_password_set` row, and the view flips
   * immediately.
   *
   * The test then puts it back by USING the feature — typing the seeded password into the create
   * form — so maria is left exactly as she was found, for whatever runs after this suite.
   */
  it('the password row names the screen it opens, with and without a password', async () => {
    // Reads what the APP reads. Before migration 0101 this asked auth.users for
    // `coalesce(encrypted_password,'') <> ''`, which is the inference 0101 exists to
    // replace — GoTrue writes a 60-character placeholder there for every OTP user, so
    // it answered true for people with no password at all. It happens to agree with the
    // new source throughout this test; asserting on the deprecated one anyway would be
    // testing a definition the product no longer uses.
    const hasPasswordSql =
      `select exists (select 1 from auth_password_set s join auth.users u on u.id = s.user_id where u.email = '${PERSONAS.maria.email}')`;

    /**
     * Both deep links below wait for the SETTINGS screen, not for the row's label.
     *
     * `deepLink(url, expect)` verifies arrival by matching TEXT, and "Change password" / "Create
     * password" appear on two different screens: the settings row, and the password screen the row
     * opens. When a relaunch restored the app onto that password screen, the match succeeded
     * instantly and deepLink returned having never navigated — its own re-issue loop defeated by
     * the ambiguity. The test then sailed past two more text assertions (both equally ambiguous)
     * and failed fifteen seconds later on `settings-password-row`, pointing at the wrong thing.
     *
     * Waiting for the screen title and then asserting the ROW BY ID makes a navigation failure say
     * so immediately, and keeps the label assertions meaningful.
     *
     * The screen is PRIVACY, not Settings: UX-SET-07 moved the password row there, out of the
     * loose "Conta" group it shared with the email and account deletion. The row kept its testID,
     * so everything below this is unchanged.
     */
    // 1) WITH a password: unchanged behaviour, and the screen still asks for the current one.
    await deepLink('mobile:///profile/privacy', /^Privacy$/);
    await expectVisible({ id: 'settings-password-row' }, { timeout: 20_000 });
    await expectVisible({ text: /change password/i }, { timeout: 20_000 });
    await expectGone({ text: /create password/i }, { timeout: 2_000 });
    await tap({ id: 'settings-password-row' });
    await expectVisible({ id: 'current-password-input' }, { timeout: 15_000 });

    // 2) WITHOUT one. relaunch() rather than a re-navigation: the row is labelled off a React
    //    Query result that nothing in the app would invalidate for a change made in the database.
    await psql(`update auth.users set encrypted_password = '' where email = '${PERSONAS.maria.email}'`);
    await relaunch();
    await deepLink('mobile:///profile/privacy', /^Privacy$/);
    await expectVisible({ id: 'settings-password-row' }, { timeout: 30_000 });
    await expectVisible({ text: /create password/i }, { timeout: 30_000 });
    await expectGone({ text: /^change password$/i }, { timeout: 2_000 });

    await tap({ id: 'settings-password-row' });
    await expectVisible({ id: 'new-password-input' }, { timeout: 15_000 });
    // THE DEAD END, asserted directly: there is no current-password box to fail against.
    await expectGone({ id: 'current-password-input' }, { timeout: 2_000 });
    // Matched on the copy: the help paragraph is a plain Text, which iOS surfaces as a
    // StaticText with no AXUniqueId, so there is no id to select it by.
    await expectVisible({ text: /does not have a password yet/i });
    // The screen NAMES what it is doing, in the heading and on the button.
    await expectVisible({ text: 'Create password', type: 'Heading' });
    await expectVisible({ id: 'change-password-submit', text: /create password/i });

    // 3) Setting a first password works, on the live session, with no current one asked for.
    await typeText({ id: 'new-password-input' }, PASSWORD);
    await typeText({ id: 'repeat-password-input' }, PASSWORD);
    await tap({ id: 'change-password-submit' });
    await dismissSavePasswordSheetIfPresent();
    await pollUntil(
      () => psql(hasPasswordSql),
      (out) => out.trim() === 't',
      { label: 'the passwordless account now has a password', timeoutMs: 20_000 },
    );

    // And the row follows: the screen invalidates the query, so settings relabels without a
    // relaunch. This is the half a database assertion alone would miss.
    await expectVisible({ text: /change password/i }, { timeout: 20_000 });
  });

  /**
   * The form moved to /profile/support/contact — /profile/support is the four-row hub now
   * (UX-SET-12).
   *
   * The old guard would NOT have caught that. It deep-linked blind and then asserted
   * `{ text: /support|contact/i }`, which the HUB satisfies twice over: its title is "Support" and
   * one of its rows is "Contact support". The test would have sailed past the check and failed
   * three lines later on a missing text field, reporting the wrong thing. The `expect` argument to
   * `deepLink` exists for exactly this — it retries the open URL until the screen renders — so it
   * is used here rather than asserting separately afterwards.
   *
   * The fields are selected by ID now. They were selected by AX element type only because the
   * screen carried no testIDs at all; it has them as of this PR.
   */
  it('support ticket submits', async () => {
    const m = manifest();
    await deepLink('mobile:///profile/support/contact', /contact support/i);
    await typeText({ id: 'support-title' }, 'E2E ticket');
    await typeText({ id: 'support-description' }, 'Automated support ticket from the E2E suite.');
    await tap({ id: 'support-send' });
    await pollUntil(
      () => select('support_tickets', `user_id=eq.${m.users.maria}&select=id`),
      (rows) => (rows as unknown[]).length > 0,
      { label: 'support ticket row' },
    );
  });
});
