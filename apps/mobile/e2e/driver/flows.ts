import { snapshot, query, describeSelector, type Selector } from './a11y';
import { scrollUntilVisible, tap, typeText } from './actions';
import { captureFailure, expectVisible, waitFor } from './expect';
import { latestOtp } from '../fixtures/mailpit';
import { PERSONAS, type PersonaKey } from '../fixtures/personas';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait past the splash for either the welcome screen or the sign-in screen;
 * tap through welcome when present. Ends on sign-in.
 */
export async function passWelcomeIfPresent(): Promise<void> {
  const el = await waitFor({ text: /Start now|Login or Sign Up/i }, { timeout: 30_000 });
  if (/start now/i.test(el.AXLabel ?? '')) {
    await tap({ text: /start ?now/i });
    await expectVisible({ label: 'Login or Sign Up' });
  }
}

/**
 * Sign in as a seeded persona via email OTP (works for every persona; codes read from Mailpit).
 * Expects to start on welcome or sign-in. Ends past auth (tabs or onboarding).
 *
 * A bounce back to sign-in after a successful verify is a regression of the
 * StreamChatProvider tree-shape remount (fixed at root: the provider's wrapper
 * no longer changes with auth state) — fail immediately so it cannot hide as
 * a retried-away flake.
 */
export async function loginAs(key: PersonaKey): Promise<void> {
  const persona = PERSONAS[key];
  await passWelcomeIfPresent();
  await expectVisible({ label: 'Login or Sign Up' });
  await switchToEmailMode();
  const sentAt = Date.now();
  await typeText({ type: 'TextField' }, persona.email);
  await tap({ label: 'Continue', type: 'Button' });
  await expectVisible({ text: /confirm if it/i }, { timeout: 20_000 });
  const code = await latestOtp(persona.email, sentAt);
  await typeText({ type: 'TextField' }, code);
  await tap({ label: 'Verify' });
  const landed = await waitFor(
    { text: /Home|Where do you play|Dominant hand|Preferred side|Jammer\+|Login or Sign Up/ },
    { timeout: 30_000 },
  );
  let bounced = /login or sign up/i.test(landed.AXLabel ?? '');
  if (!bounced) {
    // The historical bounce fired shortly AFTER a brief successful landing — verify stability.
    await sleep(2500);
    bounced = Boolean(query(await snapshot(), { label: 'Login or Sign Up' }));
  }
  if (bounced) {
    const reason =
      `loginAs: bounced to sign-in after a successful OTP verify for ${persona.email} — `
      + 'regression of the StreamChatProvider subtree-remount bug; fix the app, do not add retries here';
    // Capture BEFORE throwing. This used to throw bare, so the one failure mode
    // that most needs a screenshot and a gateway log produced neither — and
    // sign-in happens in beforeAll, where it is least attributable.
    const dir = await captureFailure(reason).catch(() => null);
    throw new Error(dir ? `${reason}\nartifacts: ${dir}` : reason);
  }
}

/**
 * Sign-in opens in PHONE mode (UX-AUTH-02), so every email login has to flip the
 * input first. The toggle is the third outline button, labelled "Continue with
 * email"; tapping it swaps the phone row for an email `Field` and relabels
 * itself "Continue with phone".
 *
 * Waiting on the RELABELLED toggle rather than on `{ type: 'TextField' }` is the
 * robust check: phone mode has a TextField too, so a type-only selector matches
 * before the swap and the persona's email would be typed into the phone box.
 * No-op when the screen is already in email mode.
 */
export async function switchToEmailMode(): Promise<void> {
  if (query(await snapshot(), { text: /continue with phone/i })) return;
  await tap({ text: /continue with email/i });
  await expectVisible({ text: /continue with phone/i }, { timeout: 10_000 });
  await expectVisible({ text: /name@example\.com/i, type: 'TextField' }, { timeout: 10_000 });
}

