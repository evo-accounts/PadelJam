# The e2e job starts Docker by itself (PAD-98)

## Problem

The `e2e` job fails within seconds if `joaopaulos4`'s OrbStack isn't running. The error is the Supabase
CLI's raw `dial unix .../docker.sock: no such file or directory`, and it takes the founder to fix (1 Nov,
run 41296813320 and #292). PAD-11 changed the stack's ports and PAD-25 added a teardown; neither touches
this. It still happens if OrbStack is quit or crashes, or if a queued job starts at login before Docker
answers.

## Approach

`scripts/e2e/ci-stack.mjs` is what the workflow's stack step runs, so no workflow edit is needed. Before
it does anything else, it:

1. Checks that Docker answers.
2. If not, runs `open -g -a OrbStack`. That's how OrbStack starts for a person too, and it works from the
   runner because the runner is a LaunchAgent in that user's GUI session (`gui/501`).
3. Waits up to 2 minutes for Docker to answer. On 3 Nov, the socket appeared 10 s after the app started.
4. If Docker still doesn't answer, fails with a message that says what to do.

Out of scope: `joaopaulos4` being logged out. The runner is offline then and the job waits in the queue,
so no script on the runner can help.

## Changes

**New: `scripts/e2e/docker.mjs`**

```js
// Injected so it can be tested without Docker. `start` must not throw.
export async function ensureDocker({ isUp, start, sleep, attempts = 24, waitMs = 5000 }) {
  if (isUp()) return true;
  start();
  for (let i = 0; i < attempts; i++) {
    await sleep(waitMs);
    if (isUp()) return true;
  }
  return false;
}
```

**`scripts/e2e/ci-stack.mjs`**: call it right after the `[ci-stack] stack:` line, before the port probe
(the probe's `docker ps` throws when Docker is down).

- `isUp`: `execFileSync('docker', ['info', '--format', '{{.ServerVersion}}'], { stdio: 'ignore', timeout: 10_000 })`,
  true unless it throws.
- `start`: log `[ci-stack] Docker is not answering; starting OrbStack.`, then run
  `execFileSync('open', ['-g', '-a', 'OrbStack'], { stdio: 'ignore', timeout: 10_000 })` in a try/catch that
  logs a failure and carries on. A Mac without OrbStack then ends at the same error below.
- On `false`, print this and `process.exit(1)` before anything is written:

  ```
  ::error::Docker did not answer within 2 minutes, even after starting OrbStack. Log in to the runner Mac as joaopaulos4, open OrbStack, check that `docker ps` works there, then re-run this job.
  ```

  Use the same text after a `[ci-stack] ERROR:` prefix on a second line, so it reads clearly in the log too.

**New: `scripts/e2e/docker.test.mjs`** (`pnpm test:functions` already picks up `scripts/e2e/*.test.mjs`):

- Up at once: returns true, `start` and `sleep` never called.
- Down, then up on the third check: returns true, `start` called once.
- Never up: returns false after exactly `attempts` sleeps, `start` called once.

No change to `.github/workflows/`, `run.mjs`, or the stack names and ports. Update the sentence at the
top of `ci-stack.mjs` so it says the script also starts Docker.

## Acceptance

1. `pnpm test:functions` passes, including the new tests.
2. With Docker unreachable, `DOCKER_HOST=unix:///tmp/no-such.sock node scripts/e2e/ci-stack.mjs` logs the
   start line, ends about 2 minutes later with the error above and exit 1, and writes no `.env`. On the
   agents Mac, `open` is a no-op because OrbStack is already running.
3. The PR's `e2e` run passes (the `scripts/e2e/**` path triggers it), with no `starting OrbStack` line in
   `Ensure the local Supabase stack is up`.
4. After merge, a founder drill on the runner proves the real restart: quit `joaopaulos4`'s OrbStack while
   the runner is idle, dispatch `e2e` with one suite, and see `starting OrbStack` and a green stack step.
