# Onboarding screenshots from the E2E run

**Why:** every onboarding PR must show its frames in en and pt-BR, and the CEO has ruled that PR 2 and PR 3 don't merge until someone has seen the shell rendered (PAD-18). No agent account on this Mac has a simulator. The E2E job does, but it only keeps screenshots of failures.

**Approach:** one new test-only suite saves the frames during every `e2e` run. They stay in the runner's local artifacts directory, so the founder only has to copy a folder. No workflow edit.

## Build

New file `apps/mobile/e2e/suites/02-onboarding-screens.e2e.ts`. For each locale, `en` then `pt-BR`:

1. `resetDb('full')`, `freshInstall()`, and set omar's `profiles.locale` in the DB. Omar is seeded not-onboarded.
2. `loginAs('omar')`, then `relaunch()` so the app re-reads the locale. `apps/mobile/app/_layout.tsx` reads `profiles.locale` once, at startup, and only when a session exists, so logging in alone leaves it on the device language.
3. Walk location → manual location → hand → side → notifications, without tapping Skip. Before each `screenshot()`, assert that frame's title in that locale.
4. Save to `join(CONFIG.artifactsDir, 'onboarding-screens', '<locale>-<frame>.png')`, with frame `location`, `location-manual` (keyboard open), `hand`, `side` or `notifications`. That is 10 files.

Take the strings from the `onboarding` JSON for each locale instead of hardcoding them, so PR 2 and PR 3 only have to change the frame list. Set status bars with `overrideStatusBar()`, as suite 00 does. Reuse the existing driver helpers; a small `updateRow`-style helper in `fixtures/db` is fine if none exists.

Hand and side have role `radio`, and the suite only needs to select one to enable Continue. Use whatever selector `02-onboarding` uses.

## Not in scope

- No app code, workflow or `run.mjs` changes.
- No changes to `02-onboarding.e2e.ts`.
- No assertions on layout: the images are for people to look at.

## Done means

- [ ] Hand-off checks pass, including `pnpm typecheck` (it covers `e2e/tsconfig.json`).
- [ ] `e2e` is green on the pushed head, and the job log shows the new suite ran its tests rather than skipping them.
- [ ] Nothing outside the plan and the suite (and the small DB helper, if needed) has changed.
