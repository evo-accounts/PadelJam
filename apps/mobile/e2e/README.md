# Mobile E2E suite

Automated end-to-end tests for the PadelJam iOS app, driven through the iOS Simulator
against the **local Supabase stack**. No Maestro/Detox — a small TypeScript driver over
`xcrun simctl` + [fb-idb](https://fbidb.io) (touch/text injection and `describe-all`
accessibility snapshots), run by vitest.

The web app has its own separate end-to-end suite (Playwright) at
[`e2e-web`](../../../e2e-web/README.md).

## Prerequisites

- Docker running, local stack up:
  `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@2.117.0 --workdir infra start`
  (pinned to the version in the workflow's `SUPABASE_CLI_VERSION`, see
  `infra/supabase/README.md` for why; anything ≤2.75 pairs an ES256-signing GoTrue with an
  edge-runtime that only verifies HS256, so every `verify_jwt` edge function 401s locally).
- Repo-root `.env` with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (local keys).
- `apps/mobile/.env` pointing `EXPO_PUBLIC_SUPABASE_URL` at `http://127.0.0.1:55321`.
- Xcode (the runner exports `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`).
- idb client: `pip3 install --user fb-idb` (+ `idb_companion` from the facebook/fb brew tap).

## After a major Xcode upgrade, do this first

Xcode 27 landed on the build Mac on 2026-09-15 and broke the suite in five
separate places, each hidden behind the one before it. Every failure looked like
an app bug and none of them was. Work the list in order.

1. **`sudo xcodebuild -license accept`.** Until this is done `xcrun simctl`
   refuses everything and the job dies in 26 seconds. It also breaks the system
   `python3`, which is what the `idb` client runs on.

2. **Kill any running `idb_companion`.** It is a long-lived per-device process,
   and one started before the upgrade keeps running against stale framework
   handles: it answers every request and returns an EMPTY accessibility tree.

   ```
   [{"AXFrame":"{{0, 0}, {0, 0}}","AXLabel":null,"role":null,"type":null, …}]
   ```

   The app is fine — it launches, renders, and the failure screenshots show the
   right screen. But the driver is blind, so all 15 suites fail in `beforeAll`
   at `freshInstall` with `saw ""`, which reads like a stale session and is not
   one. `driver/idb.ts` respawns the companion, so killing it is enough.

3. **Rebuild `idb_companion` from upstream source.** Restarting it fixes
   READING. It does not fix INPUT: taps and swipes still fail with

   ```
   SimulatorKit is required for HID interactions: Attempting to load a file at path
   '…/Contents/Developer/Library/PrivateFrameworks/SimulatorKit.framework',
   but it does not exist
   ```

   Xcode 27 moved that framework to `Contents/SharedFrameworks`. Homebrew's
   idb-companion is pinned at v1.1.8 (2022), which hardcodes the old path, and
   **the formula cannot help you**: its `install` only unpacks a prebuilt
   universal tarball, so `--build-from-source` compiles nothing and `--HEAD`
   fails outright with `No such file or directory - bin/idb_companion`.

   facebook/idb itself is actively maintained — upstream had commits the same
   day, and `FBControlCore/Utility/FBWeakFramework+ApplePrivateFrameworks.swift`
   already prefers the new location and falls back to the old one. Build it:

   ```bash
   git clone https://github.com/facebook/idb.git ~/idb-build   # NOT under /tmp, see below
   /opt/homebrew/bin/brew install xcodegen protobuf            # NOT /usr/local/bin/brew, see below
   cd ~/idb-build && PATH="/opt/homebrew/bin:$PATH" ./build.sh build
   ```

   Then install the result and point the PATH entry at it, keeping the Homebrew
   keg intact so this is one command to undo:

   ```bash
   cp -R ~/idb-build/Build/Distribution/. /usr/local/lib/idb-companion-head/
   brew unlink idb-companion
   ln -sfn /usr/local/lib/idb-companion-head/idb_companion /usr/local/bin/idb_companion
   # to revert: rm /usr/local/bin/idb_companion && brew link idb-companion
   ```

   The binary finds its frameworks through `@executable_path`, so the whole
   Distribution directory has to stay together; a symlink to it is fine because
   dyld resolves the link first.

   Confirm both halves before rerunning the suite — reading and input fail
   independently, and only the companion log distinguishes them:

   ```bash
   idb ui describe-all --udid "$UDID" | head -c 200   # a real tree, not []
   idb ui tap 200 800 --udid "$UDID"                  # silence means success
   grep -E "SimulatorKit|hid succeeded" /tmp/idb/companion.log
   ```

   Two traps in those commands, both of which cost time here:

   - **Do not build under `/tmp`.** It is a symlink to `/private/tmp`, and
     XcodeGen's relative-path fixup doubles the prefix, so the build dies on
     `Unable to open base configuration reference file '/tmp/claude-501/tmp/…'`.
   - **Use `/opt/homebrew/bin/brew`.** This Mac has both: `/usr/local` is an
     x86_64 install running under Rosetta (`brew config` says
     `CPU: westmere`, `Rosetta 2: true`) and it is first in PATH, so a bare
     `brew install protobuf` tries to compile with `-march=westmere` and fails.
     The native arm64 install at `/opt/homebrew` does it in seconds. Same root
     cause as the `pnpm dlx` CLI-architecture incident in
     `.github/workflows/e2e-mobile.yml`.

   `idb_companion --version` is no help for any of this: its `build_date` is a
   constant baked into the source ("Aug 12 2022"), not the compile date.

   Only if a source build also fails should you install the previous Xcode
   alongside and point `DEVELOPER_DIR` at it for this job; the workflow already
   sets that variable.

