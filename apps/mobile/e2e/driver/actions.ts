import { snapshot, query, describeSelector, keyboardTop, type AxElement, type Selector } from './a11y';
import { idbKey, idbSwipe, idbTap, idbText } from './idb';
import { dismissCaptions } from './keyboardDismiss';
import { captureFailure, waitFor, type WaitOpts } from './expect';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** iPhone 17 Pro logical viewport, in device points. */
const SCREEN = { width: 402, height: 874 };

/**
 * Clamp an ABSOLUTE point into the tappable area.
 *
 * Only for caller-supplied coordinates (blind taps at system sheets, whose
 * controls are invisible to the app's AX tree). Element taps must NOT go through
 * this — see visibleTapPoint.
 */
function clampToScreen(x: number, y: number): { x: number; y: number } {
  const inset = 8;
  return {
    x: Math.min(Math.max(x, inset), SCREEN.width - inset),
    y: Math.min(Math.max(y, inset), SCREEN.height - inset),
  };
}

/**
 * Where to tap an element: the centre of the part actually ON SCREEN.
 *
 * Elements routinely report frames extending past the viewport — cards in
 * horizontal rails run off the right edge, and anything below the fold reports
 * its true document position. The old code clamped the frame's centre into the
 * viewport, which is only defensible when the element is partly visible: for a
 * "Save" button at y≈1300 it produced y=866, a coordinate belonging to a
 * DIFFERENT element. Measured on community manage/settings, that clamp landed
 * inside the Cover-image picker and opened the iOS photo library; the run then
 * failed 80s later against an empty AX tree with a message about something else.
 *
 * Intersecting with the viewport gets the rail case right too — the visible left
 * portion of an overflowing card — and makes "nothing is on screen" a distinct,
 * reportable state instead of a silently wrong tap.
 *
 * Returns null when the element is entirely off screen.
 */
function visibleTapPoint(el: AxElement): { x: number; y: number } | null {
  const { x, y, width, height } = el.frame;
  const x0 = Math.max(x, 0);
  const x1 = Math.min(x + width, SCREEN.width);
  const y0 = Math.max(y, 0);
  const y1 = Math.min(y + height, SCREEN.height);
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  // Keep the small inset off the edge-gesture zones, now that we know the point
  // is genuinely within the element.
  return clampToScreen((x0 + x1) / 2, (y0 + y1) / 2);
}

/**
 * The top of the app's tab bar, or null when the screen has none. Its buttons announce themselves
 * as "Events, tab, 2 of 5".
 *
 * A list row scrolled to just above the bottom edge sits BEHIND the tab bar: it is in the AX tree
 * at its layout position, but a tap at its centre lands on a tab. Measured on suite 04 (#248): one
 * more event on alex's Events tab put "Weekly Friday Social" at y≈785, the tap opened Explore, and
 * the test timed out waiting for the event page.
 */
const TAB_LABEL = /, tab, \d+ of \d+$/;
export function tabBarTop(tree: AxElement[]): number | null {
  const tops = tree.filter((e) => TAB_LABEL.test(e.AXLabel ?? '')).map((e) => e.frame.y);
  return tops.length > 0 ? Math.min(...tops) : null;
}

/**
 * Keep an element's tap point above the tab bar: the centre of the part of it that is above the
 * bar. An element entirely below the bar's top (a tab itself, or a sheet's button presented over
 * a tab screen) is left alone — there is no part of it above the bar to aim at.
 */
function aboveTabBar(p: { x: number; y: number }, el: AxElement, barTop: number | null): { x: number; y: number } {
  if (barTop == null || TAB_LABEL.test(el.AXLabel ?? '') || p.y < barTop) return p;
  const top = Math.max(el.frame.y, 0);
  if (barTop - top < 4) return p;
  return { x: p.x, y: (top + barTop) / 2 };
}

/**
 * The status-bar band (and the Dynamic Island within it) swallows touches
 * before they reach the app. An element whose centre falls there — e.g. a
 * banner pinned to the very top of a screen — must be tapped lower down, or
 * off to the side of the island.
 */
