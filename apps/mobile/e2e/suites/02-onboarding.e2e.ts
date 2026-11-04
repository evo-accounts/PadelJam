import { beforeAll, describe, expect, it } from 'vitest';
import { tap, typeText } from '../driver/actions';
import { expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { loginAs, tapAlertButton } from '../driver/flows';
import { resetDb } from '../fixtures/seed';
import { psql, select } from '../fixtures/db';
import { PERSONAS } from '../fixtures/personas';

describe('02 onboarding', () => {
  beforeAll(async () => {
    await resetDb('full'); // omar is seeded not-onboarded
    await freshInstall();
    await loginAs('omar'); // post-verify routing must land on the first unanswered step
  });

  it('routes a not-onboarded user to the location step', async () => {
    await expectVisible({ text: /where do you play/i }, { timeout: 30_000 });
  });

  it('manual location entry persists', async () => {
    await tap({ text: /add location manually/i });
    await typeText({ type: 'TextField' }, 'Lisboa');
    // Continue is gated on a debounced, geocoded place (not just 3+ typed
    // characters) — see location.tsx's `primaryDisabled={!resolved || saving}`.
    // Tapping immediately after typeText races that debounce: the button is
    // still disabled, the tap is swallowed, and the screen never advances.
    // The resolved label always contains the typed query (it falls back to the
    // raw text when reverse-geocoding doesn't return a name), so wait for it —
    // as a StaticText, so this doesn't match the TextField's own value.
    await expectVisible({ text: /lisboa/i, type: 'StaticText' }, { timeout: 10_000 });
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /dominant hand/i }, { timeout: 30_000 });
    const rows = await select(`profiles`, `email=eq.${PERSONAS.omar.email}&select=location_text`);
    expect((rows as { location_text: string | null }[])[0]?.location_text).toBeTruthy();
  });

  it('hand and side selections persist', async () => {
    await tap({ label: 'Right' });
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /court side/i });
    await tap({ label: 'Left side' });
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /don.t miss a thing/i });
    const rows = await select(`profiles`, `email=eq.${PERSONAS.omar.email}&select=dominant_hand,court_side`);
    const p = (rows as { dominant_hand: string; court_side: string }[])[0];
    expect(p?.dominant_hand).toBe('right');
    expect(p?.court_side).toBe('left');
  });

  it('"Skip for now" stamps notifications_prompted_at and moves on', async () => {
    await tap({ label: 'Skip for now' });
    await expectVisible({ text: /Jammer\+/ }, { timeout: 30_000 });
    const rows = await select(`profiles`, `email=eq.${PERSONAS.omar.email}&select=notifications_prompted_at`);
    expect((rows as { notifications_prompted_at: string | null }[])[0]?.notifications_prompted_at).toBeTruthy();
    // Un-stamp and relaunch: onboarding resumes at the first unanswered step, which is notifications again.
    await psql(`update profiles set notifications_prompted_at = null where email = '${PERSONAS.omar.email}'`, { su: true });
    await freshInstall();
    await loginAs('omar');
    await expectVisible({ text: /don.t miss a thing/i }, { timeout: 30_000 });
  });

  it('notifications permission alert is answerable and flow proceeds', async () => {
    await tap({ label: 'Allow push notifications', type: 'Button' });
    await tapAlertButton(/allow/i);
    await expectVisible({ text: /Jammer\+/ }, { timeout: 30_000 });
  });

  it('paywall "continue free" marks the user onboarded and lands on tabs', async () => {
    await tap({ text: /continue with free/i });
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 30_000 });
    const rows = await select(`profiles`, `email=eq.${PERSONAS.omar.email}&select=onboarded_at`);
    expect((rows as { onboarded_at: string | null }[])[0]?.onboarded_at).toBeTruthy();
  });
});