4. **Pod deployment targets.** Xcode rejects any below its floor (15.0 for
   Xcode 27), and CocoaPods gives each pod's resource-bundle target the platform
   from its own podspec rather than the app's.
   `apps/mobile/plugins/withPodMinimumDeploymentTarget.js` raises them; if the
   floor moves again, raise `target` there.

5. **Expo's own Swift may not compile.** Xcode 27's Swift rejected a
   `@convention(c)` pointer formed inside a ternary in `expo-modules-jsi`. Expo
   fixed it in a patch release, pinned through `pnpm.overrides` in the root
   `package.json`. Check for a newer patch of the failing package before
   reaching for an SDK bump.

## Running

```bash
pnpm --filter mobile e2e                # preflight → build-if-stale → seed → all suites
pnpm --filter mobile e2e -- --suite 01  # one suite (prefix match on suites/)
pnpm --filter mobile e2e -- --build-only
pnpm --filter mobile e2e -- --no-build  # reuse the existing Release build
pnpm --filter mobile e2e -- --wait      # queue behind a running suite instead of failing
```

### Only one run at a time

There is exactly **one** target simulator and **one** local Supabase, and a run owns
both — it installs over the app, and `resetDb()` rotates every seeded id. Two
concurrent runs corrupt each other *silently*, and the symptoms look like app bugs:
a persona bounced to sign-in because its user id no longer exists, stray characters
typed into the other run's fields, 400/406s from queries holding ids that were just
rotated away. This has cost more than one debugging session.

So a run takes an exclusive lock at `/tmp/padeljam-e2e.lock` and a second one fails
fast, naming the holder's pid, age, suite and checkout. Use `--wait` to queue behind
it instead. A lock left by a killed run is detected as stale (dead pid, or a pid
reused by something that is not an e2e run) and reclaimed automatically — you should
never need to delete it by hand, but the error message tells you how if you do.

The orchestrator ([scripts/e2e/run.mjs](../../../scripts/e2e/run.mjs)) builds a
**Release** simulator app (embedded JS bundle — no Metro), installs it, wipes + reseeds
the DB, then runs vitest sequentially. Failure artifacts (screenshot, accessibility
dump, app log tail) land in `e2e/artifacts/<run>/<test>/`.

Env knobs: `E2E_UDID` (simulator), `E2E_IDB_PATH`, `E2E_STREAM=1` / `E2E_OAUTH=1` /
`E2E_PUSH_DELIVERY=1` (enable locally-blocked areas), `E2E_WAIT_TIMEOUT_MS`.

## In CI: a self-hosted macOS runner, not a hosted one

[`e2e-mobile.yml`](../../../.github/workflows/e2e-mobile.yml) targets
`[self-hosted, macOS, ARM64]`. **A hosted macOS runner cannot run this suite**, and
not for want of trying: hosted runners ship no container runtime, and they cannot
virtualize to add one —

```
kern.hv_support            → sysctl: unknown oid 'kern.hv_support'
colima start --vm-type=vz  → VZErrorDomain Code=2
                             "Virtualization is not available on this hardware."
```

Colima's qemu driver does work there, as pure software emulation, and it is far too
slow to be useful: **11.5 min** to boot the VM and **31 min** for `supabase start`
(2–3 min locally). Measured, not assumed — don't spend another day on it.

The runner machine needs exactly the **Prerequisites** above (Docker + the local
stack, Xcode, idb), because the workflow deliberately does not install or configure
any of them — `run.mjs` already resolves the simulator, boots it, and preflights the
stack and idb with actionable messages. The workflow only installs dependencies,
ensures the stack is up, writes the two `.env` files into its own workspace, and runs
the orchestrator with `--wait` so it queues behind a hand-run suite instead of going
red over a held lock. It does **not** run `supabase stop` afterwards, since that
would take down the stack you develop against.

