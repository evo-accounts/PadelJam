import { beforeAll, describe, it } from 'vitest';
import { query, snapshot } from '../driver/a11y';
import { dismissKeyboard, tap, typeText, clearText } from '../driver/actions';
import { expectVisible, expectGone } from '../driver/expect';
import { freshInstall, relaunch } from '../driver/app';
import {
  dismissSavePasswordSheetIfPresent,
  dismissStrongPasswordSheetIfPresent,
  loginAs,
  passWelcomeIfPresent,
  switchToEmailMode,
  tapCheckbox,
} from '../driver/flows';
import { resetDb } from '../fixtures/seed';
import { latestOtp } from '../fixtures/mailpit';
import { PASSWORD, PERSONAS } from '../fixtures/personas';

const NEW_EMAIL = 'e2e-new@padeljam.test';

describe('01 auth', () => {
  beforeAll(async () => {
    await resetDb('minimal');
    await freshInstall(); // signed-out, first-install state → welcome
  });

  it('welcome shows real copy and both buttons, and Get started proceeds', async () => {
    // Regression for the raw-i18n-key bug: assert real copy, not key names.
    await expectVisible({ text: 'Find games near you' }, { timeout: 30_000 });
    await expectGone({ text: 'welcomeTitle1' }, { timeout: 1_000 }).catch(() => {
      throw new Error('Welcome screen is rendering raw i18n keys (welcomeTitle1)');
    });
    // Two buttons, matched by EXACT label. That also covers the raw-key bug for
    // them (a rendered 'getStarted' / 'signIn' can never equal the English label)
    // and keeps "Sign in" clear of the "Sign in with password" row further on.
    await expectVisible({ label: 'Get started' });
    await expectVisible({ label: 'Sign in' });
    // UX-AUTH-01: consent moved OFF this screen and onto sign-in, where the
    // sign-in methods it refers to actually are.
    await expectGone({ text: /by continuing, you agree/i }, { timeout: 1_000 });
    await tap({ id: 'welcome-start' });
    await expectVisible({ label: 'Login or Sign Up' });
    await expectVisible({ text: /by continuing, you agree/i });
    await expectVisible({ id: 'sign-in-email' });
  });

  /**
   * "Sign in" on welcome is not a different screen from "Get started": both go
   * to the combined Login or Sign Up screen, because there is no separate
   * returning-user screen and create-account needs a live session. The sign-in
   * fingerprint here (heading, consent line, email field) is the same
   * three things the test above asserts after Get started, so if either button
   * is ever pointed somewhere else, one of the two fails.
   *
   * Its own fresh install, because the test above spent hasSeenWelcome. It also
   * hands the next test the same state that one would have: signed out, on
   * sign-in, nothing typed.
   */
  it('Sign in on welcome lands on the same screen as Get started', async () => {
    await freshInstall();
    await expectVisible({ label: 'Sign in' }, { timeout: 30_000 });
    await tap({ id: 'welcome-signin' });
    await expectVisible({ label: 'Login or Sign Up' });
    await expectVisible({ text: /by continuing, you agree/i });
    await expectVisible({ id: 'sign-in-email' });
  });

  /**
   * Phone sign-in is hidden for launch (PAD-137): no phone input, no channel
   * swap. Also leaves the screen as the next test expects it.
   */
  it('sign-in offers email only: no phone input and no "Continue with phone"', async () => {
    await expectVisible({ id: 'sign-in-email' });
    await expectGone({ id: 'sign-in-phone' }, { timeout: 2_000 });
    await expectGone({ id: 'sign-in-phone-country' }, { timeout: 2_000 });
    await expectGone({ text: /continue with phone/i }, { timeout: 2_000 });
    await expectGone({ text: /continue with email/i }, { timeout: 2_000 });
  });

  it('a phone number typed into the email field is rejected and nothing is sent', async () => {
    await typeText({ id: 'sign-in-email' }, '912345678');
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /missing information/i }, { timeout: 3_000 });
    await expectGone({ text: /confirm if it/i }, { timeout: 2_000 });
    await clearText({ id: 'sign-in-email' }, 9);
  });

  /** A brand-new email, by code: no profile yet, so it lands on create-account. */
  it('email OTP sign-up with a new address reaches create-account', async () => {
    const sentAt = Date.now();
    await typeText({ id: 'sign-in-email' }, NEW_EMAIL);
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /confirm if it/i });
    const code = await latestOtp(NEW_EMAIL, sentAt);
    await typeText({ type: 'TextField' }, code);
    await tap({ label: 'Verify', type: 'Button' });
    await expectVisible({ text: /complete your account/i }, { timeout: 30_000 });
  });

  /**
   * UX-AUTH-05. Two things the old version of this test could not say:
   *
   *   - THE SUBMIT IS DISABLED, not merely validated. The screen used to accept
   *     the press and answer with a "Missing information" banner; it is now
   *     inert until every required field is filled and the box is ticked. The
   *     ABSENCE of that banner after a press is what distinguishes the two —
   *     `el.enabled` cannot, because this app reports `enabled: false` for
   *     controls that work perfectly well (see the note in driver/actions.tap).
   *   - THE CHECKBOX IS TAPPED ON ITS SQUARE, and the tick is verified. It used
   *     to be tapped at `x + 14` from the label's left edge, because the row's
   *     text is a sentence with two tappable links in it and the hand-rolled
   *     square had no testID. It is the `Checkbox` primitive now, and the
   *     sentence is no longer inside it, so the id names the square and
   *     `tapCheckbox` simply taps the element and asserts the tick flipped.
   *   - THE TWO LINKS ARE REACHABLE. That is the point of the split, and the
   *     part no amount of "the box toggles" proves: while the sentence was the
   *     checkbox's label, iOS aggregated the Pressable and its descendants into
   *     ONE accessibility element and VoiceOver could open neither document the
   *     user was being asked to accept. Asserted against the tree directly,
   *     below, because a passing tap says nothing about it.
   */
  it('create-account blocks submit until terms accepted, then completes', async () => {
    await expectVisible({ text: /complete your account/i });

    // Nothing filled: the press must do NOTHING — not even complain.
    await tap({ label: 'Create account', type: 'Button' });
    await expectVisible({ text: /complete your account/i });
    await expectGone({ text: /missing information/i }, { timeout: 2_000 }).catch(() => {
      throw new Error('Create account is still validating on press — UX-AUTH-05 asks for it to be disabled');
    });

    await typeText({ id: 'create-account-name' }, 'Test E2E User');
    // The account is verified by email, so there is no second-identifier field at all.
    await expectGone({ id: 'create-account-phone' }, { timeout: 1_000 });
    await expectGone({ id: 'create-account-email' }, { timeout: 1_000 });
    // iOS raises its "Use Strong Password?" AutoFill sheet the first time this
    // field is focused — this screen has the sign-up shape the heuristic looks
    // for (an `autoComplete="email"` field directly above a secure one), which
    // the recovery screen's two PasswordFields do not. The sheet takes the
    // keyboard, so exactly ONE character lands and the field sits at a single
    // '•' until typeText gives up. Decline it first; iOS does not re-offer.
    //
    // This is what the earlier `{type:'TextField', nth:2}` selector was working
    // around, and the note it carried ("a secure field selected by id reports a
    // single '•' regardless of length") was a misreading of that symptom: with
    // the sheet gone, the testID resolves to the field and reports the full
    // nine-bullet mask.
    await dismissStrongPasswordSheetIfPresent({ id: 'password-input' });
    await typeText({ id: 'password-input' }, PASSWORD);

    // Every field filled, terms unticked → still inert, still silent.
    await tap({ label: 'Create account', type: 'Button' });
    await expectVisible({ text: /complete your account/i });
    await expectGone({ text: /missing information/i }, { timeout: 2_000 });

    // THE A11Y ASSERTION, and the reason this change exists.
    //
    // "Terms of Use" and "Privacy Policy" must each be their OWN element in the
    // tree. Matched on the WHOLE label (trimmed), not a substring: the checkbox
    // announces the entire sentence and so does the paragraph beside it, so a
    // substring match would be satisfied by exactly the merged row this is meant
    // to rule out. While the sentence lived inside the checkbox's Pressable, iOS
    // collapsed all three into one element and this found nothing.
    {
      const tree = await snapshot();
      const box = query(tree, { id: 'create-account-terms' });
      if (!box) throw new Error('create-account: no element carries the terms checkbox testID');
      const exactly = (label: string) => tree.filter((el) => (el.AXLabel ?? '').trim() === label);
      const links: Record<string, { frame: { x: number; y: number; width: number } }> = {};
      for (const label of ['Terms of Use', 'Privacy Policy']) {
        const [link] = exactly(label);
        if (!link) {
          throw new Error(
            `create-account: "${label}" is not its own accessibility element — the consent `
            + 'sentence has been put back inside the checkbox Pressable, and VoiceOver cannot '
            + 'open a document the user is being asked to accept',
          );
        }
        if (link.frame.x === box.frame.x && link.frame.y === box.frame.y) {
          throw new Error(`create-account: "${label}" reports the checkbox's own frame — they are one element`);
        }
        links[label] = link;
      }
      // Distinct from EACH OTHER too, not one merged span carrying both names.
      const terms = links['Terms of Use']!.frame;
      const privacy = links['Privacy Policy']!.frame;
      if (terms.x === privacy.x && terms.y === privacy.y) {
        throw new Error('create-account: the two terms links share one frame — they are one element');
      }
      // Print what was measured. When this assertion regresses the useful question
      // is "what shape is the tree in NOW", and reconstructing that from a
      // screenshot afterwards is guesswork.
      const box0 = box.frame;
      console.log(
        '[e2e] create-account consent row: '
        + `checkbox x=${Math.round(box0.x)} w=${Math.round(box0.width)} h=${Math.round(box0.height)} `
        + `"${box.AXLabel}" | Terms x=${Math.round(terms.x)} w=${Math.round(terms.width)} `
        + `| Privacy x=${Math.round(privacy.x)} w=${Math.round(privacy.width)}`,
      );
      // And the checkbox is the SQUARE, not a row spanning the sentence. The old
      // shape measured x=20..382, which is what made tap({id}) open Safari.
      if (box.frame.width > 60) {
        throw new Error(
          `create-account: the terms checkbox spans ${Math.round(box.frame.width)}pt — it should be `
          + 'the 22pt square alone, with the sentence beside it',
        );
      }
      // It still says WHAT is being agreed to: it has no label text to borrow now.
      if (!/terms of use/i.test(box.AXLabel ?? '')) {
        throw new Error(
          `create-account: the terms checkbox announces itself as "${box.AXLabel}" — it must name the documents`,
        );
      }
    }

    // Put the keyboard away before the last two controls, because the terms row is
    // CLIPPED BY ITS SCROLLER while it is up — a different thing from being behind
    // the keyboard, and invisible to the driver.
    //
    // Measured: keyboard up, the submit button is pinned outside the scroller at
    // y=522, so the ScrollView's own bottom edge is y=510 (its paddingTop above the
    // button). The terms checkbox lays out at y=508..530, so TWO of its 22 points
    // are inside the clip. iOS reports the full 22pt frame regardless, tap() sees an
    // element comfortably inside the 874pt viewport, and the touch at its centre
    // (y=519) lands 9pt into the footer's padding, where nothing handles it.
    // tapCheckbox retried three times and reported the box "stuck at unchecked".
    //
    // The driver cannot see this: an element's frame says nothing about which
    // ancestor clips it, and visibleTapPoint only knows the viewport. Scrolling
    // would work too — the content has 44pt of slack — but dismissing is what
    // actually happens when someone finishes typing a password, and it leaves the
    // whole form visible rather than a specific scroll offset the next assertion
    // would have to assume.
    await dismissKeyboard();
    // `tap({id})` would be safe now, but tapCheckbox also asserts the box flipped —
    // a tap that lands mid-transition is swallowed without a word.
    await tapCheckbox({ id: 'create-account-terms' });
    await tap({ label: 'Create account', type: 'Button' });
    // No verify phase any more: a successful submit goes straight to onboarding.
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      // signInWithPassword inside the flow can trigger the system Save Password sheet.
      await dismissSavePasswordSheetIfPresent();
      if (query(await snapshot(), { text: /share your location/i })) break;
      await new Promise((r) => setTimeout(r, 600));
    }
    await expectVisible({ text: /share your location/i }, { timeout: 5_000 });

    /**
     * THE CONSENT RECORD. The box above was ticked, so the account must carry a timestamp
     * saying so.
     *
     * This is asserted here and nowhere else because here is the only place in the product
     * where consent is actually GIVEN — a checkbox, gating a submit. `terms_accepted_at` used
     * to be written by exactly one function, provision-social-profile, for social sign-ups who
     * never tick anything: the only accounts with a consent record were the only ones that
     * never affirmatively consented, and this screen's own function wrote nothing at all.
     *
     */
    // NOT asserted here: that `terms_accepted_at` was recorded. It cannot be.
    // The local edge runtime mounts the MAIN CHECKOUT's functions directory
    // (`docker inspect supabase_edge_runtime_padeljam` shows the bind), and the
    // CI step that brings the stack up is a documented no-op when it is already
    // running — which on this self-hosted runner is always. So every run, local
    // or CI, exercises whatever complete-account happens to be on disk in the
    // main checkout, never the branch under test. A green assertion here would
    // mean nothing and a red one would mean nothing either.
    //
    // The consent write is covered where it can be honestly verified:
    // `_shared/profileRow.test.ts` (unit, runs in CI via `pnpm test:functions`)
    // and `infra/supabase/tests/complete-account-consent.test.mjs`, which is a
    // real negative control — it fails with the exact defect message against an
    // unfixed function — and takes a COMPLETE_ACCOUNT_URL override so it can be
    // pointed at a directly-served copy.
  });

  /**
   * UX-AUTH-03. Three things at once, because they share one wrong code:
   *
   *   - the resend sits ABOVE Verify now. It used to be underneath the CTA,
   *     which is the last place someone whose code never arrived looks. Frames,
   *     because the accessibility tree carries no other notion of order.
   *   - the boxes go into their error state and STAY there. The banner and the
   *     field carry the identical string on purpose (UX-GLOB-06), so outliving
   *     the banner's 4s auto-dismiss is the only thing that distinguishes them
   *     — and the surviving message is the one rendered by `CodeField`, i.e.
   *     the same `error` prop that reddens all six borders.
   *   - the field CLEARS. No `clearText` below: the screen doing it is the
   *     assertion, and a backspace loop would hide a regression completely.
   */
  it('wrong OTP reddens and clears the boxes, with the resend above Verify', async () => {
    await freshInstall();
    await passWelcomeIfPresent();
    await switchToEmailMode();
    const sentAt = Date.now();
    await typeText({ type: 'TextField' }, PERSONAS.maria.email);
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /confirm if it/i });

    // The cooldown is already running — sign-in sent the first code.
    const resendEl = await expectVisible({ text: /resend in \d+/i });
    const verifyEl = await expectVisible({ label: 'Verify', type: 'Button' });
    if (resendEl.frame.y >= verifyEl.frame.y) {
      throw new Error(
        `the resend (y=${resendEl.frame.y}) must sit above Verify (y=${verifyEl.frame.y}) — UX-AUTH-03`,
      );
    }

    await typeText({ type: 'TextField' }, '000000');
    // `type: 'Button'` again: Verify is a real `Button` now, not the hand-rolled
    // Pressable that surfaced as a GenericElement.
    await tap({ label: 'Verify', type: 'Button' });
    // The banner is only in the tree for 4s, so check it promptly.
    await expectVisible({ text: /invalid or expired code/i }, { timeout: 3_000 });

    // Past the banner's window: what is left is the FIELD's own error state.
    await new Promise((r) => setTimeout(r, 5_000));
    await expectVisible({ text: /invalid or expired code/i }, { timeout: 3_000 });

    const cleared = query(await snapshot(), { type: 'TextField' });
    if (cleared?.AXValue) {
      throw new Error(
        `the code field kept "${cleared.AXValue}" after a rejected code — it must clear and refocus`,
      );
    }

    // Recover with the real code so the suite leaves a clean state.
    const code = await latestOtp(PERSONAS.maria.email, sentAt);
    await typeText({ type: 'TextField' }, code);
    await tap({ label: 'Verify', type: 'Button' });
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

  /**
   * UX-AUTH-04. The sheet used to be four hard-coded rows shown to everybody —
   * password, a different identifier, Google, Apple — so three of the four were
   * usually dead ends you only discovered after tapping one. It is derived from
   * `auth_methods_for` now.
   *
   * SOFIA, and not one of the others, for two reasons. Every seeded persona is
   * created through `adminCreateUser(email, phone, password)` and none of them
   * has a social identity (infra/seed/seed-e2e.mjs), so signing in with an
   * EMAIL makes the expected list exactly password — SMS is never offered while phone
   * sign-in is hidden (PAD-137), though she has a phone on file. And she is used nowhere else in
   * this file (maria, alex and carla are), so her identifier still has all five
   * of the lookups migration 0096 allows per quarter hour — this test cannot be
   * the one that trips the rate limit, and a rate-limited lookup is
   * indistinguishable from an empty one by design.
   */
  it('Try another way lists only this account’s methods', async () => {
    const persona = PERSONAS.sofia;
    await freshInstall();
    await passWelcomeIfPresent();
    await switchToEmailMode();
    await typeText({ type: 'TextField' }, persona.email);
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /confirm if it/i }, { timeout: 20_000 });
    await tap({ text: /try another way/i });

    // Wait for the sheet to finish presenting before asserting anything else —
    // see the note in the recovery test about tapping into a moving sheet.
    await expectVisible({ text: /sign in with password/i }, { timeout: 15_000 });
    // She has a phone on file, but SMS is not a method at launch.
    await expectGone({ text: /get a code via sms/i }, { timeout: 3_000 });

    // Neither the raw number nor its mask may reach the screen.
    await expectGone({ text: persona.phone }, { timeout: 2_000 });
    await expectGone({ text: /0004/ }, { timeout: 2_000 });

    // The half that matters. This account has no Google and no Apple identity,
    // so neither may be offered — and a provider is NEVER inferred from the
    // address. The email row is absent too: it is the method already in use.
    await expectGone({ text: /continue with google/i }, { timeout: 3_000 });
    await expectGone({ text: /continue with apple/i }, { timeout: 3_000 });
    await expectGone({ text: /get a code by email/i }, { timeout: 3_000 });

    // The escape hatch stays, below the methods rather than among them.
    await expectVisible({ text: /use a different email/i });
  });

  /**
   * UX-AUTH-04, the other half: the empty state is REQUIRED, not a fallback.
   *
   * An identifier with no account behind it returns all-false from
   * `auth_methods_for` — byte-for-byte what an account whose only method is the
   * one in use returns, which is the point (no account-existence oracle). The
   * sheet must therefore never open empty: it says this is the only way in and
   * offers to start again.
   *
   * `signInWithOtp` creates the unknown user as it sends, so WHICH of those two
   * cases this lands in depends on ordering — and sign-in resolves the lookup
   * before it sends precisely so this is always the first one. Fire them
   * together and the send wins often enough to flake: the sheet then describes
   * an account one second old, password row and all.
   */
  it('an identifier with no account gets the only-way-in state, not an empty sheet', async () => {
    await freshInstall();
    await passWelcomeIfPresent();
    await switchToEmailMode();
    await typeText({ type: 'TextField' }, 'e2e-nobody@padeljam.test');
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /confirm if it/i }, { timeout: 20_000 });
    await tap({ text: /try another way/i });

    await expectVisible({ text: /this is the only way in/i }, { timeout: 15_000 });
    await expectVisible({ text: /only way to sign in to this account/i });
    // No rows at all — not one of the four the old sheet always showed.
    await expectGone({ text: /sign in with password/i }, { timeout: 3_000 });
    await expectGone({ text: /continue with google/i }, { timeout: 3_000 });
    await expectGone({ text: /get a code via sms/i }, { timeout: 3_000 });

    // And the way out actually works.
    await tap({ text: /use a different email/i });
    await expectVisible({ label: 'Login or Sign Up' }, { timeout: 20_000 });
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
  });

  /**
   * sign-in -> OTP -> "Try another way" -> "Sign in with password".
   *
   * Local rather than in driver/flows.ts: the password screen is reached from
   * exactly one place and only this suite goes there. `switchToEmailMode()` is
   * the shared helper, as everywhere else.
   */
  const goToPasswordScreen = async (email: string): Promise<void> => {
    await freshInstall();
    await passWelcomeIfPresent();
    await switchToEmailMode();
    await typeText({ type: 'TextField' }, email);
    await tap({ label: 'Continue', type: 'Button' });
    await expectVisible({ text: /confirm if it/i }, { timeout: 20_000 });
    await tap({ text: /try another way/i });
    // Wait for the sheet to finish presenting before tapping a row: tapping
    // into one that is still animating up lands on whatever occupies those
    // coordinates mid-flight — here that is "Use a different email or phone",
    // which replaces to sign-in and strands the test.
    await expectVisible({ text: /sign in with password/i }, { timeout: 15_000 });
    await tap({ text: /sign in with password/i });
    await expectVisible({ text: /enter your password/i }, { timeout: 15_000 });
  };

  /**
   * UX-AUTH-06, the layout half.
   *
   * The screen shipped with `t('otpHelp')` under its title — "We sent a code to
   * …" on a screen that sends no code — and with "Forgot password?" as a
   * full-width ghost link STACKED UNDER the primary action, where it read as a
   * second call to action of equal weight. Placement is asserted by comparing
   * frames, the way the resend-above-Verify assertion does: the accessibility
   * tree carries no other notion of order or alignment.
   */
  it('the password screen explains itself and puts Forgot password below the input, right-aligned', async () => {
    await goToPasswordScreen(PERSONAS.dora.email);

    await expectVisible({ text: /signing in as/i });
    await expectGone({ text: /we sent a code to/i }, { timeout: 3_000 }).catch(() => {
      throw new Error('the password screen is still rendering otpHelp — it sends no code (UX-AUTH-06)');
    });

    const tree = await snapshot();
    const input = query(tree, { id: 'password-input' });
    const forgot = query(tree, { id: 'password-forgot' });
    const cta = query(tree, { id: 'password-continue' });
    if (!input || !forgot || !cta) {
      throw new Error(
        `password screen is missing a control: input=${!!input} forgot=${!!forgot} continue=${!!cta}`,
      );
    }

    // DIRECTLY BELOW THE INPUT, and above the primary action.
    if (forgot.frame.y < input.frame.y + input.frame.height - 2) {
      throw new Error(
        `"Forgot password?" (y=${forgot.frame.y}) must sit below the password input `
        + `(which ends at y=${input.frame.y + input.frame.height}) — UX-AUTH-06`,
      );
    }
    if (forgot.frame.y >= cta.frame.y) {
      throw new Error(
        `"Forgot password?" (y=${forgot.frame.y}) must sit above Continue (y=${cta.frame.y}) — UX-AUTH-06`,
      );
    }

    // RIGHT-ALIGNED. Continue is full-width, so its frame IS the content
    // column: the link's right edge must meet it, and its left edge must start
    // past the middle rather than stretching the whole way across.
    const contentRight = cta.frame.x + cta.frame.width;
    const forgotRight = forgot.frame.x + forgot.frame.width;
    if (Math.abs(contentRight - forgotRight) > 4) {
      throw new Error(
        `"Forgot password?" must be right-aligned: its right edge is ${forgotRight}, `
        + `the content column ends at ${contentRight} — UX-AUTH-06`,
      );
    }
    if (forgot.frame.x <= cta.frame.x + cta.frame.width / 2) {
      throw new Error(
        `"Forgot password?" stretches across the column (x=${forgot.frame.x}, width=${forgot.frame.width}) `
        + 'instead of hugging the right edge — UX-AUTH-06',
      );
    }
  });

  /**
   * UX-AUTH-06, the "Try another way" half.
   *
   * It used to call `router.back()`, which is "go back", not "try another way":
   * the user is returned to the code screen they deliberately left and offered
   * nothing. It opens `TryAnotherWaySheet` with `inUse: 'password'` now.
   *
   * THE ROWS ARE THE FINGERPRINT. The OTP screen's sheet for an email sign-in
   * (inUse: 'email') offers password and never "get a code by email"; this one
   * offers email and never password. So an email row with no password row can
   * only be THIS screen's sheet — and `router.back()` would
   * have shown no sheet at all, just the code screen.
   */
  it('Try another way on the password screen opens the sheet instead of going back', async () => {
    await goToPasswordScreen(PERSONAS.omar.email);
    await tap({ id: 'password-try-another-way' });

    // The row the OTP screen's sheet cannot show.
    await expectVisible({ text: /get a code by email/i }, { timeout: 15_000 });
    // The method already in use is never listed, and neither is SMS.
    await expectGone({ text: /sign in with password/i }, { timeout: 3_000 });
    await expectGone({ text: /get a code via sms/i }, { timeout: 3_000 });
    await expectVisible({ text: /use a different email/i });

    // And the way out works, leaving the suite somewhere known.
    await tap({ text: /use a different email/i });
    await expectVisible({ label: 'Login or Sign Up' }, { timeout: 20_000 });
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
  }, 300_000); // ~20 typing steps: ~205s measured on a loaded host, past the 180s default.
});
