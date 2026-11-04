import { beforeAll, describe, expect, it } from 'vitest';
import { tap, typeText } from '../driver/actions';
import { expectVisible } from '../driver/expect';
import { freshInstall, relaunch } from '../driver/app';
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
    await expectVisible({ text: /share your location/i }, { timeout: 30_000 });
  });

  it('location Skip leaves it null and relaunch resumes there', async () => {
    await tap({ label: 'Skip' });
    await expectVisible({ text: /dominant hand/i }, { timeout: 30_000 });
    const rows = await select(`profiles`, `email=eq.${PERSONAS.omar.email}&select=location_text`);
    expect((rows as { location_text: string | null }[])[0]?.location_text).toBeNull();
    await relaunch();
    await expectVisible({ text: /share your location/i }, { timeout: 30_000 });
  });

  it('manual location entry persists', async () => {
    await tap({ label: 'Enter address manually' });
    await expectVisible({ text: /where do you play/i });
    await typeText({ id: 'location-search' }, 'Lisboa');
    // Continue is gated on a debounced, geocoded result (not just 3+ typed
    // characters) — see location.tsx's `primaryDisabled={!resolved || saving}`.
    // Tapping immediately after typeText races that debounce: the button is
    // still disabled, the tap is swallowed, and the screen never advances.
    // The first result card is preselected and its name always contains the
    // typed query (it falls back to the raw text), so wait for the card.
    await expectVisible({ id: 'location-result-0' }, { timeout: 10_000 });
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /what.s your level/i }, { timeout: 30_000 });
    const rows = await select(`profiles`, `email=eq.${PERSONAS.omar.email}&select=location_text`);
    expect((rows as { location_text: string | null }[])[0]?.location_text).toBeTruthy();
  });

  it('leaving level unanswered and relaunching resumes at level', async () => {
    await relaunch();
    await expectVisible({ text: /what.s your level/i }, { timeout: 30_000 });
    const rows = await select(`profiles`, `email=eq.${PERSONAS.omar.email}&select=level`);
    expect((rows as { level: number | null }[])[0]?.level).toBeNull();
  });

  it('level persists', async () => {
    await tap({ text: /intermediate/i });
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /dominant hand/i }, { timeout: 30_000 });
    const rows = await select(`profiles`, `email=eq.${PERSONAS.omar.email}&select=level`);
    expect((rows as { level: number | null }[])[0]?.level).toBe(3);
  });

  it('hand and side selections persist', async () => {
    await tap({ label: 'Right' });
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /preferred side/i });
    await tap({ label: 'Left' });
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
    await tap({ label: 'Continue with Free' });
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 30_000 });
    const rows = await select(`profiles`, `email=eq.${PERSONAS.omar.email}&select=onboarded_at`);
    expect((rows as { onboarded_at: string | null }[])[0]?.onboarded_at).toBeTruthy();
  });
});
