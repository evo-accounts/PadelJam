import { beforeAll, describe, it } from 'vitest';
import { query, snapshot } from '../driver/a11y';
import { tap, typeText, clearText } from '../driver/actions';
import { expectVisible, expectGone } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { dismissSavePasswordSheetIfPresent, loginAs, passWelcomeIfPresent } from '../driver/flows';
import { resetDb } from '../fixtures/seed';
import { latestOtp } from '../fixtures/mailpit';
import { PERSONAS, TEST_PHONE, TEST_PHONE_OTP } from '../fixtures/personas';

describe('01 auth', () => {
  beforeAll(async () => {
    await resetDb('minimal');
    await freshInstall(); // signed-out, first-install state → welcome
  });

  it('welcome carousel shows real copy and proceeds', async () => {
    // Regression for the raw-i18n-key bug: assert real copy, not key names.
    await expectVisible({ text: 'Find your game' }, { timeout: 30_000 });
    await expectGone({ text: 'welcomeTitle1' }, { timeout: 1_000 }).catch(() => {
      throw new Error('Welcome screen is rendering raw i18n keys (welcomeTitle1)');
    });
    await tap({ text: /start now/i });
    await expectVisible({ label: 'Login or Sign Up' });
  });

  it('rejects a non-E.164 phone identifier', async () => {
    await typeText({ type: 'TextField' }, '912345678');
    await tap({ label: 'Continue', type: 'Button' });
    // Auth screens show only the generic banner for anything that isn't a known,
    // safe-to-name code/network/rate-limit problem (UX-GLOB-06) — never the raw
    // server message.
    await expectVisible({ text: /something isn't right/i }, { timeout: 3_000 });
    await clearText({ type: 'TextField' }, 12);
  });

  it('phone OTP happy path with the test number', async () => {
    await typeText({ type: 'TextField' }, TEST_PHONE);
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /confirm if it/i });
    await typeText({ type: 'TextField' }, TEST_PHONE_OTP);
    await tap({ label: 'Verify', type: 'Button' });
    // Brand-new OTP user with no profile → create-account screen.
    await expectVisible({ text: /full name|create/i }, { timeout: 30_000 });
  });

  it('create-account blocks submit until terms accepted, then completes', async () => {
    const secondaryEmail = 'e2e-new@padeljam.test';
    await expectVisible({ text: /complete your account/i });
    await typeText({ text: /your name/i, type: 'TextField' }, 'Test E2E User');
    await typeText({ text: /name@example\.com/i, type: 'TextField' }, secondaryEmail);
    await typeText({ type: 'TextField', nth: 2 }, 'e2ePass1234');
    // Terms unchecked → submit must not navigate.
    await tap({ label: 'Create account', type: 'Button' });
    await expectVisible({ text: /complete your account/i }); // still on the form
    // Tap the checkbox square (left edge) — the row's text contains tappable links.
    const checkbox = await expectVisible({ text: /i agree to the terms/i });
    await tap({ x: checkbox.frame.x + 14, y: checkbox.frame.y + checkbox.frame.height / 2 });
    const submittedAt = Date.now();
    await tap({ label: 'Create account', type: 'Button' });
    // With local confirmations disabled the change can apply instantly (app jumps straight
    // to onboarding) or briefly show the verify phase — handle both without racing.
    const deadline = Date.now() + 60_000;
    let done = false;
    while (Date.now() < deadline && !done) {
      // signInWithPassword inside the flow can trigger the system Save Password sheet.
      await dismissSavePasswordSheetIfPresent();
      const tree = await snapshot();
      if (query(tree, { text: /where do you play/i })) {
        done = true;
        break;
      }
      const verify = query(tree, { text: /verify your email/i });
      const field = query(tree, { type: 'TextField' });
      if (verify && field) {
        const code = await latestOtp(secondaryEmail, submittedAt);
        // Re-check we are still on the verify phase before typing (it can self-dismiss).
        if (query(await snapshot(), { text: /verify your email/i })) {
          await typeText({ type: 'TextField' }, code).catch(() => {});
          // The Verify pressable surfaces as GenericElement, not Button — match by label only.
          await tap({ label: 'Verify' }).catch(() => {});
        }
      }
      await new Promise((r) => setTimeout(r, 600));
    }
    if (!done) await expectVisible({ text: /where do you play/i }, { timeout: 5_000 });
  });

  it('wrong OTP shows an error and resend shows a cooldown', async () => {
    await freshInstall();
    await passWelcomeIfPresent();
    const sentAt = Date.now();
    await typeText({ type: 'TextField' }, PERSONAS.maria.email);
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /confirm if it/i });
    await typeText({ type: 'TextField' }, '000000');
    await tap({ label: 'Verify', type: 'Button' });
    // The banner (UX-GLOB-06) replaces the inline error text and is only in the
    // tree for 4s (auto-dismiss), so check it promptly with a short timeout.
    await expectVisible({ text: /invalid or expired code/i }, { timeout: 3_000 });
    await expectVisible({ text: /resend in \d+/i });
    // Recover with the real code so the suite leaves a clean state.
    const code = await latestOtp(PERSONAS.maria.email, sentAt);
    await clearText({ type: 'TextField' }, 8);
    await typeText({ type: 'TextField' }, code);
    await tap({ label: 'Verify' });
    // A bounce back to sign-in here is a regression of the StreamChatProvider
    // subtree-remount bug — fail rather than retry (see flows.loginAs).
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 2500));
    if (query(await snapshot(), { label: 'Login or Sign Up' })) {
      throw new Error(
        'post-OTP bounce to sign-in after wrong-code recovery — StreamChatProvider remount regression',
      );
    }
  });

  it('email OTP happy path via Mailpit', async () => {
    await freshInstall();
    await loginAs('alex');
    await expectVisible({ text: 'Home', type: 'Heading' });
  });

  it('social sign-in buttons render', async () => {
    await freshInstall();
    await passWelcomeIfPresent();
    await expectVisible({ text: /continue with google/i });
    await expectVisible({ text: /sign in with apple/i });
  });
});
