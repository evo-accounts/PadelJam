# Mobile E2E suite

Automated end-to-end tests for the PadelJam iOS app, driven through the iOS Simulator
against the **local Supabase stack**. No Maestro/Detox — a small TypeScript driver over
`xcrun simctl` + [fb-idb](https://fbidb.io) (touch/text injection and `describe-all`
accessibility snapshots), run by vitest.

## Prerequisites

- Docker running, local stack up:
  `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra start`
  (**use the latest CLI** — older CLIs pair an ES256-signing GoTrue with an edge-runtime
  that only verifies HS256, so every `verify_jwt` edge function 401s locally).
- Repo-root `.env` with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (local keys).
- `apps/mobile/.env` pointing `EXPO_PUBLIC_SUPABASE_URL` at `http://127.0.0.1:55321`.
- Xcode (the runner exports `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`).
- idb client: `pip3 install --user fb-idb` (+ `idb_companion` from the facebook/fb brew tap).

## Running

```bash
pnpm --filter mobile e2e                # preflight → build-if-stale → seed → all suites
pnpm --filter mobile e2e -- --suite 01  # one suite (prefix match on suites/)
pnpm --filter mobile e2e -- --build-only
pnpm --filter mobile e2e -- --no-build  # reuse the existing Release build
```

The orchestrator ([scripts/e2e/run.mjs](../../../scripts/e2e/run.mjs)) builds a
**Release** simulator app (embedded JS bundle — no Metro), installs it, wipes + reseeds
the DB, then runs vitest sequentially. Failure artifacts (screenshot, accessibility
dump, app log tail) land in `e2e/artifacts/<run>/<test>/`.

Env knobs: `E2E_UDID` (simulator), `E2E_IDB_PATH`, `E2E_STREAM=1` / `E2E_OAUTH=1` /
`E2E_PUSH_DELIVERY=1` (enable locally-blocked areas), `E2E_WAIT_TIMEOUT_MS`.

## Test data

`infra/seed/seed-e2e.mjs` (fork of seed-demo with **NOW-relative dates**) seeds 12
personas (password `demo1234`), 5 communities, groups, and events E1–E8 covering
scheduled/team/in-progress/completed/recurring plus error fixtures (join-cutoff, full,
private, review-gated, sole-owner). Suites call `resetDb('minimal'|'full')` in
`beforeAll`; the wipe preserves migration-seeded reference tables (`plans`,
`plan_features`). Email OTPs are read from Mailpit (`:55324`); the phone test number
`+351912345678` verifies with `123456`.

## Writing tests

- Selectors: `{ label }` exact, `{ text }` substring/regex (against label+value),
  `{ type }` (`Button`, `TextField`, `Heading`…), `{ id }` (testID), `{ nth }`.
- Always assert via `waitFor`/`expectVisible` (they poll the AX tree); never sleep-and-hope.
- `typeText` verifies the field value and retypes slowly on RN's fast-typing character drops.
- System dialogs: permission alerts are tappable via the normal selectors; the iOS
  "Save Password" sheet leaves an EMPTY AX tree — use `dismissSavePasswordSheetIfPresent()`.
- `freshInstall()` also resets the **keychain** (SecureStore sessions survive uninstall).

## Known issues encoded in the suite

- Post-OTP bounce (fixed at root): the app used to kick a freshly verified user back
  to sign-in because StreamChatProvider's wrapper changed shape with auth state and
  remounted the whole subtree, re-running Boot's splash routing. `loginAs` is
  single-attempt and fails loudly if a bounce ever reappears — do not add retries.
- QR/share deep links use `padeljam://` while the app scheme is `mobile://`.