const STATUS_BAND = 60;
const ISLAND = { x0: 120, x1: 285 };
function avoidStatusBar(p: { x: number; y: number }, el?: { frame: { x: number; y: number; width: number; height: number } }) {
  if (p.y >= STATUS_BAND) return p;
  if (el) {
    const lower = el.frame.y + el.frame.height - 6;
    if (lower > p.y) return clampToScreen(p.x, lower);
  }
  if (p.x > ISLAND.x0 && p.x < ISLAND.x1) {
    return clampToScreen(el ? el.frame.x + 16 : 24, p.y);
  }
  return p;
}

/** Tap an element (waits for it first) or an absolute point in device points. */
/**
 * Get the software keyboard out of the way, returning true if it is gone.
 *
 * A control the keyboard covers is still in the accessibility tree at its
 * layout position, so a tap aimed there is delivered to the KEYBOARD and
 * silently does nothing — the flow then fails later, looking like the app
 * ignored the press. Measured on the create-event wizard: "Next" sits at y=784
 * with the keyboard's top edge at y=590, the tap lands on the keyboard, the
 * wizard never leaves step 9, and the test times out waiting for a step-10
 * button.
 *
 * Scrolling is not a fix. The buttons it affects — the wizard's Next, live
 * scoring's Save score, the invite sheet's confirm — are pinned to the bottom of
 * the screen, so no amount of scrolling moves them out from under the keyboard.
 *
 * Tapping a caption is what a person does, and it works because these screens
 * set keyboardShouldPersistTaps="handled": a tap no control handles falls
 * through and dismisses. WHICH caption is the whole difficulty — see
 * keyboardDismiss.ts, which is pure precisely so that choice is tested against
 * real captured trees rather than by driving a device into one state by hand.
 */
export async function dismissKeyboard(): Promise<boolean> {
  let tree = await snapshot();

  for (let attempt = 0; attempt < 3; attempt++) {
    const top = keyboardTop(tree);
    if (top == null) return true;

    const caption = dismissCaptions(tree, top)[attempt];
    if (!caption) return false;

    await idbTap(
      Math.round(caption.frame.x + caption.frame.width / 2),
      Math.round(caption.frame.y + caption.frame.height / 2),
    );
    await sleep(600);
    tree = await snapshot();
  }
  return keyboardTop(tree) == null;
}

export async function tap(target: Selector | { x: number; y: number }, opts?: WaitOpts): Promise<void> {
  if ('x' in target && 'y' in target && !('text' in target)) {
    const p = clampToScreen(target.x, target.y);
    await idbTap(p.x, p.y);
    return;
  }
  // NOT gated on el.enabled, though it is tempting: a gated "Continue" really
  // does report `{"type":"Button","enabled":false}`. But this app reports that
  // for controls that work perfectly well — refusing to tap disabled elements
  // broke 5 passing tests across suites 01/05/09 ("Create account" and the
  // create-wizard buttons), so the flag is unreliable in both directions and
  // cannot be used to decide whether a tap is worth delivering.
  let el = await waitFor(target as Selector, opts);
  let settled = await settleFrame(target as Selector, el);

  // If the keyboard covers the point we are about to tap, get rid of it and
  // re-measure: dismissing reflows the screen, so the old frame is stale.
  //
  // When dismissal FAILS, refuse rather than tap. dismissKeyboard() works by
  // tapping a caption, and a screen can have none to offer — the Invite members
  // screen is a search field, a list of people and a pinned button, with not one
  // piece of inert text on it. Tapping anyway delivered the touch to whatever
  // keyboard key occupies that coordinate: a letter was typed, the button was
  // never pressed, nothing reported an error, and the run failed 15s later
  // waiting for a sheet that was never asked to open. Four CI runs read that as
  // "the confirm sheet is missing". The tap point being behind the keyboard is
  // also, on a real device, exactly the thing a user cannot reach — so this
  // failing loudly is how the product defect gets found instead of papered over.
  const kbd = keyboardTop(await snapshot());
  if (kbd != null && settled.frame.y + settled.frame.height / 2 >= kbd) {
    if (await dismissKeyboard()) {
      el = await waitFor(target as Selector, opts);
      settled = await settleFrame(target as Selector, el);
    } else {
      const { y, height } = settled.frame;
      const reason =
        `tap target sits behind the software keyboard and it could not be dismissed: `
        + `${describeSelector(target as Selector)} at y=${Math.round(y)}..${Math.round(y + height)}, `
        + `keyboard top y=${Math.round(kbd)}. No caption on this screen is safe to tap to dismiss. `
        + 'Tapping anyway would press a keyboard key. If a real user would be just as stuck, the '
        + 'screen needs to lift its controls above the keyboard (KeyboardAvoidingView).';
      const dir = await captureFailure(reason);
      throw new Error(`${reason}\nartifacts: ${dir}`);
    }
  }

  const visible = visibleTapPoint(settled);
  if (!visible) {
    const { x, y, width, height } = settled.frame;
    const reason =
      `tap target is entirely off screen: ${describeSelector(target as Selector)} at `
      + `x=${Math.round(x)}..${Math.round(x + width)}, y=${Math.round(y)}..${Math.round(y + height)} `
      + `(viewport ${SCREEN.width}x${SCREEN.height}). Scroll it into view first — `
      + 'tapping anyway would clamp onto whatever occupies that coordinate.';
    const dir = await captureFailure(reason);
    throw new Error(`${reason}\nartifacts: ${dir}`);
  }
  const p = aboveTabBar(avoidStatusBar(visible, settled), settled, tabBarTop(await snapshot()));
  await idbTap(p.x, p.y);
}

