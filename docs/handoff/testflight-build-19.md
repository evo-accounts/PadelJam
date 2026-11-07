# One new iOS build for TestFlight (onboarding redesign)

Written 2026-11-05 by Release & Ops for [PAD-127](/PAD/issues/PAD-127). Purpose: one build from `main` so the device pass ([PAD-32](/PAD/issues/PAD-32)) runs on the onboarding redesign instead of build 18 (`8a7d62f`, 2026-10-07). I ran nothing: no `eas`, no console, no hosted request. A build and a submit are gate 1.

Everything below was checked against `origin/main` at `ac3a53b`. Re-run section 2's checks if `main` has moved on a lot by the time you build.

## 0. Before you start (the order matters)

1. **The privacy line has merged to `main`** ([PAD-64](/PAD/issues/PAD-64) / [PAD-126](/PAD/issues/PAD-126)). The new build collects Level (`profiles.level`), so it shouldn't reach testers before the privacy text is settled.
2. **You're on the Mac that is logged into EAS as the `evo-studio` owner** (`eas whoami` shows it).
3. `main` is what you build, so start from a clean checkout of it.

## 1. The steps

All commands run in a terminal on your Mac. The build itself happens on Expo's servers (EAS cloud build), so Xcode and the simulator are **not** needed, and the shared runner isn't touched. You do need `eas-cli` 5.9 or newer.

**Step 1. Get `main`, clean.**

```bash
cd ~/padeljam            # your checkout of the repo
git fetch origin && git checkout main && git pull --ff-only
git status               # expect: nothing to commit, working tree clean
pnpm install --frozen-lockfile
```

Expect: no errors. If `--frozen-lockfile` fails, `main`'s lockfile is out of step; stop and comment on the task.

**Step 2. The two checks that don't need the hosted project.**

```bash
pnpm lint && pnpm typecheck && pnpm tokens:check && pnpm i18n:check && pnpm size:check
node scripts/verify-production-env.mjs
```

Expect: every line passes and `verify-production-env` prints `✓ mobile:production`. If one fails, don't build; comment with the output.

