# EAS Dev-Build Setup (B5-EAS) — Design + Runbook

*Padel Jam • 2026-06-19 • Brainstormed design (config/ops)*

## Goal

Stand up EAS dev builds so the native-gated Group B work (B1 Apple sign-in, B4 real push) can be verified on
physical iOS + Android devices. This is the enabler for the rest of Group B. It is **config + an ops runbook**,
not app logic — so it skips the implementation-plan / subagent cycle.

## What ships in the repo (codeable now)

1. **`apps/mobile/eas.json`** — build profiles:
   - `development`: `developmentClient: true`, `distribution: internal` → an installable dev client on your own
     devices (has the `expo-dev-client` runtime; loads JS from the dev server).
   - `preview`: `distribution: internal` (release-mode internal build for testing).
   - `production`: store build (`autoIncrement` on).
2. **`apps/mobile/app.json`** — set a real bundle/package id (Apple sign-in's App ID binds to it):
   `ios.bundleIdentifier` and `android.package` → **`app.padeljam`** (reverse-domain of `padeljam.app`).
   `eas init` (run by you) then adds `extra.eas.projectId`.

## What you run (the runbook — needs your Expo login; not doable from here)

```bash
# from apps/mobile
npx expo install expo-dev-client     # SDK-56-aligned dev-client runtime (don't hand-pin)
eas login                            # your Expo account
eas init                             # creates the EAS project + writes extra.eas.projectId into app.json
eas build --profile development --platform ios       # → installable iOS dev client
eas build --profile development --platform android   # → installable Android dev client
# install both dev clients on the physical devices, then:
npx expo start --dev-client          # JS dev server the dev clients connect to
```

(Reference: `docs/superpowers/push-setup.md` for the downstream push-credential steps used later in B4.)

## Verification

- `eas build` succeeds for both platforms; the dev clients install and launch.
- In the running app: Stream chat connects; `Constants.expoConfig.extra.eas.projectId` is defined (so
  `registerForPush()` in `apps/mobile/lib/push.ts` no longer no-ops) and `getExpoPushTokenAsync` returns a
  token (registered via `register_push_token`).
- Commit `app.json`'s `extra.eas.projectId` after `eas init` writes it (so CI/other machines share the project).

## Notes / follow-ups

- The bundle id change (`app.padeljam`) means any pre-existing Apple App ID / dev provisioning must match;
  since this is a fresh setup, EAS will provision under the new id.
- B1 (Apple sign-in) will add the `expo-apple-authentication` plugin + the Sign In with Apple capability on the
  App ID for `app.padeljam`.
- `eas.json`'s `cli.appVersionSource: remote` keeps version/build numbers managed by EAS (avoids manual bumps).

## Out of scope

Push credentials (FCM/APNs) + prod DB push settings (B4); Apple Developer App ID + Services ID (B1); the actual
on-device verification pass (B5-verify).