/**
 * Wait until the element stops moving before tapping it.
 *
 * A tap that lands mid-transition is swallowed: the view is still animating in,
 * the touch never reaches the settled Pressable, and NOTHING reports an error —
 * the tap simply had no effect. It surfaces much later as a screen that refused
 * to advance, or as a gated CTA that never enables.
 *
 * Assertions make this easy to hit, because they are satisfied by the first
 * frame that contains the text: `expectVisible({text: /preferred side/i})`
 * returns while the screen is still sliding in, and the next tap goes out
 * immediately. It is timing-dependent, so it hides on a slower host and appears
 * on a faster one — this suite runs under x64 Node locally and arm64 Node on the
 * CI runner, which is exactly that gap.
 *
 * Comparing the element's own frame across snapshots detects the animation
 * directly, and costs one extra snapshot for the common already-stable case.
 */
async function settleFrame(sel: Selector, first: AxElement): Promise<AxElement> {
  let prev = first;
  for (let i = 0; i < 10; i++) {
    await sleep(120);
    const next = query(await snapshot(), sel);
    if (!next) return prev; // vanished mid-transition — let the tap fail on the stale point
    const still = Math.abs(next.frame.y - prev.frame.y) < 1 && Math.abs(next.frame.x - prev.frame.x) < 1;
    if (still) return next;
    prev = next;
  }
  return prev;
}

/**
 * Tap a field, then type. RN controlled TextInputs drop characters under fast
 * synthetic typing, so verify the field value afterwards and retry slowly.
 * Verification re-finds the field BY POSITION (placeholder selectors stop
 * matching once the placeholder is replaced by the typed value).
 */
