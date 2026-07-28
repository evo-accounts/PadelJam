import { afterEach, beforeEach } from 'vitest';
import { captureFailure, setCurrentTestName } from './driver/expect';

beforeEach((ctx) => {
  setCurrentTestName(`${ctx.task.file?.name ?? 'suite'}--${ctx.task.name}`);
});

afterEach(async (ctx) => {
  if (ctx.task.result?.state === 'fail') {
    // waitFor/expect* already capture rich artifacts; this catches non-driver assertion failures.
    await captureFailure(`test failed: ${ctx.task.result.errors?.map((e) => e.message).join('\n') ?? 'unknown'}`).catch(() => {});
  }
});
