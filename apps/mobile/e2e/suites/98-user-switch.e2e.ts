import { beforeAll, describe, it } from 'vitest';
import { expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { loginAs, switchUser } from '../driver/flows';
import { resetDb } from '../fixtures/seed';

/**
 * Regression: logging out and signing in as a different user in the SAME app
 * session must not crash to the ErrorBoundary ("cannot add `postgres_changes`
 * callbacks for realtime:notifications…" — stale realtime channel reuse).
 */
describe('98 in-session user switch', () => {
  beforeAll(async () => {
    await resetDb('full');
    await freshInstall();
    await loginAs('alex'); // onboarded organizer → lands on tabs
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  it('switches to a second user without crashing', async () => {
    await switchUser('dora');
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });
});