/** Switch to a bottom tab (labels look like "Events, tab, 2 of 5"). */
export async function tabTo(name: 'Home' | 'Events' | 'Explore' | 'Community' | 'Profile'): Promise<void> {
  await ensureTabs();
  await tap({ text: new RegExp(`^${name}, tab`) });
  await sleep(600);
}

/**
 * Home → one of the Find quick actions, which lands on Explore in search mode with that tab
 * chosen and the input focused (UX-HOME-01, D11). Ends with the keyboard up: a swipe dismisses
 * it (the list uses `on-drag`), and a tap on a row goes through (`handled`).
 *
 * This is how a test reaches an event it is NOT part of — the Events tab lists only your own.
 */
export async function findFromHome(action: 'findEvent' | 'findGroup' | 'findCommunity'): Promise<void> {
  await tabTo('Home');
  const quick = { id: `home-quick-${action}` };
  await scrollUntilVisible(quick, { direction: 'down', maxSwipes: 4 });
  await tap(quick);
  await expectVisible({ id: 'explore-search-cancel' }, { timeout: 15_000 });
}

/**
 * Pop pushed screens until the tab bar is visible.
 *
 * The back gesture swipes from the left edge across the content area, so any
 * screen whose body is a PAGER (the community [id]/(home) top tabs) consumes
 * it and the stack never pops. Fall back to relaunching — the SecureStore
 * session survives, so boot routing lands back on Home — and THROW if the tab
 * bar is still unreachable. Returning silently here made a later `tabTo` fail
 * with an unrelated-looking timeout, which cost a long debugging detour.
 */
export async function ensureTabs(maxPops = 4): Promise<void> {
  const { backGesture } = await import('./actions');
  const onTabs = async () => !!query(await snapshot(), { text: /, tab, \d of 5/ });
  for (let i = 0; i < maxPops; i++) {
    if (await onTabs()) return;
    await backGesture();
  }
  if (await onTabs()) return;
  // Pager screens eat the edge swipe; relaunch is the reliable escape.
  const { relaunch } = await import('./app');
  await relaunch();
  await sleep(2000);
  if (await onTabs()) return;
  const { captureFailure } = await import('./expect');
  const dir = await captureFailure('ensureTabs could not reach the tab bar (pops exhausted, relaunch did not land on tabs)');
  throw new Error(`ensureTabs failed to reach the tab bar\nartifacts: ${dir}`);
}

/** Log out via Profile tab → settings → Log out. Ends on the sign-in screen. */
export async function logout(): Promise<void> {
  await tabTo('Profile');
  await sleep(800);
  // By LABEL, not by text: the gear moved from the profile body into the TopBar (UX-PROF-01
  // rebuilt the body, UX-PROF-06 owns the header), and a TopBar action is an icon button with no
  // text. The old text-first selector with a label fallback cost a wasted snapshot on every one of
  // the seven suites that reach this through `switchUser`.
  await tap({ label: 'Settings' });
  await scrollUntilVisible({ text: /log out/i });
  await tap({ text: /log out/i });
  // Possible confirm alert.
  await sleep(800);
  const tree = await snapshot();
  const confirm = query(tree, { text: /log out/i, type: 'Button', nth: 0 });
  if (confirm) await tap({ text: /log out/i, type: 'Button' });
  await expectVisible({ label: 'Login or Sign Up' }, { timeout: 20_000 });
}

export async function switchUser(key: PersonaKey): Promise<void> {
  await logout();
  await loginAs(key);
}

/** From the location onboarding step, skip everything through the paywall to reach tabs. */
export async function completeOnboardingBySkipping(): Promise<void> {
  for (const step of [/Where do you play/, /Dominant hand/, /Preferred side/, /Enable Notifications/]) {
    await expectVisible({ text: step });
    await tap({ label: 'Skip' });
    await sleep(600);
  }
  await expectVisible({ text: /Jammer\+/ });
  await tap({ text: /continue with free/i });
  await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
}

/** Tap a button on a system alert (springboard) by its label. */
export async function tapAlertButton(label: string | RegExp): Promise<void> {
  await tap({ text: label, type: 'Button' }, { timeout: 10_000 });
}