### When it runs

- **Automatically on PRs** touching `apps/mobile/**`, `packages/**`, `infra/**`,
  `scripts/e2e/**` or the workflow itself. A paths filter, not a label — relying on
  someone remembering to add one meant `main` had no automated E2E at all.
- **Weekly**, Sunday 03:00 UTC. This answers a different question from the PR run:
  the CLI is pinned in the workflow (`SUPABASE_CLI_VERSION`), but the developer's own
  stack, Xcode, the simulator runtime and idb are not, and the pin gets bumped. This
  repo has been bitten by drift before — see the CLI ≤2.75 ES256/HS256 note in
  `infra/supabase/config.toml`, and the 2026-09-11 arm64/x64 dlx-cache incident in
  `.github/workflows/e2e-mobile.yml`.
- **On demand** via `workflow_dispatch`, which also takes a `suite` input to run one
  suite. Use this for anything the paths filter excludes.

Two things to know, since the runner is a developer's own Mac:

- **A run wipes the local database.** `resetDb()` rotates every seeded id. This is why
  the cron is weekly rather than nightly: it charges that cost once a week to answer a
  question that changes slowly.
- **A sleeping Mac queues the job rather than failing it**, so a 03:00 cron can
  actually start whenever the runner next comes online.

## Test data

`infra/seed/seed-e2e.mjs` (fork of seed-demo with **NOW-relative dates**) seeds 12
personas (password `Demo1234#`), 5 communities, groups, and events E1–E12 covering
scheduled/team/in-progress/completed/recurring plus error fixtures (join-cutoff, full,
private, review-gated, sole-owner). Suites call `resetDb('minimal'|'full')` in
`beforeAll`; the wipe preserves migration-seeded reference tables (`plans`,
`plan_features`, `plan_limits`, `blast_templates`). Email OTPs are read from Mailpit
(`:55324`); the phone test number `+351912345678` verifies with `123456`.

**The plan caps are live, and the seed sits inside them.** `plan_limits` used to be
truncated by the wipe, which made `community_limit()` return null for every key and
every cap read as unlimited — no plan limit was enforced in an E2E run at all. It is
preserved now, so the fixtures have to fit: `groups_per_community` counts the
auto-created general group, so a Basic community (A, R) holds it plus two more and a
Starter community (P, S) holds only it. The seed asserts the reference data before it
starts and proves the cap actually bites before it finishes; a suite that creates a
group or promotes a second co-organizer in A or C will now hit a real cap.

**Some states are unreachable through the RPCs alone.** Public group events
auto-invite every member, so a group member can only ever arrive at an event
*holding an invitation* — and an invitee sees Accept/Decline, never the
waiting-list, join-cutoff or partner-selection CTAs. `suppressInvitations()`
deletes those rows after the fact (same shape as the existing back-dating patch:
build through the RPC, then undo what it necessarily did). E9/E10/E12 use it;
E7/E6/E2 deliberately KEEP their invitations so the invitee path is covered too.
E9 also disables standby, because `event_capacity()` is
`num_courts * 4 + (allow_standby ? standby_spots : 0)` — with the default 2
standby spots a 5th player joins CONFIRMED (`is_standby`), never waitlisted.

## Writing tests

- Selectors: `{ label }` exact, `{ text }` substring/regex (against label+value),
  `{ type }` (`Button`, `TextField`, `Heading`…), `{ id }` (testID), `{ nth }`.
- Always assert via `waitFor`/`expectVisible` (they poll the AX tree); never sleep-and-hope.
- **Assert against the database, not the pixel**, wherever a test changes state.
  A control that animates but never writes looks identical on screen. Use
  `select()` from `fixtures/db.ts` with `pollUntil` from `fixtures/poll.ts`.
- **Assert the precondition too.** "X is a member after I tap Accept" passes
  vacuously if X was already a member — check they were not, and fail with
  "fixture drift" rather than green.