export async function typeText(field: Selector, text: string, opts?: WaitOpts): Promise<void> {
  const target = await waitFor(field, opts);

  const isInput = (el: { type: string }) => el.type === 'TextField' || el.type === 'TextArea';
  // Remember WHICH input this is (ordinal), not just where it sits: screens
  // reflow when validation errors or countdowns appear, moving the field a few
  // points and breaking a frozen-coordinate lookup (which then reads "" and
  // reports a failure even though the text landed correctly).
  const initialInputs = (await snapshot()).filter(isInput);
  const targetIndex = initialInputs.findIndex(
    (el) => Math.abs(el.frame.y - target.frame.y) < 2 && Math.abs(el.frame.x - target.frame.x) < 2,
  );

  const fieldAt = async () => {
    const inputs = (await snapshot()).filter(isInput);
    if (targetIndex >= 0 && inputs[targetIndex]) return inputs[targetIndex];
    // Fallback: nearest input to where the field started.
    return inputs
      .slice()
      .sort((a, b) => Math.abs(a.frame.y - target.frame.y) - Math.abs(b.frame.y - target.frame.y))[0];
  };

  // Formatting-only differences (spaces/dashes a field inserts) are fine;
  // extra letters/digits are NOT — `includes` used to accept mangled values
  // like "del<text>jam" left behind by a mid-text cursor.
  const normalize = (s: string) => s.replace(/[\s()-]/g, '');
  // The field's pre-typing value is its placeholder. OTP screens use bullets
  // ("••••••") as a placeholder, which the secure-field heuristic below would
  // otherwise mistake for a filled password — reporting success on an EMPTY
  // field and submitting a blank code.
  const placeholder = target.AXValue ?? '';
  const settled = async () => {
    const el = await fieldAt();
    const value = el?.AXValue ?? '';
    if (value === text || normalize(value) === normalize(text)) return true;
    if (value === placeholder) return value; // unchanged — never "settled"
    // Secure fields mask their value — accept a mask of the right length.
    if (/^[•*]+$/.test(value) && value.length === text.length) return true;
    return value;
  };

  // Always type character-by-character. Bulk `idb ui text` outruns React's
  // controlled-input state: the NATIVE field ends up showing the full string
  // (so an AX check passes) while the component's state kept only part of it —
  // e.g. "+351912345678" on screen but "351912345678" in state, which the app
  // then rejects as an invalid email.
  const typeSlow = async () => {
    for (const ch of text) {
      await idbText(ch);
      await sleep(45);
    }
  };

  // On single-input screens (OTP/code screens autoFocus their field) use the
  // existing focus — tapping an already-focused field can drop it. Only safe
  // with exactly one input, else blind typing lands in a neighbouring field.
  const inputs = (await snapshot()).filter((el) => el.type === 'TextField' || el.type === 'TextArea');
  if (inputs.length === 1) {
    await typeSlow();
    await sleep(400);
    if ((await settled()) === true) return;
  }

  // Re-settle before tapping. `target` was resolved at the top of this function
  // and the raw-coordinate tap below bypasses the settling that tap(selector)
  // does — so on a screen still animating in, the touch lands wherever moved
  // into that spot. Measured: on community manage/settings that is an image
  // picker, and the run ended in the iOS photo library with the app's AX tree
  // empty and a wholly unrelated-looking failure.
  const settledTarget = await settleFrame(field, target);
  const focusPoint = visibleTapPoint(settledTarget);
  if (!focusPoint) {
    const reason = `typeText cannot focus ${describeSelector(field)}: the field is entirely off screen (y=${Math.round(settledTarget.frame.y)}). Scroll it into view first.`;
    const dir = await captureFailure(reason);
    throw new Error(`${reason}\nartifacts: ${dir}`);
  }
  await tap({ x: focusPoint.x, y: focusPoint.y });
  await sleep(500);
  await typeSlow();
  await sleep(400);

  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await settled();
    if (state === true) return;
    // Clear and retype character-by-character (slow but reliable). The focus
    // tap can leave the cursor mid-text and backspace only deletes to the
    // left — jump to the end first, then sweep forward-deletes for anything
    // that would still sit right of the cursor.
    await idbKey(77); // End
    await sleep(150);
    for (let i = 0; i < String(state).length + 5; i++) await idbKey(42);
    for (let i = 0; i < 4; i++) await idbKey(76); // forward-delete stragglers
    await typeSlow();
    await sleep(400);
  }
  const finalState = await settled();
  if (finalState !== true) {
    // A field holding MORE than was typed, after three clear-and-retypes, means
    // something else is typing too — twice on 2026-09-25 that was an orphaned
    // run on the same simulator. Say so, instead of leaving it to be decoded
    // from a value like "emo@1p2adeljam.test".
    const overlap =
      String(finalState).length > text.length
        ? ' — the field holds text this run never typed: is another run driving the simulator? (pgrep -fl vitest)'
        : '';
    const dir = await captureFailure(`typeText could not settle "${text}" into ${JSON.stringify(field)} (got "${finalState}")${overlap}`);
    throw new Error(`typeText failed for ${JSON.stringify(field)}: field shows "${finalState}"${overlap}\nartifacts: ${dir}`);
  }
}