**Step 3. Confirm hosted is ready.** `schema:check` talks to the hosted project, so run it yourself (agents can't):

```bash
pnpm schema:check
```

Expect: passes and reports no missing migration, in particular `0148` (`profiles.level`). If it names a missing migration, **don't build**: see section 2, migrations.

**Step 4. Log in and build.**

```bash
cd apps/mobile
eas whoami                                   # expect: your EAS account (owner evo-studio)
eas build --profile production --platform ios
```

Expect: EAS asks about credentials only if they're missing (answer yes to let it manage them; Apple will ask you to sign in and may send a 2FA code). Then it prints a build URL and queues. `appVersionSource` is `remote` and `autoIncrement` is on, so EAS picks the next build number itself (expect **19**); you don't edit anything. Free-tier queues can be slow.

If it fails:
- **"Run script / bundle" failure in the log.** Open the build URL, "Run fastlane" phase → "Bundle React Native code and images". That is Metro, and it is the one place the earlier `@2x` break showed up (it passed lint and typecheck, and failed only here). On `main` today no code requires an `@2x` name (checked: `git grep "@2x"` in `apps/mobile` finds none outside the asset files, and the 11 files in `assets/onboarding/` are `@2x`-named, which Metro resolves from the base name). If a new failure names an asset, copy the error into a comment; don't try to fix it.
- **Credentials or provisioning error.** Run `eas credentials --platform ios`, choose the production profile, and let it repair the distribution certificate and provisioning profile. If Apple says the account has a pending agreement, accept it at developer.apple.com first.
- **Anything else:** copy the last 40 lines of the build log into a comment.

**Step 5. Submit to TestFlight.** This is the other gate-1 action.

```bash
eas submit --profile production --platform ios --latest
```

Expect: it uses `ascAppId` 6783917190 from `eas.json`, uploads, and prints "Submitted your app to Apple App Store Connect". If it says the app record isn't found, `ascAppId` doesn't match a live app: open App Store Connect → Apps and check the app's Apple ID (**this has never been verified**, gap I15). If it asks for an App Store Connect API key, say yes to generate one.

**Step 6. Wait for Apple, then add testers.** In App Store Connect → the app → TestFlight, build 19 shows "Processing" for roughly 10–30 minutes, then may show **Missing Compliance**: the app already declares `ITSAppUsesNonExemptEncryption: false`, so it shouldn't, but if it appears choose "None of the algorithms mentioned above". Then:
- **Internal testers** (people in your App Store Connect team, up to 100): add them to an internal group. No Apple review. This is enough for the device pass.
- **External testers** need Beta App Review (see section 3). Skip them for this pass.

**Step 7. Install and start PAD-32.** Open TestFlight on the iPhone, install build 19, and run the device pass.

**When you're done:** comment on PAD-127's follow-up (or the founder task you were given) with the build number and "build 19 processed", or the failing step and its output.

## 2. What else has to be in place since build 18

I compared `8a7d62f..origin/main` (125 files).

| Thing | Answer | How I checked |
|---|---|---|
| **Migrations** (0145 to 0148) | **Nothing to apply, on the evidence of the last workflow run.** The "Supabase migrations" run on 2026-11-05 13:16 UTC (run 42034340226, on `0a9ad1e`, which contains all four) logged "Remote database is up to date" in both the dry run and the apply step. Step 3's `schema:check` confirms it directly. `0148` (`profiles.level`) is the one that matters: a build that selects `level` fails on a database without it. Of the four, `0145` is held by the workflow because it drops the old `auth_providers` view; it's already applied, and build 19 doesn't read the view (build 18 was already the first to stop using it). | `git diff --name-only 8a7d62f..origin/main -- infra/supabase/migrations`, workflow run log, `.github/workflows/supabase-migrations.yml` |
| **Edge functions to redeploy** | **None.** No file under `infra/supabase/functions/` changed since build 18. | `git diff --name-only 8a7d62f..origin/main -- infra/supabase/functions` is empty |
| **Secrets / env** | **None new.** `eas.json` production env is unchanged since build 18 (URL, publishable key, Stream key, Sentry DSN), and `verify-production-env` in Step 2 validates it. No new `EXPO_PUBLIC_*` variable appears in the diff. | `git diff 8a7d62f..origin/main -- apps/mobile/eas.json` is empty |
| **Native changes** | **None.** `apps/mobile/app.json`, `plugins/`, `metro.config.js` and every `package.json` under `apps/mobile` and `packages/` are unchanged, apart from the root `package.json` test script. No native dependency was added. The new files are JS, strings and image assets. | `git diff --stat 8a7d62f..origin/main -- apps/mobile/app.json apps/mobile/plugins apps/mobile/metro.config.js pnpm-lock.yaml '*/package.json'` |
| **Could this go as an EAS Update instead?** | **Technically yes, and I advise against it.** `runtimeVersion` is `appVersion` (1.0.0), and nothing native changed, so build 18 would take an update. But it would put the redesign on every user of build 18 straight away, which is gate 1 and skips the TestFlight-only pass you chose. The new build is the right shape for this device pass. (An update also can't fix a Metro or native break; only a build finds those.) | `app.json` `runtimeVersion` |
| **Web** | Not part of this build. `apps/web` has changes since 10-07 (tokens, profile); web ships from `main` via Vercel when the CTO merges. Nothing to do here. | |
| **Android** | Not part of this. No Android build is made by these steps. | |

## 3. Store requirements for this build

- **Internal TestFlight testers:** no review, no listing, **no privacy label required.** The App Store privacy label is not published and doesn't have to be for internal testing.
- **External testers (Beta App Review):** Apple wants, at the first external build, beta app information: a description, feedback email, a contact (name, phone, email), review notes, and **sign-in details if the app needs them**. The app signs in by phone OTP, and no real SMS has ever been sent from the hosted project (`docs/handoff/sms-production-setup.md`), and the reviewer account doesn't exist (gap I5). So **external testing is blocked on a reviewer path** and isn't part of this task. A privacy-policy URL is asked for there too, and `/privacy` exists in `apps/web` (deployment unverified, gap X3).
- **Level privacy line:** the founder confirmed the privacy label isn't started ([PAD-65](/PAD/issues/PAD-65)) and shouldn't be published until there is a full data inventory. Internal TestFlight doesn't need it. It does need to be settled before anything public or external ships, which is why Section 0 step 1 puts the privacy line first.
- **Nothing new needed from Apple** that we don't have, assuming the Apple Developer membership is active and Apple hasn't posted a new agreement to accept (Step 4 covers that failure).
- **Unverified:** whether Apple Developer signing and capability state is healthy (gap I3) and whether `ascAppId` 6783917190 is live (I15). Step 4 and Step 5 are where that would show.

## 4. Time

- **Your hands-on time: about 25–35 minutes** spread over the day: ~10 min for Steps 1–3 (install plus checks; `schema:check` adds under a minute), ~5 min to start the build and answer credential prompts, ~5 min to submit, ~5 min to add testers and install.
- **Waiting:** EAS cloud build **15–40 minutes** (longer if the queue is long), upload a few minutes, Apple processing **10–30 minutes**. In total about **1 to 1.5 hours** from Step 4 to the build being installable, during which you needn't watch.
- **If a credentials problem or a Metro failure turns up** (the realistic risk: nothing in this repo has run a production iOS build since 10-07, and the onboarding assets are new): add a fix and a second build. Allow another half day, mostly an engineer's.
