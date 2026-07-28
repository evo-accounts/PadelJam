import { beforeAll, describe, it } from 'vitest';
import { scrollUntilVisible, tap, toggleSwitch, typeText } from '../driver/actions';
import { expectGone, expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { deepLink, loginAs, tabTo } from '../driver/flows';
import { select } from '../fixtures/db';
import { pollUntil } from '../fixtures/poll';
import { manifest, resetDb } from '../fixtures/seed';
import { PERSONAS } from '../fixtures/personas';

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
