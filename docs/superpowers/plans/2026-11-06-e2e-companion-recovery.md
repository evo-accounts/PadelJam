# Plan: a lost idb companion must not fail a test, and one failed test must not fail the file (PAD-227, PAD-228)

Status: **approved by the CTO, 2026-11-06.** Replaces Engineer B's proposal from PAD-227 (commit bf6eb15, never pushed).

## Finding

There are two separate faults. Fixing only the first would still leave a file able to fail from one bad moment.

**1. The trigger: the companion takes longer to start than the driver waits.**
`restartCompanion` waits 30 s for the socket (`driver/idb.ts`), then warns and returns. `idb()` retries at once and fails with `[Errno 2]`.
- #332, run 42131499039: the companion process started at 01:14:08 and its socket appeared at 01:15:03, so 55 s. Mac load was about 300.
- #324, run 42127976231: same warning at 00:29:48, with load 350-580.

**2. The cascade: nothing returns the app to a known state after a failed test.**
- #332, `06-events-manage`: 24 tests failed between 01:15 and 01:22. The accessibility dump of every one shows the same General Info sheet, and the last screenshot (01:22:52) shows it still open. The first failure left the sheet up. Each later test then failed on its first gesture, because `backGesture` can't dismiss a modal sheet and `tabTo` can't reach the tabs behind it.
- #324, `04-events-detail`: after the failed restart, `simctl io` hung during failure capture and the driver restarted CoreSimulatorService, which leaves the device on its Home Screen. The next 3 tests failed on `backGesture`.
- Suite files share one app session, and `setup.ts` only captures artifacts on failure.

**Also: `No translation object returned for simulator`** from `describe-all` is thrown, not retried. In #324 it came back from the retry straight after a restart (07, "submits a score"). It has shown up on other PRs' runs too, without the same test repeating.

**Ruled out: the restart storm in the earlier proposal.** It suggested each idb call was killing a companion still starting. The companion that started at 01:14:08 was still running, with the same socket, at 01:40. #324 logged only 3 restarts in 11 minutes, and no `unreachable` restart at all. So no guard around `pkill` is needed.

**Load.** Every failure above happened at load 170-760; the last green run was at about 46. Load makes the companion slow, and load readings on this Mac are partly the simulator's own idle daemons. This plan makes the driver tolerate it and does not lower it.

## Change

Only in `apps/mobile/e2e/driver/idb.ts`, `apps/mobile/e2e/setup.ts` and the driver's unit tests.

1. **Wait longer.** `COMPANION_START_MS` goes from 30 s to 90 s. A hang (30 s) plus a full wait stays inside the 180 s `testTimeout`. The loop already returns as soon as the socket appears, so a healthy restart costs no extra time.
2. **Retry the read.** A `describe-all` that the caller allows to be retried (`retryOnHang`) and that fails with `No translation object` waits 3 s and tries once more, including when that error comes from the retry after a restart. Bounded reads from a polling wait are left alone. Check `a11y.ts` for how they treat the error first.
3. **Recover after a failed test.** In the `afterEach` in `setup.ts`, after the capture, when the test failed: call `relaunch()` from `driver/app.ts`. It keeps the session and clears any sheet or Home Screen state. If it throws, log a warning and carry on, so a failed recovery never masks the test's own failure. Log one line per recovery so a run that needed it stands out.

## Not in this change

- **No `retry` in the vitest config.** A real intermittent bug would turn green, and vitest 2 can't limit retries to environment errors. Revisit only if a run with this change is still red from single transient failures.
- **No change to `throw` versus warn in `restartCompanion`.** The retry already fails with a clear error, and `sim.ts` and `app.ts` also call it.
- **No suite rewrites, no CI workflow change, no runner or Mac change.**

## Known cost

A test that relies on the screen a failed test left behind now starts from Home and may still fail. That only happens on a run already red. Some tests in 06 start this way, so a failure can still take a neighbour with it; it should no longer take the whole file.

## Check

- Unit tests with a fake `run`: the 90 s wait, returning as soon as the socket appears, the `No translation object` retry and its one-retry limit, a non-retryable read still throwing.
- A unit test or small extraction for the `afterEach` recovery: relaunch runs on failure, doesn't run on a pass, and a throw from it is swallowed.
- The standard checks in `_rules.md`.
- One `e2e` run on the PR, read for `idb companion` warnings and recovery lines. It has to be green to merge, like any other PR.
