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

  it('edit profile persists a new bio', async () => {
    await tap({ text: /edit/i, type: 'Button' });
    await expectVisible({ text: 'Edit profile', type: 'Heading' }, { timeout: 15_000 });
    await typeText({ type: 'TextArea' }, ' Loves tie-breaks.');
    // Scrolling also dismisses the keyboard so the Save button is tappable.
    await scrollUntilVisible({ text: /save/i, type: 'Button' }, { maxSwipes: 6 });
    await tap({ text: /save/i, type: 'Button' });
    await expectGone({ text: 'Edit profile', type: 'Heading' }, { timeout: 20_000 });
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

  it('notification preference toggle persists', async () => {
    await tabTo('Profile');
    await tap({ text: /settings/i, type: 'Button' }).catch(() => tap({ label: 'Settings' }));
    await scrollUntilVisible({ text: /notifications/i });
    await tap({ text: /notifications/i });
    await expectVisible({ text: /push/i }, { timeout: 15_000 });
    // The switches surface as CheckBox elements; push is the first one.
    await toggleSwitch({ type: 'CheckBox', nth: 0 });
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

    // 1) WITH a password: unchanged behaviour, and the screen still asks for the current one.
    await deepLink('mobile:///profile/settings', /change password/i);
    await expectVisible({ text: /change password/i }, { timeout: 20_000 });
    await expectGone({ text: /create password/i }, { timeout: 2_000 });
    await tap({ id: 'settings-password-row' });
    await expectVisible({ id: 'current-password-input' }, { timeout: 15_000 });

    // 2) WITHOUT one. relaunch() rather than a re-navigation: the row is labelled off a React
    //    Query result that nothing in the app would invalidate for a change made in the database.
    await psql(`update auth.users set encrypted_password = '' where email = '${PERSONAS.maria.email}'`);
    await relaunch();
    await deepLink('mobile:///profile/settings', /create password/i);
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

  it('support ticket submits', async () => {
    const m = manifest();
    await deepLink('mobile:///profile/support');
    await expectVisible({ text: /support|contact/i }, { timeout: 20_000 });
    await typeText({ type: 'TextField' }, 'E2E ticket');
    await typeText({ type: 'TextArea' }, 'Automated support ticket from the E2E suite.');
    await tap({ text: /send|submit/i });
    await pollUntil(
      () => select('support_tickets', `user_id=eq.${m.users.maria}&select=id`),
      (rows) => (rows as unknown[]).length > 0,
      { label: 'support ticket row' },
    );
  });
});
