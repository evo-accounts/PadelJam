import { snapshot, query, describeSelector, keyboardTop, type AxElement, type Selector } from './a11y';
import { idbKey, idbSwipe, idbTap, idbText } from './idb';
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
  const el = await waitFor(target as Selector, opts);
  const settled = await settleFrame(target as Selector, el);
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
  const p = avoidStatusBar(visible, settled);
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
    const dir = await captureFailure(`typeText could not settle "${text}" into ${JSON.stringify(field)} (got "${finalState}")`);
    throw new Error(`typeText failed for ${JSON.stringify(field)}: field shows "${finalState}"\nartifacts: ${dir}`);
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
 * Move a swipe's centre up so the gesture finishes clear of the keyboard.
 *
 * Returns the original centre when the keyboard is down, or when there is not
 * enough room above it — in that case the swipe is doomed either way and a
 * failure with the real frame is more useful than one at a clamped coordinate.
 */
function clearOfKeyboard(cy: number, d: number, keyboardTopY: number | null): number {
  if (keyboardTopY == null) return cy;
  const margin = 24;
  const lowest = keyboardTopY - margin;
  if (cy + d / 2 <= lowest) return cy;
  const shifted = lowest - d / 2;
  return shifted - d / 2 > 60 ? shifted : cy;
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
const restsComfortably = (el: { frame: { y: number } } | undefined | null): boolean =>
  !!el && el.frame.y > 60 && el.frame.y < 800;

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
    if (restsComfortably(query(tree, sel))) return;
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
