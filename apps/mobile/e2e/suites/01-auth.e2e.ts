import { beforeAll, describe, it } from 'vitest';
import { query, snapshot } from '../driver/a11y';
import { tap, typeText, clearText } from '../driver/actions';
import { expectVisible, expectGone } from '../driver/expect';
import { freshInstall, relaunch } from '../driver/app';
import { dismissSavePasswordSheetIfPresent, loginAs, passWelcomeIfPresent, switchToEmailMode } from '../driver/flows';
import { resetDb } from '../fixtures/seed';
import { latestOtp } from '../fixtures/mailpit';
import { PASSWORD, PERSONAS, TEST_PHONE_NATIONAL, TEST_PHONE_OTP } from '../fixtures/personas';

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
    // UX-AUTH-01: consent moved OFF this screen and onto sign-in, where the
    // sign-in methods it refers to actually are.
    await expectGone({ text: /by continuing, you agree/i }, { timeout: 1_000 });
    await tap({ text: /start now/i });
    await expectVisible({ label: 'Login or Sign Up' });
    await expectVisible({ text: /by continuing, you agree/i });
  });

  /**
   * Was "rejects a non-E.164 phone identifier", typing `912345678` and expecting
   * a failure. With the country selector that number is a perfectly VALID
   * Portuguese mobile — it is what the happy path below now types — so the old
   * test asserted the opposite of the intended behaviour. What is still worth
   * pinning is that an IMPOSSIBLE number is caught client-side, before a
   * rate-limit slot is spent, and that it is reported in both places UX-GLOB-06
   * requires.
   */
  it('rejects a phone number that cannot be valid', async () => {
    await typeText({ type: 'TextField' }, '12');
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /enter a valid phone number/i }, { timeout: 3_000 });
    // The banner auto-dismisses after 4s; the FIELD's own error message must
    // not. Re-asserting after that window is what distinguishes the two, since
    // both carry the identical string on purpose.
    await new Promise((r) => setTimeout(r, 5_000));
    await expectVisible({ text: /enter a valid phone number/i }, { timeout: 3_000 });
    await clearText({ type: 'TextField' }, 4);
  });

  it('phone OTP happy path with the test number', async () => {
    /**
     * Pick Portugal first. `PhoneField` starts on the DEVICE region, and the
     * simulator is launched with `-AppleLocale en_US` (driver/app.ts), so it
     * opens on 🇺🇸 +1 — where a nine-digit number is not valid. Searching by DIAL
     * CODE rather than by name on purpose: country names come from
     * `Intl.DisplayNames`, which Hermes is not guaranteed to ship, and the row is
     * then tapped by its ISO testID rather than by the label it rendered.
     */
    await tap({ id: 'sign-in-phone-country' });
    await expectVisible({ text: /search countries/i }, { timeout: 10_000 });
    await typeText({ id: 'sign-in-phone-country-search' }, '351');
    await tap({ id: 'sign-in-phone-country-PT' });
    await expectGone({ text: /search countries/i }, { timeout: 10_000 });

    // National digits, not '+351…': the selector now holds the country and
    // PhoneField assembles the E.164 itself.
    await typeText({ type: 'TextField' }, TEST_PHONE_NATIONAL);
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
    await typeText({ type: 'TextField', nth: 2 }, PASSWORD);
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
    await switchToEmailMode();
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
    // The native Apple button is now AppleAuthenticationButtonType.CONTINUE, so
    // it renders "Continue with Apple" — it used to be SIGN_IN.
    await expectVisible({ text: /continue with apple/i });
    // The third outline button is the phone/email toggle, not a provider.
    await expectVisible({ text: /continue with email/i });
  });

  /**
   * UX-AUTH-02: the third button swaps the INPUT and relabels itself. It is the
   * only way to reach email sign-in now that phone is the default, so every
   * email-based suite depends on it (driver/flows.ts `switchToEmailMode`).
   */
  it('the third button toggles between phone and email input', async () => {
    await expectVisible({ text: /continue with email/i });
    await tap({ text: /continue with email/i });
    await expectVisible({ text: /name@example\.com/i, type: 'TextField' }, { timeout: 10_000 });
    await expectVisible({ text: /continue with phone/i });
    await expectGone({ text: /continue with email/i }, { timeout: 3_000 });

    // And back: the email box goes away and the toggle reads "Continue with email" again.
    await tap({ text: /continue with phone/i });
    await expectGone({ text: /name@example\.com/i, type: 'TextField' }, { timeout: 10_000 });
    await expectVisible({ text: /continue with email/i });
  });

  /**
   * Password recovery, end to end (UX-AUTH-07/08/09).
   *
   * The assertion that matters is the LAST one. Verifying a recovery code
   * establishes a real session — that is what authorises the password update —
   * and this flow used to finish by routing into it, so a recovery ended with
   * the user signed in. Tapping through to sign-in proves nothing about that on
   * its own: the screen simply replaced itself, and a live session would still
   * be sitting in the keychain.
   *
   * `relaunch()`, NOT `freshInstall()`. A reinstall wipes SecureStore and the
   * keychain, so it would land on sign-in whether or not the session was torn
   * down — the test would pass with the bug fully present. Terminating and
   * relaunching the SAME install is the only thing that re-runs Boot against
   * the persisted session.
   */
  it('password recovery ends at a confirmation and leaves no session behind', async () => {
    const persona = PERSONAS.carla;
    const newPassword = 'Recover9#';

    await freshInstall();
    await passWelcomeIfPresent();
    await switchToEmailMode();

    // sign-in -> OTP -> "Try another way" -> password -> "Forgot password?"
    await typeText({ type: 'TextField' }, persona.email);
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /confirm if it/i }, { timeout: 20_000 });
    await tap({ text: /try another way/i });
    // Wait for the sheet to finish presenting before tapping a row. Tapping into
    // a sheet that is still animating up lands on whatever occupies those
    // coordinates mid-flight — here that was the row below, "Use a different
    // email or phone", which replaces to sign-in and stranded the whole test.
    await expectVisible({ text: /sign in with password/i }, { timeout: 10_000 });
    await tap({ text: /sign in with password/i });
    await expectVisible({ text: /enter your password/i }, { timeout: 15_000 });
    // The recovery screen sends its own code on mount — start the clock here so
    // Mailpit cannot hand back the sign-in code from a moment ago.
    const sentAt = Date.now();
    await tap({ text: /forgot password/i });

    await expectVisible({ text: /password recovery/i }, { timeout: 20_000 });
    // UX-AUTH-07: the resend is on this screen, below the code boxes, and
    // starts in its cooldown state because the code has just been sent.
    await expectVisible({ text: /resend in \d+/i }, { timeout: 20_000 });

    // A wrong code reddens the field AND banners (UX-GLOB-06), and clears the
    // boxes so the next attempt does not start with six digits to delete.
    await typeText({ type: 'TextField' }, '000000');
    await tap({ label: 'Continue', type: 'Button' });
    // The banner auto-dismisses after 4s — check it promptly.
    await expectVisible({ text: /invalid or expired code/i }, { timeout: 5_000 });
    const cleared = query(await snapshot(), { type: 'TextField' });
    if (cleared?.AXValue) {
      throw new Error(`recovery code field kept "${cleared.AXValue}" after a rejected code — it must clear and refocus`);
    }

    const code = await latestOtp(persona.email, sentAt);
    await typeText({ type: 'TextField' }, code);
    await tap({ label: 'Continue', type: 'Button' });

    // UX-AUTH-08. Two password inputs, the rules visible under the first.
    await expectVisible({ text: /new password/i }, { timeout: 30_000 });
    await expectVisible({ text: /minimum 8 characters/i });
    await typeText({ type: 'TextField', nth: 0 }, newPassword);
    await typeText({ type: 'TextField', nth: 1 }, 'Different9#');
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /passwords don't match/i }, { timeout: 5_000 });
    // The checklist must still be there while the field is in its error state.
    await expectVisible({ text: /minimum 8 characters/i });

    await clearText({ type: 'TextField', nth: 1 }, 16);
    await typeText({ type: 'TextField', nth: 1 }, newPassword);
    await tap({ label: 'Continue', type: 'Button' });

    // updateUser on a password field can raise the system "Save Password?"
    // sheet, which leaves the app's AX tree empty — clear it before asserting.
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      await dismissSavePasswordSheetIfPresent();
      if (query(await snapshot(), { text: /your password has been changed/i })) break;
      await new Promise((r) => setTimeout(r, 600));
    }

    // UX-AUTH-09: confirmation, with a description line and no way back.
    await expectVisible({ text: /your password has been changed/i }, { timeout: 10_000 });
    await expectVisible({ text: /you can now sign in with your new password/i });
    await expectGone({ label: 'Back' }, { timeout: 1_000 });

    await tap({ text: /back to login/i });
    await expectVisible({ label: 'Login or Sign Up' }, { timeout: 20_000 });

    // THE decisive assertion — see the docblock above.
    await relaunch();
    await expectVisible({ label: 'Login or Sign Up' }, { timeout: 30_000 });
    if (query(await snapshot(), { text: 'Home', type: 'Heading' })) {
      throw new Error(
        'password recovery left a live session: after terminate + relaunch the app booted into Home '
        + 'instead of sign-in (UX-AUTH-09 — recovery must not continue into a signed-in session)',
      );
    }
  });
});
