import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from './config';
import { snapshot, query, type AxElement, type Selector, describeSelector } from './a11y';
import { appLogTail, screenshot } from './sim';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let currentTestName = 'unknown-test';
let capturedThisTest = false;
export function setCurrentTestName(name: string): void {
  currentTestName = name.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 120);
  capturedThisTest = false;
}

/** Whether captureFailure already ran for the current test (see setup.ts's afterEach). */
export function hasCapturedThisTest(): boolean {
  return capturedThisTest;
}

/** Dump screenshot + a11y tree + app log tail for the failing step. */
export async function captureFailure(reason: string): Promise<string> {
  capturedThisTest = true;
  const dir = join(CONFIG.artifactsDir, currentTestName);
  mkdirSync(dir, { recursive: true });
  const stamp = Date.now();
  try {
    await screenshot(join(dir, `${stamp}.png`));
  } catch { /* screenshot is best-effort */ }
  try {
    const tree = await snapshot();
    writeFileSync(join(dir, `${stamp}-a11y.json`), JSON.stringify(tree, null, 2));
  } catch { /* best-effort */ }
  try {
    writeFileSync(join(dir, `${stamp}-app.log`), await appLogTail(30));
  } catch { /* best-effort */ }
  // Gateway log only for auth-shaped failures (or on demand). captureFailure
  // runs on EVERY failure and this shells out to docker, so a plain waitFor
  // timeout must not pay for it. The app log cannot answer "which request got
  // the 401" — CFNetwork logs a status with no URL — which is precisely how the
  // PGRST303 stale-clock failure was misread as an HTTP 500.
  if (process.env.E2E_CAPTURE_GATEWAY === '1' || /JWT|PGRST3|401|unauthor/i.test(reason)) {
    try {
      const { gatewayLogTail } = await import('./gateway');
      writeFileSync(join(dir, `${stamp}-gateway.log`), await gatewayLogTail(120));
    } catch { /* best-effort */ }
  }
  writeFileSync(join(dir, `${stamp}-reason.txt`), reason);
  return dir;
}

export interface WaitOpts {
  timeout?: number;
  interval?: number;
}

/** Poll the accessibility tree until the selector matches; throws with artifacts on timeout. */
export async function waitFor(sel: Selector, opts: WaitOpts = {}): Promise<AxElement> {
  const timeout = opts.timeout ?? CONFIG.waitTimeoutMs;
  const interval = opts.interval ?? CONFIG.pollIntervalMs;
  const deadline = Date.now() + timeout;
  let lastErr = '';
  while (Date.now() < deadline) {
    try {
      const el = query(await snapshot(), sel);
      if (el) return el;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await sleep(interval);
  }
  const reason = `waitFor timed out after ${timeout}ms: ${describeSelector(sel)}${lastErr ? `\nlast snapshot error: ${lastErr}` : ''}`;
  const dir = await captureFailure(reason);
  throw new Error(`${reason}\nartifacts: ${dir}`);
}

export const expectVisible = (sel: Selector, opts?: WaitOpts) => waitFor(sel, opts);

/** Wait until the selector stops matching. */
export async function expectGone(sel: Selector, opts: WaitOpts = {}): Promise<void> {
  const timeout = opts.timeout ?? CONFIG.waitTimeoutMs;
  const interval = opts.interval ?? CONFIG.pollIntervalMs;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const el = query(await snapshot(), sel);
    if (!el) return;
    await sleep(interval);
  }
  const reason = `expectGone timed out after ${timeout}ms: still visible ${describeSelector(sel)}`;
  const dir = await captureFailure(reason);
  throw new Error(`${reason}\nartifacts: ${dir}`);
}

/** Assert element's label/value against a matcher once visible. */
export async function expectText(sel: Selector, matcher: string | RegExp, opts?: WaitOpts): Promise<AxElement> {
  const el = await waitFor(sel, opts);
  const hay = `${el.AXLabel ?? ''} ${el.AXValue ?? ''}`;
  const ok = matcher instanceof RegExp ? matcher.test(hay) : hay.includes(matcher);
  if (!ok) {
    const reason = `expectText mismatch for ${describeSelector(sel)}: wanted ${matcher}, got "${hay}"`;
    const dir = await captureFailure(reason);
    throw new Error(`${reason}\nartifacts: ${dir}`);
  }
  return el;
}
