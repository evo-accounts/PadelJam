# State and next steps — 2026-09-20

Supersedes `2026-09-18-state-and-next-steps.md`, which is stale in its first line (it says
"7 of 11" and "no open PRs").

## Where main is

`0a0f610`. **The Community UX audit plan is COMPLETE — 11 of 11.** All twenty-four UX-COMM items
are implemented, from migration 0098 through the create task flow.

| PR | |
|---|---|
| #145 | Plan PR 8 — the two menus and the two forms (14, 15, 16, 17) |
| #147 | Plan PR 9 — managing groups and members (18, 19, 20, 21) |
| #148 | Plan PR 10 — invite, leave, archive (22, 23, 24) |
| #150 | Plan PR 11 — create and created (01, 02, 03) |
| #146, #149 | E2E concurrency: abandon superseded runs; stop a PR cancelling the weekly |
| #151 | The VoiceOver notifications suite runs instead of being excluded |
| #152 | `has_password` means a password was chosen (migration 0101) |

## Hosted is current

**0098, 0099, 0100 and 0101 are all applied AND recorded** in `supabase_migrations.schema_migrations`,
each verified by a query against the objects rather than the version rows. The service-role key has
been rotated. `ascAppId` is in `eas.json`, so TestFlight is unblocked.

Verify hosted on the OBJECTS, never the version table: locally, 0100's effects exist while its
`schema_migrations` row does not, so that table is not evidence.

## Open

### 1. A device pass — USER ONLY to start, and overdue

**Nothing has run on real hardware since #129.** That is now around twenty PRs, including the whole
community preview, all five tabs, both review surfaces, the two header menus, Manage Groups, the
merged roster, the invite rewrite and the create task flow.

Several of those are precisely what a simulator does not test honestly: the native share sheet,
clipboard, photo-library permissions for the new QR download, `expo-media-library` writes, keyboard
behaviour behind pinned footers, and the app's first swipe gestures (`SwipeRow`).

Nothing blocks it any more. Each further PR widens the net for attributing a hardware-only
regression.

### 2. `seed:demo` does not complete

Diagnosed, not fixed, and filed as its own task. `join_event` closes **six hours before** a start
(`0047_roster_rpcs.sql:14`), and the demo seed dates E3 (in-progress) and E4 (completed) at or
before now, then tries to join players to them. It cannot work as written; it could only ever have
run in a narrow window on the day it was authored.

`fix/seed-password-path` fixes a separate expiry in the same file — `isoIn`'s base was a hardcoded
`Date.UTC(2026, 6, 1)` commented "no Date.now drift", but a hardcoded date does not drift, it
expires — which gets E1 and E2 seeding again. E3 onward still fails.

**Nothing in CI runs `seed:demo`**, which is why an expired date sat there unnoticed.

### 3. The arm64 migration

Deferred deliberately. Rosetta works, so this is insurance, not urgency — `brew install node@22 gh`
under `/opt/homebrew`, a full `pnpm install` (today's `node_modules` holds darwin-x64 binaries arm64
node cannot load), a CocoaPods reinstall, and a fix to `~/actions-runner/.path`, which still leads
with the dead Intel node. Half a session, no decisions. See the macOS 27 memory.

## Things worth not relearning

- **Verify the DEFECT, not the patch.** Three times this session a stale branch looked like
  unfinished work and turned out to be already on main: `password_weak` on web, and both of #92's
  VoiceOver defects. Two greps each; rebasing would have been hours re-landing existing code.
- **Read what LATER migrations did to an object.** 0003 defines `auth_providers` with
  `security_invoker = true`; 0097 flipped it to `false` because as an invoker view it read
  `auth.users`, died with 42501 before the `auth.uid()` filter, and had never returned a row.
  Restoring 0003 verbatim would have silently re-broken it.
- **A key's NAME is not its copy, and a namespace is part of the key.** `t('removeMember')` renders
  "Remove from community"; `seeProfile` and `orDivider` existed only in other namespaces and would
  have rendered raw keys at runtime. `i18n:check` catches the second, nothing catches the first.
- **`BottomSheet`'s own testID is not addressable** — it sits on a plain View. What reaches the tree
  is the derived `<testID>-close`, so grepping an artifact for the id HITS and looks like proof.
  Wait on a control inside the sheet.
- **`size:check` is a ratchet that fails when UNDER budget.** Any PR deleting a screen or hand-rolled
  styles trips it. One line, but it costs a CI round trip if discovered late.
- **CI's `check` job is EIGHT commands**, not the four that are easy to remember. The other four are
  `tokens:check`, `size:check`, `schema:check` and `test:functions`.
- **Pushing a branch is a claim on the E2E stack.** The runner is this same Mac, so a push starts a
  run on the machine a local run is using. Finish local runs before pushing.
- **A conclusion of `failure` with no failed step, no uploaded log and zero artifacts is an
  INTERRUPTED job, not a test failure** — a real failure leaves artifacts via the `if: failure()`
  upload. Re-run it rather than hunting a bug.
- **Never pipe the e2e runner through `tail`.** The pipe swallows the exit status and the harness
  reports success for a failed run. The same trap makes `cmd | tail; echo $?` report the pipe's
  status — it bit twice this session.