- **Read copy off a captured a11y tree, never from the source.** The i18n file
  interleaves language blocks per namespace, so grepping a key finds whichever
  namespace comes last (`nameLabel` resolves to the *event* namespace's "Event
  name"). Several tests have been written against strings that do not exist.
- `typeText` verifies the field value and retypes slowly on RN's fast-typing
  character drops; it clears a pre-filled field on its retry pass.
- **`tap()` fails on an element that is entirely off screen** rather than
  clamping onto whatever occupies that coordinate — `scrollUntilVisible` first.
  Partly-visible elements are tapped on their visible part, which is what makes
  cards in horizontal rails work.
- **RN `Switch` surfaces as an UNLABELED `CheckBox`** with AXValue `"0"`/`"1"` —
  not as type `Switch`, and with no text to match on, so address it by ordinal.
  Use `toggleSwitch`, which cycles tap positions/durations: a zero-duration tap
  at dead centre often does not actuate one.
- System dialogs: permission alerts are tappable via the normal selectors; the iOS
  "Save Password" sheet leaves an EMPTY AX tree — use `dismissSavePasswordSheetIfPresent()`.
- **The iOS "Use Strong Password?" sheet is a different beast** and does NOT empty
  the tree — it TRUNCATES it, dropping only what it covers (it is modal; the
  keyboard alone never does this). It appears the first time a secure field is
  focused on a screen shaped like a sign-up form (a field with a username-ish
  `textContentType` directly above a secure one — `autoComplete="email"` is
  enough), and it steals the keyboard: the first character lands and the rest are
  swallowed, so `typeText` sits at one bullet and exhausts its retries. Call
  `dismissStrongPasswordSheetIfPresent(field)` before typing; iOS does not
  re-offer once declined.
- **`Checkbox`'s testID names its Pressable** — the 22pt square alone when the
  box has no `label`, or the square plus a plain string when it has one. Nothing
  tappable may live inside it, so `tap({id})` is safe. It was not always: the
  create-account checkbox used to wrap its consent sentence, so the id named a
  row whose centre was the "Terms of Use" link, the tap left for Safari and the
  run died somewhere unrelated — with the links invisible in a snapshot (iOS
  aggregates a Pressable and its descendants), nothing warned you. The sentence
  is a sibling now. Still prefer `tapCheckbox`: it asserts the tick actually
  flipped, which a swallowed tap otherwise hides.
- **Dismiss every alert you raise.** A system alert empties the app's AX tree, so
  one left up does not fail the test that raised it — it breaks the NEXT test,
  with a navigation error that names nothing relevant. Some flows raise two (a
  confirm *and* a success notice).
- `freshInstall()` also resets the **keychain** (SecureStore sessions survive uninstall).

## Known issues encoded in the suite

- Post-OTP bounce (fixed at root): the app used to kick a freshly verified user back
  to sign-in because StreamChatProvider's wrapper changed shape with auth state and
  remounted the whole subtree, re-running Boot's splash routing. `loginAs` is
  single-attempt and fails loudly if a bounce ever reappears — do not add retries.
- QR/share deep links use `padeljam://` while the app scheme is `mobile://`.

## When a failure names something unrelated, suspect this

This harness's signature bug is an action that goes **silently wrong** and
detonates somewhere else entirely. Five instances, all fixed — each by making the
primitive fail loudly, and each deliberately refusing the "retry harder" variant
that would have reintroduced it:

| | went wrong silently | fixed in |
|---|---|---|
| `ensureTabs` | exhausted its pops and returned success | #19 |
| `scrollUntilVisible` | reported an off-screen element as visible | #26 |
| `tap` | swallowed mid-animation, on a still-moving view | #32 |
| `backGesture` | swiped into pager content, never popped | #34 |
| `tap` | clamped an off-screen element onto a *different* one | #40 |

The last is the clearest illustration: a Save button at `y=1213` was clamped to
`y=866`, which sat inside an image picker. The tap opened the iOS photo library,
and the run failed **80 seconds later** on an unrelated assertion. So: when a
failure message does not match the last action, look for a mis-landed
interaction before believing the message.

## Resolved: "JWT issued at future" — do not re-diagnose it

This failed roughly one run in three, always a different suite, always green on
re-run, and was misdiagnosed three times.

PostgREST validates `iat` against a **cached clock** that goes stale while idle.
It allows exactly 30s of skew (measured: `iat=now+30s` → 200, `now+31s` → 401)
and v14.15 exposes no knob to widen it. The condition is **self-healing** —
serving a request refreshes the clock — so `withJwtClockRetry` in
`packages/db/src/client.ts` retries once on `401` + `PGRST303` and absorbs it.
A full suite has since run green with 5 such rejections absorbed.

`scripts/e2e/probe-jwt-clock.mjs` reproduces it in minutes instead of 25-minute
runs. It needs a genuinely **idle** stack — any request refreshes the clock — and
refuses to start while a suite holds the lock.

Two things it disproved, recorded so they are not retried: the `Date` response
header does **not** track the JWT clock (a 327s-stale header while every token
was accepted), and PostgREST has **more than one** cached clock (concurrent
requests return alternating lags), so "staleness = failing k + 30" reasoning is
void.
