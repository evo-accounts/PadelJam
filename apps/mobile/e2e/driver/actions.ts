import { center, snapshot, query, type Selector } from './a11y';
import { idbKey, idbSwipe, idbTap, idbText } from './idb';
import { captureFailure, waitFor, type WaitOpts } from './expect';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tap an element (waits for it first) or an absolute point in device points. */
export async function tap(target: Selector | { x: number; y: number }, opts?: WaitOpts): Promise<void> {
  if ('x' in target && 'y' in target && !('text' in target)) {
    await idbTap(target.x, target.y);
    return;
  }
  const el = await waitFor(target as Selector, opts);
  const c = center(el);
  await idbTap(c.x, c.y);
}

/**
 * Tap a field, then type. RN controlled TextInputs drop characters under fast
 * synthetic typing, so verify the field value afterwards and retry slowly.
 * Verification re-finds the field BY POSITION (placeholder selectors stop
 * matching once the placeholder is replaced by the typed value).
 */
export async function typeText(field: Selector, text: string, opts?: WaitOpts): Promise<void> {
  const target = await waitFor(field, opts);
  const c = center(target);
  await idbTap(c.x, c.y);
  await sleep(500);

  const fieldAt = async () => {
    const tree = await snapshot();
    return tree.find(
      (el) => (el.type === 'TextField' || el.type === 'TextArea')
        && Math.abs(el.frame.y - target.frame.y) < 8
        && Math.abs(el.frame.x - target.frame.x) < 8,
    );
  };

  // Formatting-only differences (spaces/dashes a field inserts) are fine;
  // extra letters/digits are NOT — `includes` used to accept mangled values
  // like "del<text>jam" left behind by a mid-text cursor.
  const normalize = (s: string) => s.replace(/[\s()-]/g, '');
  const settled = async () => {
    const el = await fieldAt();
    const value = el?.AXValue ?? '';
    if (value === text || normalize(value) === normalize(text)) return true;
    // Secure fields mask their value — accept a mask of the right length.
    if (/^[•*]+$/.test(value) && value.length === text.length) return true;
    return value;
  };

  await idbText(text);
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
    for (const ch of text) {
      await idbText(ch);
      await sleep(40);
    }
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

export async function swipe(direction: 'up' | 'down' | 'left' | 'right', opts: { fromY?: number } = {}): Promise<void> {
  // Device points; start away from edges (edge swipes trigger OS gestures at <4pt).
  const cx = 200;
  const cy = opts.fromY ?? 500;
  const d = 250;
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

/** iOS interactive-pop back gesture: swipe from the left screen edge. */
export async function backGesture(): Promise<void> {
  await idbSwipe(2, 420, 240, 420, 350);
  await sleep(600);
}

/** Scroll (default up-swipe = scroll down) until the selector appears. */
export async function scrollUntilVisible(
  sel: Selector,
  opts: { direction?: 'up' | 'down'; maxSwipes?: number } = {},
): Promise<void> {
  const { direction = 'up', maxSwipes = 8 } = opts;
  for (let i = 0; i < maxSwipes; i++) {
    const el = query(await snapshot(), sel);
    if (el && el.frame.y > 60 && el.frame.y < 800) return;
    await swipe(direction);
  }
  const el = query(await snapshot(), sel);
  if (!el) {
    const dir = await captureFailure(`scrollUntilVisible exhausted ${maxSwipes} swipes: ${JSON.stringify(sel)}`);
    throw new Error(`scrollUntilVisible failed for ${JSON.stringify(sel)}\nartifacts: ${dir}`);
  }
}