/** Clear a focused text field with n backspaces (idb has no select-all). */
export async function clearText(field: Selector, chars = 40): Promise<void> {
  await tap(field);
  await sleep(300);
  for (let i = 0; i < chars; i++) await idbKey(42);
}

export const pressReturn = () => idbKey(40);

export async function swipe(
  direction: 'up' | 'down' | 'left' | 'right',
  opts: { fromY?: number; keyboardTopY?: number | null } = {},
): Promise<void> {
  // Device points; start away from edges (edge swipes trigger OS gestures at <4pt).
  const cx = 200;
  const d = 250;
  // A swipe that STARTS on the software keyboard scrolls nothing: the keyboard
  // swallows it, the content does not move, and the caller reports an element
  // stuck at an unchanged y. The default band is 375..625 and the keyboard's top
  // is around 575 on this device, so every scroll behind a focused field failed
  // this way the moment Xcode 27 began showing the software keyboard (it had
  // been suppressed by a connected hardware keyboard before). Slide the band up
  // so the whole gesture clears the keyboard.
  const cy = opts.fromY ?? clearOfKeyboard(500, d, opts.keyboardTopY ?? null);
  const map = {
    up: [cx, cy + d / 2, cx, cy - d / 2],
    down: [cx, cy - d / 2, cx, cy + d / 2],
    left: [cx + d / 2, cy, cx - d / 2, cy],
    right: [cx - d / 2, cy, cx + d / 2, cy],
  } as const;
  const [x1, y1, x2, y2] = map[direction];
  await idbSwipe(x1, y1, x2, y2);
  await sleep(400);
}

/**
 * Toggle an RN Switch (surfaces as a CheckBox whose AXValue is "0"/"1") and
 * verify the value actually flipped — a tap that lands while the screen is
 * still loading is silently swallowed, so retry until the state changes.
 */
export async function toggleSwitch(sel: Selector, opts: { attempts?: number } = {}): Promise<void> {
  const el = await waitFor(sel);
  const before = el.AXValue;
  // Settings screens mount switches while their query is still resolving, and a
  // zero-duration tap at dead centre does not always actuate a UISwitch — cycle
  // through positions/durations until the reported value actually changes.
  await sleep(1500);
  const { x, y, width, height } = el.frame;
  const cy = y + height / 2;
  const strategies: Array<[number, number, number | undefined]> = [
    [x + width / 2, cy, undefined],
    [x + width / 2, cy, 0.1],
    [x + width * 0.25, cy, 0.05], // the "off" half
    [x + width * 0.75, cy, 0.05], // the "on" half
    [x + width / 2, cy, 0.2],
  ];
  const attempts = opts.attempts ?? strategies.length;
  for (let i = 0; i < attempts; i++) {
    const [tx, ty, dur] = strategies[i % strategies.length]!;
    await idbTap(tx, ty, dur);
    await sleep(1500);
    const now = query(await snapshot(), sel)?.AXValue;
    if (now !== before) return;
  }
  const dir = await captureFailure(`toggleSwitch did not flip ${JSON.stringify(sel)} (stuck at "${before}")`);
  throw new Error(`toggleSwitch failed for ${JSON.stringify(sel)}: value stayed "${before}"\nartifacts: ${dir}`);
}

