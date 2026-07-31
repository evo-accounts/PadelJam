import { afterEach, beforeAll, beforeEach } from 'vitest';
import { captureFailure, setCurrentTestName } from './driver/expect';

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
  if (ctx.task.result?.state === 'fail') {
    // waitFor/expect* already capture rich artifacts; this catches non-driver assertion failures.
    await captureFailure(`test failed: ${ctx.task.result.errors?.map((e) => e.message).join('\n') ?? 'unknown'}`).catch(() => {});
  }
});
