# State and next steps — 2026-09-18

Where things stand after the session that merged #139–#144. Supersedes
`2026-09-17-state-and-next-steps.md`, which is now stale in its first line.

## Where main is

`1f66aad`. No open PRs. The community plan is at **7 of 11**.

Each PR was green on `check` and on the full E2E suite before merging; the last run was
**89/89 across 15 suites**. Note that main itself is never E2E'd: the workflow is
`pull_request`, `workflow_dispatch` and a *weekly* cron, deliberately (the file explains the
split). So the evidence for main is each branch's own green run against the same base, not a
run of the merge commits.

## What landed

| PR | What |
|---|---|
| #139 | The sign-in lookup no longer races the OTP send that creates the account |
| #140 | The community preview: the six-state machine, attribute cards, `CommunityHero` deleted |
| #141 | Migration **0100** — a non-member can read a public community; `community_member_count` |
| #142 | The five tabs stop hiding their own actions |
| #143 | Reviews gain a score distribution, sheet selectors and two empty states |
| #144 | Writing a review becomes a bottom sheet |

#139 closed the flake in `01 auth > an identifier with no account gets the only-way-in state`.
The cause was real: `signInWithOtp` *creates* the account, so firing the auth-methods lookup
alongside it meant the "Try another way" sheet sometimes described an account one second old.

## Open, in the order I would take them

### 1. The hosted paste backlog — 0098, 0099, 0100 — USER ONLY

Three migrations are merged to main and **not applied to the hosted database**. This account
cannot `link` or `push` (see session memory), so it is the dashboard SQL editor. Hosted was
healthy when last probed today.

This is first because it compounds and because **its failure mode is quiet**. Against hosted,
the preview's tabs render empty states that look like communities with no content, not like a
missing migration. That is the shape of the 0089 incident the E2E workflow comment cites, where
a migration that never reached the remote broke every sign-in and nothing caught it.

One mitigation is already in the code: the member count falls back to counting the roster when
`community_member_count` is absent, so About and the preview show a number rather than "—" on a
database without 0100. That is a patch over the gap, not a fix for it, and the next feature that
needs 0100 may have nothing to fall back on.

### 2. `ascAppId`, and a device pass — USER ONLY to unblock

`apps/mobile/eas.json` still has `"submit": { "production": {} }`. The id comes from App Store
Connect; a wrong value is worse than none, so this cannot be guessed.

**Nothing since #129 has run on real hardware** — eleven PRs, including the whole preview, all
five rebuilt tabs and both review surfaces. The 2026-09-17 doc already called for a TestFlight
pass "around PR 5"; PR 5 landed yesterday and PRs 6 and 7 have landed since.

### 3. `has_password` is wrong for every OTP user — needs a DECISION

Unchanged from the 2026-09-17 doc, which has the measurement. Summary: `POST /auth/v1/otp`
writes a 60-character placeholder `encrypted_password`, so both definitions of `has_password`
(`auth_providers` in 0003, `auth_methods_for` in 0096) read "has a password" for users who can
never use one. "Try another way" offers them a dead end, and `profile/change-password.tsx`
demands a current password instead of offering to create one.

The fix needs an explicit record written wherever the app sets a password, plus **your decision
about existing rows**. The three options, each wrong for someone:

- assume nobody has one — safe for OTP users, but drops current-password reauth for real
  password users;
- assume everyone with a hash does — the status quo, leaves the bug for existing OTP users;
- backfill from GoTrue's audit log — most accurate, but entries are pruned and it is an
  unsupported-schema read.

#139 removed the race that made this visible on a *first* sign-in. It did not fix this.

### 4. Community plan PR 8 — the main thread

`docs/audit/2026-09-14-ux-community-plan.md`. Member overflow sheet and admin settings sheet;
settings and permissions get close buttons and fixed save actions; permissions gains the two
toggles 0098 added, with their explanatory blocks.

Then PR 9 (manage groups, which does not exist yet, plus merging manage-members with the Members
tab and the last-admin rule), PR 10 (invite/leave/archive), PR 11 (create/created).

**PR 9 is partly done already.** UX-COMM-19's "requests entry stops being conditional on
privacy" was implemented for the *Members tab* in #142, because building a new entry with a
known bug in it to fix two PRs later made no sense. The manage screen still has the old
condition.

## Smaller open items

- **The stranded suite-00 fix.** The `sleepy-blackwell-494f6d` worktree holds three commits plus
  uncommitted changes to `BottomSheet.tsx`, `SheetHost.tsx` and `sheetApi.ts`, targeting the
  sheet-mid-dismiss flake. It cost a 40-minute re-run on #140 today. Unpushed.
- **`apps/mobile/ios` in this checkout cannot build.** Its Pods predate #131, so `xcodebuild`
  fails on five pods targeting iOS 9–13.4. CI and the E2E runner prebuild from scratch and are
  unaffected. Needs `npx expo prebuild -p ios --no-install` and a pod reinstall.
- The ownerless "LG dois" community (active, 1 member, nobody can manage it). Pre-existing;
  0098's trigger prevents recurrence but does not repair it. Needs a decision: promote the
  remaining member, archive, or leave.
- Rotate the hosted service-role key and the personal access token. Overdue.
- The two consequences of migration 0098 (account deletion refusable for a sole admin; the
  permission backfill resetting two toggles).

## Things worth not relearning

- **A testID only reaches the E2E tree on an element that is already an accessibility element.**
  A plain `View`'s testID is invisible to the driver. This cost a 40-minute run on #143, where
  the test waited 20 seconds for a chart that was on screen the whole time. Assert on content
  instead — it is the stronger assertion anyway.
- **i18next keys `_one`/`_other` off `count`.** A string interpolating two numbers pluralises the
  wrong one: "{{score}} stars, {{count}} reviews" shipped "1 stars" in three locales, past
  typecheck, lint, `i18n:check` and 270 unit tests. Only the E2E tree showed it.
- **Read the on-disk artifact before re-running E2E.** The failure names a directory under
  `~/actions-runner/_work/.../e2e/artifacts/<run>/`, and its `*-a11y.json` says which screen the
  app was really on. Wrong screen or an open sheet = flake; the right screen with the element
  missing = real. Two failures on #140 were diagnosable in a minute and both passed on re-run.
- **RLS returns an empty array, not an error.** An outsider reading a roster they may not list
  gets `[]`, which renders as a confident "0" for a community with fifty people. Distinguish
  "not allowed" from "none" explicitly.
- **`event_is_visible` backs every event surface in the app.** Widening it for one screen widens
  Explore, My Events, deep links and the detail screen at once. 0100 added a branch instead.
- The E2E suite and the local Supabase on this Mac are shared singletons. Check
  `pgrep -f "node.*e2e/run[.]mjs"` and `/tmp/padeljam-e2e.lock` before any run or DB reset.