/**
 * Open a mobile:// deep link. simctl openurl raises a springboard "Open in
 * PadelJam?" confirmation whose buttons are invisible to the app AX tree —
 * detect the empty tree and blind-tap "Open" (fixed position on this device).
 */
export async function deepLink(url: string, expect?: RegExp): Promise<void> {
  const { openUrl } = await import('./sim'); // throws OpenUrlUnavailableError when SpringBoard degrades
  for (let attempt = 0; attempt < 3; attempt++) {
    await openUrl(url);
    await sleep(1500);
    // Dismiss the springboard confirmation if it appeared (empty app AX tree).
    for (let i = 0; i < 3; i++) {
      if ((await snapshot()).length > 1) break;
      await tap({ x: 275, y: 473 }); // "Open"
      await sleep(1200);
    }
    if (!expect) return;
    // A warm app already showing another screen sometimes ignores the first
    // openurl — verify the target rendered, else re-issue the link.
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      if (query(await snapshot(), { text: expect })) return;
      await sleep(500);
    }
    console.warn(`[e2e] deepLink(${url}) did not render ${expect} — re-issuing (attempt ${attempt + 1})`);
  }
  throw new Error(`deepLink failed: ${url} never rendered ${expect}`);
}

/**
 * Tap a `Checkbox` and prove the box actually flipped.
 *
 * THE GEOMETRY THIS USED TO CARRY IS GONE, and deliberately so. It aimed at a
 * DERIVED point — the element's leading edge plus half the 22pt square —
 * because create-account's checkbox wrapped its consent sentence: the testID
 * named a row spanning x=20..382 whose centre (x=201) was the "Terms of Use"
 * link, so `tap({id})` left the app for Safari and the test failed much later
 * against padeljam.app/terms with a message about onboarding. Worse, iOS
 * aggregated that row into ONE accessibility element, so nothing in a snapshot
 * hinted the centre was unsafe.
 *
 * That is fixed at the source rather than worked around here: the links are
 * SIBLINGS of the box now (see the consent row in create-account.tsx), so a
 * `Checkbox`'s Pressable is either the square alone or the square plus a plain
 * string, and in both cases its centre is safe to tap. Re-deriving a leading-edge
 * point would now be the fragile option — it assumes an internal layout this
 * helper cannot see.
 *
 * What survives is the half that was always worth a helper: the assertion that
 * the checked state CHANGED. A tap that lands mid-transition is swallowed in
 * silence, which is the failure shape this driver keeps being bitten by.
 */
export async function tapCheckbox(sel: Selector, opts: { attempts?: number } = {}): Promise<void> {
  const el = await waitFor(sel);
  // "checkbox, unchecked" / "checkbox, checked" — compared, not parsed, so this
  // survives iOS rewording it.
  const before = el.AXValue;
  const attempts = opts.attempts ?? 3;
  for (let i = 0; i < attempts; i++) {
    await tap(sel);
    await sleep(900);
    if (query(await snapshot(), sel)?.AXValue !== before) return;
  }
  const reason =
    `tapCheckbox did not flip ${describeSelector(sel)} (stuck at "${before}") — `
    + 'the tap was swallowed, or something tappable has been put back inside the box\'s Pressable';
  const dir = await captureFailure(reason);
  throw new Error(`${reason}\nartifacts: ${dir}`);
}

