import { snapshot, query } from './a11y';
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

/** Switch to a bottom tab (labels look like "Events, tab, 2 of 5"). */
export async function tabTo(name: 'Home' | 'Events' | 'Explore' | 'Community' | 'Profile'): Promise<void> {
  await ensureTabs();
  await tap({ text: new RegExp(`^${name}, tab`) });
  await sleep(600);
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
  await tap({ text: /settings/i, type: 'Button' }).catch(async () => {
    // Fallback: gear button may expose only an icon label.
    await tap({ label: 'Settings' });
  });
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