/** iOS interactive-pop back gesture: swipe from the left screen edge. */
export async function backGesture(): Promise<void> {
  // Swipe through the HEADER, not the middle of the screen.
  //
  // This used to swipe at y=420, which on a community `[id]/(home)` screen lands
  // inside the top-tabs pager — measured: its tab strip sits at y=302..350 and
  // the pager's own content Group at y=350..874. A horizontal pan there is
  // claimed by the pager, so the stack never popped. #19 papered over it inside
  // ensureTabs() with a relaunch() fallback; this fixes the primitive, which is
  // what every other caller uses.
  //
  // The y is DERIVED, not fixed, because a fixed one does not exist. Measured:
  //
  //   community home       tab strip y=302..350, pager content y=350..874
  //   finished live event  "Round 1"/"Round 2" side by side at y=120..380
  //
  // A band above the community pager (y=150) lands inside the live screen's
  // round rail, and vice versa — the first attempt at this fixed y=150/250 and
  // broke suite 07 exactly that way.
  //
  // What steals the pan is always a horizontally-arranged group, and that has a
  // reliable signature in the tree: two or more elements sharing a y. So swipe
  // just above the topmost one. On the live screen that yields ~108 (above the
  // round rail); on the community screen ~258 (header, above the tab strip).
  const tree = await snapshot();
  const before = treeSignature(tree);
  const y0 = safeBackY(tree);
  for (const y of [y0, Math.max(STATUS_BAND + 12, y0 - 10)]) {
    await idbSwipe(2, y, 240, y, 350);
    await sleep(600);
    if (treeSignature(await snapshot()) !== before) return;
  }
  // Deliberately NOT retrying at the old y=420, and this is MEASURED rather than
  // assumed: restoring that coordinate makes the pager flip to its next tab, so
  // the tree changes and the check below reads it as a pop — the guard in suite
  // 09 then fails on the tab bar never coming back, not on this throw. A wrong
  // success is the exact failure mode this driver keeps being bitten by (#19,
  // #26, the swallowed tap above), so give up loudly instead.
  //
  // Note the honest limit: a changed tree is a PROXY for "popped", not proof.
  // It holds here because the header is not a pager — a swipe there either pops
  // or does nothing. The real assertion lives in suite 09's guard.
  // Report the coordinates ACTUALLY tried. These are derived per screen, so a
  // hardcoded message here goes stale the moment safeBackY changes — and it
  // did: it kept naming y=150/250 long after the derivation replaced them.
  // A common cause of landing here is a system alert: it makes the app's AX
  // tree empty, so nothing can change and no swipe can pop anything.
  const reason =
    `backGesture did not change the screen at y=${y0} or y=${Math.max(STATUS_BAND + 12, y0 - 10)} — `
    + 'the stack did not pop (a system alert left up will do this: it empties the app AX tree)';
  const dir = await captureFailure(reason);
  throw new Error(`${reason}\nartifacts: ${dir}`);
}

/** Cheap stable summary of a screen, for "did anything change?" checks. */
function treeSignature(tree: AxElement[]): string {
  return tree.map((e) => `${e.type}:${e.AXLabel ?? ''}`).join('|');
}

/**
 * A y to swipe across that no horizontal scroller is likely to claim.
 *
 * Two or more elements sharing a y means they sit side by side — a pager tab
 * strip, a card rail, a segmented control — which is exactly what consumes a
 * horizontal pan. Swiping above the topmost such row keeps the gesture in
 * header/nav space, where only the stack's own pop recogniser is listening.
 */
function safeBackY(tree: AxElement[]): number {
  const rows = new Map<number, number>();
  for (const el of tree) {
    const y = Math.round(el.frame.y);
    if (y <= STATUS_BAND || y >= SCREEN.height) continue;
    rows.set(y, (rows.get(y) ?? 0) + 1);
  }
  const topRow = [...rows.entries()]
    .filter(([, count]) => count >= 2)
    .map(([y]) => y)
    .sort((a, b) => a - b)[0];
  // No rail at all (a plain scrolling screen): mid-header is fine.
  if (topRow === undefined) return 150;
  return Math.max(STATUS_BAND + 12, topRow - 12);
}

/**
 * Move a swipe's centre well up the area above the keyboard.
 *
 * "Above the keyboard" is not enough, which is the whole point of this
 * function. Measured on Edit profile with the keyboard top at y=590:
 *
 *   swipe 566 -> 316   Save stays at y=955   (clears the keyboard by 24pt)
 *   swipe 570 -> 480   Save stays at y=955
 *   swipe 570 -> 200   Save stays at y=955
 *   swipe 420 -> 170   Save moves to y=782   scrolled
 *   swipe 300 -> 150   Save moves to y=782   scrolled
 *
 * A band that hugs the keyboard's top edge is swallowed even though every
 * coordinate in it is above the keyboard; one centred in the upper half of the
 * remaining space works. So aim for the middle of the space above the keyboard
 * rather than for the largest legal offset.
 */
