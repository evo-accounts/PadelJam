import { beforeAll, describe, expect, it } from 'vitest';
import { tap, typeText } from '../driver/actions';
import { expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { loginAs, tapAlertButton } from '../driver/flows';
import { resetDb } from '../fixtures/seed';
import { select } from '../fixtures/db';
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
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /dominant hand/i }, { timeout: 30_000 });
    const rows = await select(`profiles`, `email=eq.${PERSONAS.omar.email}&select=location_text`);
    expect((rows as { location_text: string | null }[])[0]?.location_text).toBeTruthy();
  });

  it('hand and side selections persist', async () => {
    await tap({ label: 'Right', type: 'Button' });
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /preferred side/i });
    await tap({ label: 'Left', type: 'Button' });
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /enable notifications/i });
    const rows = await select(`profiles`, `email=eq.${PERSONAS.omar.email}&select=dominant_hand,court_side`);
    const p = (rows as { dominant_hand: string; court_side: string }[])[0];
    expect(p?.dominant_hand).toBe('right');
    expect(p?.court_side).toBe('left');
  });

  it('notifications permission alert is answerable and flow proceeds', async () => {
    await tap({ text: /enable notifications/i, type: 'Button' });
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
