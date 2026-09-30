import type { AxElement } from './a11y';

/**
 * Detecting a WEDGED accessibility tree: the simulator's AX bridge stops
 * translating the app, while the app itself is fine and on screen.
 *
 * CI run 36695325297 (2026-09-30), ~80 minutes into a full serial run: the app
 * was visibly on its welcome screen, but `idb ui describe-all` either failed
 * with "No translation object returned for simulator" or returned ONE
 * AXApplication with a {0,0,0,0} frame and nothing under it. `snapshot()` drops
 * zero-size elements, so every read came back `[]`; freshInstall reported it as
 * `stale session survived keychain reset (saw "")`, burned 3 × 30 s per suite,
 * and the last four suites never ran before the job timed out. Uninstalling,
 * relaunching and restarting idb_companion all left it wedged; rebooting the
 * simulator fixed it at once (describe-all then returned the 9 welcome-screen
 * elements). The recovery is in app.ts; this file is only the detection, pure
 * so it is unit-tested.
 *
 * One wedged-looking read is NOT the wedge. The error text itself blames "a
 * fullscreen dialog", and suite 04's hook on the same run saw it once and
 * recovered on the next purge. Only a wedge that PERSISTS counts — see
 * WedgeTracker.
 *
 * The zero-size application also means "no window on screen yet", so an app
 * stuck on its launch screen looks the same: suite 98 on run 36713494350 sat
 * on the launch placeholder for about a minute and was detected. freshInstall's
 * reboot is still the right answer there; mid-test it is only ever reported.
 *
 * A describe-all that TIMES OUT does not count, either way — decided
 * 2026-09-30 on run 36713494350, where three calls ended "failed (1)" with no
 * output. That was our own 30 s timeout killing a hung call (proc.ts now says
 * so). Suite 08's hook lost its 20 s loginAs wait to one, yet the capture right
 * after it read a healthy 21-element tree mid-navigation, and the next four
 * suites passed without a reboot; suite 01 hit one mid-test and its next test
 * passed. A hang is a slow bridge, not a wedged one, so it neither starts nor
 * clears the clock. Revisit only if a run shows hangs that persist AND a
 * reboot curing them.
 */

/** idb's stderr when the AX bridge has no translation for the device. */
const NO_TRANSLATION = /No translation object returned/i;

/** describe-all failed the way a wedged bridge fails. */
export function isWedgedDescribeError(message: string): boolean {
  return NO_TRANSLATION.test(message);
}

/**
 * describe-all "succeeded" with the wedged shape: exactly one element, the
 * application itself, with no area.
 *
 * A single Application WITH its full-screen frame is not this — that is a
 * healthy bridge on a screen with nothing accessible rendered yet (suite 04's
 * artifact above), and waiting is the right response to it.
 */
export function isWedgedTree(tree: unknown): boolean {
  if (!Array.isArray(tree) || tree.length !== 1) return false;
  const only = tree[0] as Partial<AxElement> | null;
  if (!only || (only.role !== 'AXApplication' && only.type !== 'Application')) return false;
  const f = only.frame;
  return !f || f.width <= 0 || f.height <= 0;
}

/**
 * How long describe-all must keep answering "wedged" before we believe it.
 * Right after launch the tree can be momentarily empty; ten seconds of nothing
 * else is not a launch. freshInstall's wait is 30 s, so a real wedge clears
 * this with room to spare.
 */
export const WEDGE_PERSIST_MS = 10_000;

/** The tree was wedged for WEDGE_PERSIST_MS — a simulator reboot, not a retry, fixes it. */
export class AccessibilityWedgedError extends Error {
  override name = 'AccessibilityWedgedError';
}

/**
 * Tracks how long describe-all has CONTINUOUSLY answered "wedged". Any healthy
 * read clears it; reads that failed some other way (a timeout, a lost
 * companion) say nothing about the bridge and leave it alone.
 */
export class WedgeTracker {
  private since: number | null = null;

  constructor(private readonly now: () => number = () => Date.now()) {}

  observe(wedged: boolean): void {
    if (!wedged) this.since = null;
    else this.since ??= this.now();
  }

  /** The most recent conclusive read was wedged (no persistence required). */
  get lastReadWedged(): boolean {
    return this.since !== null;
  }

  /** Wedged on every conclusive read for at least `minMs`. */
  isWedged(minMs = WEDGE_PERSIST_MS): boolean {
    return this.since !== null && this.now() - this.since >= minMs;
  }

  reset(): void {
    this.since = null;
  }
}
