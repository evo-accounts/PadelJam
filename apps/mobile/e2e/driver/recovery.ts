/**
 * After a failed test, put the app back in a known state. Suite files share one app session, and
 * a failed test can leave a modal sheet up (or the device on its Home Screen), which fails every
 * later test on its first gesture (#332: 24 tests in 06). A failed recovery is logged and
 * swallowed so it never masks the test's own failure.
 */
export async function recoverAfterFailure(
  failed: boolean,
  testName: string,
  relaunch: () => Promise<void>,
  warn: (msg: string) => void = console.warn,
): Promise<boolean> {
  if (!failed) return false;
  warn(`[e2e] recovery: relaunching the app after a failed test (${testName})`);
  try {
    await relaunch();
    return true;
  } catch (e) {
    warn(`[e2e] recovery: relaunch failed, carrying on: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}
