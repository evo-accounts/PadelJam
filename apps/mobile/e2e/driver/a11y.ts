import { idbDescribeAll } from './idb';
import { AccessibilityWedgedError, WedgeTracker, isWedgedDescribeError, isWedgedTree } from './axWedge';

/** One element from `idb ui describe-all --json`. */
export interface AxElement {
  AXLabel: string | null;
  AXUniqueId: string | null;
  AXValue: string | null;
  type: string;
  role: string;
  enabled: boolean;
  frame: { x: number; y: number; width: number; height: number };
  /** iOS accessibility traits. Present from idb; absent on older companions. */
  traits?: string[];
}

/**
 * Top edge of the software keyboard, or null when it is not up.
 *
 * Every key carries the `KeyboardKey` trait, which is what makes this reliable:
 * the keys have no stable labels (they change with language and layout) and the
 * panel itself is not one addressable element.
 */
export function keyboardTop(tree: AxElement[]): number | null {
  const keys = tree.filter((e) => e.traits?.includes('KeyboardKey'));
  if (keys.length === 0) return null;
  return Math.min(...keys.map((k) => k.frame.y));
}

export interface Selector {
  /** Matches AXUniqueId (React Native testID). */
  id?: string;
  /** Exact AXLabel match. */
  label?: string;
  /** Substring or regex match against AXLabel or AXValue. */
  text?: string | RegExp;
  /** Element type filter, e.g. 'Button', 'TextField', 'Heading'. */
  type?: string;
  /** 0-based index among matches (default 0). */
  nth?: number;
}

/**
 * Every snapshot records whether the AX bridge looked wedged (see axWedge.ts).
 * Once that has persisted, snapshot and waitFor raise AccessibilityWedgedError
 * so the test sees what happened; only freshInstall, which is discarding the
 * app's state anyway, reboots the simulator for it. Nothing reboots mid-test.
 */
const wedge = new WedgeTracker();

/** describe-all has answered "wedged" continuously for WEDGE_PERSIST_MS. */
export const accessibilityWedged = (): boolean => wedge.isWedged();
/** The latest conclusive describe-all was wedged, however briefly. */
export const lastSnapshotWedged = (): boolean => wedge.lastReadWedged;
/** Forget the wedge — after a reboot the clock must start again. */
export const resetAccessibilityWedge = (): void => wedge.reset();

export async function snapshot(): Promise<AxElement[]> {
  let raw: string;
  try {
    raw = await idbDescribeAll();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!isWedgedDescribeError(message)) throw e;
    wedge.observe(true);
    // One of these can be a passing system dialog; only a persistent one earns the type.
    throw wedge.isWedged() ? new AccessibilityWedgedError(message) : e;
  }
  const parsed = JSON.parse(raw) as AxElement[];
  wedge.observe(isWedgedTree(parsed));
  return parsed.filter((e) => e && e.frame && e.frame.width > 0 && e.frame.height > 0);
}

function matches(el: AxElement, sel: Selector): boolean {
  if (sel.type && el.type !== sel.type) return false;
  if (sel.id) return el.AXUniqueId === sel.id;
  if (sel.label) return el.AXLabel === sel.label;
  if (sel.text !== undefined) {
    const hay = [el.AXLabel, el.AXValue].filter(Boolean).join(' ');
    return sel.text instanceof RegExp ? sel.text.test(hay) : hay.toLowerCase().includes(String(sel.text).toLowerCase());
  }
  // Type-only selector: the type filter above already passed.
  return sel.type !== undefined;
}

export function query(tree: AxElement[], sel: Selector): AxElement | undefined {
  const found = tree.filter((el) => matches(el, sel));
  return found[sel.nth ?? 0];
}

export function queryAll(tree: AxElement[], sel: Selector): AxElement[] {
  return tree.filter((el) => matches(el, sel));
}

export function center(el: AxElement): { x: number; y: number } {
  return { x: el.frame.x + el.frame.width / 2, y: el.frame.y + el.frame.height / 2 };
}

export function describeSelector(sel: Selector): string {
  return JSON.stringify(sel);
}
