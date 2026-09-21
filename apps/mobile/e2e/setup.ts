import { afterEach, beforeAll, beforeEach } from 'vitest';
import { captureFailure, hasCapturedThisTest, setCurrentTestName } from './driver/expect';

// Name the file BEFORE any hook runs. Without this, anything failing in a
// suite's beforeAll — which is where resetDb/freshInstall/loginAs live, i.e. the
// most failure-prone code in the harness — writes its artifacts to
// `unknown-test/`, unattributable to the suite that produced them.
beforeAll((ctx) => {
  setCurrentTestName(`${ctx.name?.split('/').pop() ?? 'suite'}--hook`);
});

beforeEach((ctx) => {
  setCurrentTestName(`${ctx.task.file?.name ?? 'suite'}--${ctx.task.name}`);
});

afterEach(async (ctx) => {
  // waitFor/expect* already capture rich artifacts; this catches non-driver assertion
  // failures. Guarded because it used to fire even when the driver had just captured,
  // so every driver failure wrote two identical screenshots and trees seconds apart —
  // pure duplication, and it is bytes that the artifact storage quota is counting.
  if (ctx.task.result?.state === 'fail' && !hasCapturedThisTest()) {
    await captureFailure(`test failed: ${ctx.task.result.errors?.map((e) => e.message).join('\n') ?? 'unknown'}`).catch(() => {});
  }
});
