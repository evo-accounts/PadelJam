# State and next steps — 2026-09-17

Where the UX audit programme stands after the keyboard/layout thread, and what is queued.
Written at the end of the session that merged #136–#138.

## Where main is

`e013e0f`. **86/86 E2E, all 15 suites**, on the self-hosted runner. No open PRs.

That is the first fully green run since 2026-09-13 (`5309aa7`), when the suite was 78 tests.
It had been unrunnable entirely after the Xcode 27 upgrade, then 16 failures, then 10.

## What landed today

| PR | What |
|---|---|
| #136 | A tap must reach the control it was aimed at, keyboard or no keyboard |
| #137 | Seven hand-rolled scrollers become the `Screen` primitive |
| #138 | The round-tab strip is a row of chips, not a third of the screen |

Four of the bugs fixed were user-facing, not test problems:

- **Score entry during a live match.** The "Enter score" sheet is bottom-anchored, so an open
  keyboard covered it — and covered elements are ABSENT from the accessibility tree, not merely
  hidden. The score fields vanished and "Save score" sat at y=780 behind a keyboard topping out
  at y=590, on a sheet with nothing to scroll. Unreachable to VoiceOver outright.
- **Contact support filed no ticket, and Create password set none**, on a single tap.
  `keyboardShouldPersistTaps` defaults to `"never"`, so the first tap inside a ScrollView with
  the keyboard up is spent dismissing the keyboard and never reaches the child. The submit
  button is the last thing you touch after typing, so it took two taps and the first looked like
  nothing happened.
- **Invite members' CTA was unreachable** with the keyboard up, on a screen with no inert text
  anywhere to tap to dismiss.
- **The live screen gave away 140pt** of an 874pt screen to stretched round tabs.

## Open, in the order I would take them

### 1. The sign-in lookup races account creation — small

`apps/mobile/app/(auth)/sign-in.tsx:113` fires `lookupAuthMethods(value)` deliberately BEFORE
awaiting the OTP send, so the "Try another way" sheet has its answer ready. But the send CREATES
the account (`signInWithOtp` creates users by default). Lose the race and a brand-new user is
shown the methods of an account that came into existence a second earlier.

This is what made `01 auth > an identifier with no account gets the only-way-in state` flaky: it
passed 13/13 locally and in #136/#137 CI, failed once on #138, and passed on re-run. Same commit,
both outcomes.

Fix: `await` the lookup before starting the send. Costs one round trip. Makes the test
deterministic. Does NOT fix item 2.

### 2. `has_password` is wrong for every OTP user — design question, not a patch

**Measured, not inferred.** `POST /auth/v1/otp` for an unknown email creates the user AND writes
a 60-char bcrypt `encrypted_password`. Not null, not empty, and not a hash of the empty string
(`crypt('', hash) = hash` is false) — so no SQL can separate it from a password the user chose.
The hash is unguessable, so the user can never use it.

Both definitions read that as "has a password":

- `auth_providers.has_password` (migration 0003): `encrypted_password is not null and <> ''`
- `auth_methods_for` (migration 0096): same shape

So for every OTP-only user:

- **"Try another way" offers "Sign in with password"** — a guaranteed dead end.
- **`profile/change-password.tsx` shows "Change password"**, demanding a *current* password
  verified by `signInWithPassword`, instead of "Create password". That is the exact dead end
  that screen was built to close; it closes it only for users whose `encrypted_password` is NULL.
- **Suite 12's password test fakes passwordlessness** with `update auth.users set
  encrypted_password = ''` — a state no real user is ever in. The feature passes its test and
  may be unreachable in practice.

This is the mirror of the known social-signup gap (`docs/` history and session memory): social
users have `encrypted_password` NULL so the flag is correctly false; OTP users have a placeholder
so it is wrongly true. Wrong in both directions, for different populations, and neither can
actually use a password.

Fixing it needs an explicit record written wherever the app sets a password (create-account,
recovery, change-password) plus a decision about what to assume for existing rows. Worth settling
before more auth-adjacent work.

### 3. Community plan PR 5 — the main thread

`docs/audit/2026-09-14-ux-community-plan.md`. PRs 1–4 are merged. PR 5 is preview, rules
acceptance and joining: it replaces `join.tsx` and finally deletes `CommunityHero`. The largest
screen rebuild in the plan.

Depends on the cancel / decline / rules-acceptance RPCs from #129, and **nothing from #129 onward
has run on a real device** — only the simulator. PR 5 is the screen that makes rules acceptance
user-visible, so that is where a device-only problem would surface. Worth a TestFlight pass
around it. `ascAppId` is missing from `apps/mobile/eas.json`, which blocks that build.

## Outstanding for the user, not for Claude

- **Rotate the hosted service-role key and the personal access token.** Overdue; nothing else
  gates it.
- `.env.audit` is git-ignored and holds hosted keys plus `SUPABASE_ACCESS_TOKEN`. Never paste
  either into a chat transcript.

## Smaller open items

- Migrate the remaining hand-rolled scrollers? Done for eight in #137/#138 — all form screens now
  use `Screen`. No known stragglers.
- The ownerless "LG dois" community.
- The two consequences of migration 0098.
- `apps/mobile/e2e/suites/99-live-scroller-frames.e2e.ts` is committed (deliberately, against the
  `99-*` convention) and measures the live screen's frames. `e2e/README.md` documents how to run
  it: rename off the `99-` prefix, go through `run.mjs` for the lock, rename back.

## Things worth not relearning

- **Occlusion is ABSENCE.** A control the keyboard covers leaves the accessibility tree entirely
  — unreachable to VoiceOver, invisible to the driver, and a tap aimed there hits the keyboard.
- **Every selector in the E2E suite is existence-or-text.** A green run says nothing about where
  anything is. #137 nearly shipped a 155pt layout shift with all 85 tests passing. Suite 07's
  chip-height assertion is currently the only check in the suite that can see a layout move.
- **`Screen` sets `keyboardShouldPersistTaps="handled"`; a hand-rolled ScrollView does not.**
  That divergence was the whole bug in #136.
- A fresh worktree's `ios/` is git-ignored prebuild output and can predate a config plugin. Run
  `npx expo prebuild -p ios --no-install` after copying it, or lose a build to #131's
  deployment-target errors. Only CI prebuilds.
- The simulator and local Supabase on this Mac are shared singletons. Check
  `pgrep -f "node.*e2e/run[.]mjs"` and `/tmp/padeljam-e2e.lock` before any run or DB reset.