function clearOfKeyboard(cy: number, d: number, keyboardTopY: number | null): number {
  if (keyboardTopY == null) return cy;
  let centred = Math.min(cy, Math.round(keyboardTopY / 2));
  // Keep the far end clear of the status bar; an edge swipe there is an OS gesture.
  if (centred - d / 2 < 60) centred = 60 + d / 2;
  return centred;
}

/**
 * Scroll (default up-swipe = scroll down) until the selector is on screen.
 *
 * Two DIFFERENT thresholds here, deliberately:
 *
 * - `restsComfortably` is the loop's stop rule — keep swiping until the element sits
 *   well clear of the status bar and the bottom edge. It is a heuristic for when to
 *   stop scrolling, and it is intentionally conservative.
 * - `onScreen` is the exit assertion — is the element actually usable? Anything
 *   within the viewport is; idb only drops taps that fall OUTSIDE it.
 *
 * Conflating the two is a bug in both directions. Asserting the strict band rejects
 * elements at y≈802-810 that are perfectly tappable (measured: doing so broke 12
 * tests across 7 suites). Asserting mere existence — the original behaviour — lets
 * an element scrolled far off-screen (measured: y=-477) report success, and the
 * caller then taps a coordinate idb silently discards, so the run fails later
 * somewhere unrelated. That misleading-timeout shape is the same one behind the
 * ensureTabs give-up fixed in #19.
 */
const restsComfortably = (el: AxElement | undefined | null, barTop: number | null = null): boolean =>
  !!el &&
  el.frame.y > 60 &&
  el.frame.y < 800 &&
  // Not behind the tab bar either (see tabBarTop): its centre must clear the bar's top.
  (barTop == null || TAB_LABEL.test(el.AXLabel ?? '') || el.frame.y + el.frame.height / 2 < barTop - 8);

const onScreen = (el: { frame: { y: number } } | undefined | null): boolean =>
  !!el && el.frame.y >= 0 && el.frame.y < SCREEN.height;

export async function scrollUntilVisible(
  sel: Selector,
  opts: { direction?: 'up' | 'down'; maxSwipes?: number } = {},
): Promise<void> {
  const { direction = 'up', maxSwipes = 8 } = opts;
  for (let i = 0; i < maxSwipes; i++) {
    // One snapshot per iteration serves both purposes: the stop rule, and the
    // keyboard position the swipe needs. Asking for it inside swipe() would add
    // a describe-all per gesture, which is the expensive call in this driver.
    const tree = await snapshot();
    // Only stop once the SETTLED position is comfortable. swipe() sleeps 400ms,
    // which is not the end of the gesture: iOS keeps decelerating, and near the
    // end of the content it rubber-bands past the limit and springs back. The
    // snapshot taken during that overshoot is a real reading of a position the
    // screen does not keep. Measured on community manage/settings: Save came into
    // view mid-flight, this loop returned, the content sprang back under the
    // keyboard, and the tap() that followed spent 15s waiting for an element that
    // had been there a moment ago. It failed on one CI run, passed on the next
    // three, and failed on the two after that — the shape of a race, not a bug in
    // the screen.
    if (restsComfortably(query(tree, sel), tabBarTop(tree))) {
      await sleep(700);
      const settled = await snapshot();
      if (restsComfortably(query(settled, sel), tabBarTop(settled))) return;
      continue;
    }
    await swipe(direction, { keyboardTopY: keyboardTop(tree) });
  }
  const el = query(await snapshot(), sel);
  if (onScreen(el)) return;
  const where = el
    ? `found at y=${Math.round(el.frame.y)}, off screen (viewport 0..${SCREEN.height})`
    : 'never appeared';
  const dir = await captureFailure(
    `scrollUntilVisible exhausted ${maxSwipes} swipes: ${JSON.stringify(sel)} — ${where}`,
  );
  throw new Error(`scrollUntilVisible failed for ${JSON.stringify(sel)}: ${where}\nartifacts: ${dir}`);
}