/**
 * iOS's "Use Strong Password?" AutoFill sheet — the OTHER system password
 * overlay, and not the same thing as "Save Password?" below.
 *
 * iOS raises it the FIRST time a secure field becomes first responder on a
 * screen it reads as a sign-up form (an identifier field carrying a username-ish
 * `textContentType` — which `Field`'s `autoComplete="email"` supplies — directly
 * above a secure one). create-account is exactly that shape; new-password.tsx,
 * which has no identifier field, is not, which is why only one screen needs this.
 *
 * It steals the keyboard. MEASURED on create-account: with the sheet up, the
 * first typed character reaches the field and every subsequent one is swallowed,
 * so the field sits at a single '•' forever and typeText's mask check exhausts
 * its retries. That is real character loss, not an AX mis-report — the app's own
 * four-rule checklist (rendered from React state) confirms nine characters land
 * once the sheet is gone.
 *
 * TWO THINGS MAKE IT AWKWARD TO HANDLE, both worth knowing before "simplifying"
 * this:
 *
 *   - it is presented by ANOTHER PROCESS, so it never appears in the app's own
 *     accessibility tree and its close button cannot be tapped by selector. Hence
 *     the blind tap, the same concession `dismissSavePasswordSheetIfPresent` and
 *     `deepLink` already make for springboard overlays.
 *   - it is MODAL, so every app element it covers drops out of the tree. That is
 *     the detection signal used here, and it is specific: the KEYBOARD does not
 *     do this (measured — with the keyboard up, create-account still reports its
 *     "Create account" button at y=616), so a shrinking tree means an overlay,
 *     not merely a raised keyboard.
 *
 * Declining once settles it for the rest of the app session: iOS does not
 * re-offer for that field, so the caller's own focus tap afterwards is safe.
 */
const STRONG_PASSWORD_SHEET_CLOSE = { x: 365, y: 506 };

/**
 * How much of the APP is on screen, ignoring the keyboard.
 *
 * The bare snapshot().length counts keyboard keys — about 34 of them — so it
 * moves far more when the keyboard toggles than when a sheet covers the app,
 * and the "did part of the app disappear?" test below was really measuring the
 * keyboard. Observed on create-account: 57 elements with the keyboard up, 21
 * with it down and the ENTIRE screen visible, which the helper read as an
 * AutoFill sheet that was never there.
 */
const appElementCount = async (): Promise<number> =>
  (await snapshot()).filter((e) => !e.traits?.includes('KeyboardKey')).length;

export async function dismissStrongPasswordSheetIfPresent(field: Selector): Promise<boolean> {
  const before = await appElementCount();
  await tap(field);
  await sleep(1200);
  if ((await appElementCount()) >= before) return false;

  // Tap close MORE THAN ONCE before giving up. A single tap was enough locally
  // and failed on the CI runner (run 34838209655): the captured screenshot shows
  // the sheet still up with its close button exactly under the tap point, which
  // means the coordinates were right and the sheet was simply still animating in
  // when the touch landed. A tap into a presenting overlay is swallowed — the
  // same failure the `settleFrame` comment in actions.ts describes for the app's
  // own views. Under CI load that window is wider than one fixed sleep.
  let after = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    await tap(STRONG_PASSWORD_SHEET_CLOSE);
    await sleep(1200);
    after = await appElementCount();
    if (after >= before) return true;
  }
  if (after < before) {
    // Do NOT return quietly and let the caller type into a sheet that is still
    // up: that is the silent-wrong-success shape this driver keeps being bitten
    // by, and it resurfaces 40s later as an unrelated-looking typeText timeout.
    const reason =
      `dismissStrongPasswordSheetIfPresent: focusing ${describeSelector(field)} hid part of the app `
      + `(${before} elements -> ${after}) and the close tap at `
      + `(${STRONG_PASSWORD_SHEET_CLOSE.x}, ${STRONG_PASSWORD_SHEET_CLOSE.y}), tapped 4 times, did not `
      + 'bring it back — the AutoFill sheet is probably still up, or has moved on this device';
    const dir = await captureFailure(reason);
    throw new Error(`${reason}\nartifacts: ${dir}`);
  }
  return true;
}

/**
 * The iOS "Save Password?" AutoFill sheet (after signInWithPassword) is a
 * system overlay that leaves the app's AX tree EMPTY. It cannot be queried —
 * detect the empty tree and blind-tap "Not Now" (fixed position on this device).
 */
export async function dismissSavePasswordSheetIfPresent(): Promise<boolean> {
  const tree = await snapshot();
  if (tree.length > 1) return false;
  await tap({ x: 126, y: 546 }); // "Not Now"
  await sleep(1200);
  return true;
}
