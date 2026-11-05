# Raise the `starter` limits for launch (D1 option A)

**Task:** PAD-178. **Decision:** D1 option A (founder, PAD-142).
**Branch:** `feat/starter-launch-limits`. **Owner:** Engineer A. **Approved by:** CTO.

## The change

| `starter` limit | Now | New |
|---|---|---|
| `members_per_community` | 10 | 250 |
| `groups_per_community` | 1 | `null` (unlimited) |
| `recurring_events` | 1 | `null` (unlimited) |
| `co_organizers` | 0 | 3 |

`basic`, `community_pro` and `club` don't change. Neither do `plan_features`: a Starter community stays template-only for blasts (`blasts.test.mjs` D6).

## Why this is one small migration

`plan_limits` is the only store of limits. `community_limit()` (`0014:43`) reads it live through `community_plan()`, and no community holds its own copy. So one write covers every existing Starter community, with or without a `community_subscriptions` row. No per-community backfill is needed.

All the enforcement already treats `null` as unlimited, because `community_pro` relies on it: `enforce_group_cap` (`0017:11`), `enforce_recurring_events_cap` (`0045`), `enforce_member_caps` (`0098:47-66`) and the "can create group" checks (`0098:318`, `0099:488`). **Don't change any function or trigger.**

## Steps

### 1. Migration

Add `infra/supabase/migrations/0152_starter_launch_limits.sql`. Open branches already claim 0149, 0150 and 0151, so rebase on `main` before opening the PR and rename the file if a merged migration has taken the number.

- Upsert the four rows, so a row missing on hosted can't leave a limit silently unset:
  `insert into plan_limits (plan_id, limit_key, value, mvp) values ... on conflict (plan_id, limit_key) do update set value = excluded.value;`
  `dimension` defaults to `community`.
- End with a `do $$` self-check that raises unless all four Starter values match, and unless Basic (50, 3, 5, 1) and Community Pro (250, null, null, 3) are as they were. Compare with `is distinct from`, because `null` is a valid value. Check for the row too: a missing row and a `null` value both read as unlimited through `community_limit_for_plan`.
- The header comment states what no longer holds, since the older migrations can't be edited:
  - 0104's "upgrades cannot be tripped": Starter is now looser than Basic, so Starter → Basic can be refused with `plan_downgrade_over_limit`.
  - 0104's "Starter is one admin, no co-organizers".
  - Starter and Community Pro now have equal limits, so the downgrade guard can't refuse a move to Starter from any plan the app can set.
- No `delete from`, `drop` or `truncate`, so the workflow's scan doesn't hold it. It adds no column or RPC, so the `schema:check` deadlock doesn't apply.

The self-checks in 0098 and 0104 assert `co_organizers = 0` at their own point in the order, before 0152 runs, so they still pass on a fresh reset. Leave them alone.

### 2. Registry

`packages/features/src/registry.ts:54`:
`limits: { members_per_community: 250, groups_per_community: null, recurring_events: null, co_organizers: 3 }`.
Update `registry.test.ts`.

### 3. E2E and demo seeds (not listed on the task, and every suite depends on them)

Both seeds abort on a mismatch against `EXPECTED_LIMITS`, so leaving them makes **every mobile E2E suite fail at seed**.

- `infra/seed/seed-e2e.mjs:96` and `infra/seed/seed-demo.mjs:93`: update the Starter entries. Use `null` for groups and recurring if you add them. The strict comparison at `seed-e2e.mjs:115` and `seed-demo.mjs:109` already tells `null` from a missing row (`undefined`).
- `seed-e2e.mjs:410`: `assertGroupCapEnforced(commS, 'carla')` proves the cap bites on a community at its Starter cap. Starter has no group cap now, so the probe would create a group and throw. Move the probe to a **Basic** community that sits exactly at 3 groups at that point in the seed (community A or R, whichever is at the cap: confirm, the comments disagree), with its owner. Keep the proof; don't delete it.
- Correct the comments that state the old cap: `seed-e2e.mjs:323-326`, `:398-404`, `:409`, `seed-demo.mjs:336` and `:346`, `apps/mobile/e2e/fixtures/seed.ts:20` and `apps/mobile/e2e/README.md:294-300`. Community S remains a valid "Starter with one group" fixture, so `gS` stays.
- `infra/seed/audit/communities.ts:55` is comment-level too: Basic there is harmless, so leave the fixture and fix the wording if it is now false.

Then run the E2E seed against the local stack and paste the result in the hand-off: the `reference data OK` line and a clean seed end. A clean end means the probe was refused on the Basic community, because the probe throws otherwise.

### 4. Database tests

Don't delete a guard's coverage because Starter no longer trips it. **Retarget it to Basic**, which is still tight.

| File | Change |
|---|---|
| `community_join.sql` | Fill to 250 (`generate_series` fixture inserts as postgres, in the test's transaction), then the 251st `join_community` is refused. Acceptance 1. |
| `caps.sql` | Starter: a second group now succeeds; three promotions succeed and the fourth is refused (three co-organizers = four admins, by the "beyond the first" reading in `0098:58-66`). The 0017 regression ("archiving frees a slot") moves to a Basic community at 3 groups. Acceptance 2. |
| `event_caps.sql` | Add: a Starter community creates two recurring series. The Basic cap of 5 stays as it is. Acceptance 2. |
| `community_manage.sql:29-46` | Second admin on Starter is allowed; the refusal is the fifth admin. Check what the following Basic section still proves, and keep a Basic refusal. |
| `community_roles.sql:38-77` | The "one admin despite limit 0" test and its `fixture drift` check are about a limit Starter no longer has. Move it to the reading it protects: co-organizers count beyond the first, at the new limit. |
| `plans.test.mjs` | Every "refused → Starter" case moves to Basic. See below. |

`plans.test.mjs` cases to rework, all of which now fail:

- `any admin can set the plan` (line 45): the second-admin refusal and its comment.
- `a downgrade is refused while the community exceeds Starter limits` (line 76): already covered by the Pro → Basic group test, so drop it only if that one covers it fully; otherwise retarget.
- `...exceeds the Starter member cap` (line 89): retarget to Pro → Basic with 51 members. Creating 51 users through the auth API is slow, so insert the members as the service role.
- `a downgrade is refused while ... more co-organizers` (line 189): Basic's limit is 1, so use 2 co-organizers refused on Basic, accepted after a demotion.
- `an upgrade is never refused` (line 168): keep it for Basic → Pro, and reword the comment above it. Add a test that **pins** the new fact: a Starter community with 4 groups asking for Basic gets `plan_downgrade_over_limit`.
- `a sole-admin community is never blocked`: still valid, check its comment.

Also add a test for acceptance 4: read Basic and Community Pro from `plan_limits` and assert all eight values.

Other test files say "Starter allows one group" in comments above fixtures that pay for Basic or Pro (`archive-guard`, `community-archive`, `community-entry`, `community_permission_toggles`, `event_blasts`, `explore_events`, `explore_groups`, `group_create`, `profile-reads`, `public-community-read`, `update_event`, `community_review_gate`). Those fixtures still pass, so **correct the comment and leave the fixture**. No logic changes there.

### 5. Client code and copy

No logic change. The caps reach clients as server errors, which still fire on Basic. `PlanSection` renders `null` as unlimited already. PAD-179 hides the plan surfaces on its own branch (`feat/hide-plans-for-launch`), so **don't touch the UI, or the upgrade prompts**. The only edit here is if `planSection.test.ts` asserts an old Starter number.

## Checks before hand-off

`pnpm lint && pnpm typecheck && pnpm tokens:check && pnpm i18n:check && pnpm size:check && pnpm test && pnpm test:functions && pnpm test:db`, each with its real exit status, on a fresh `db reset`. Also the E2E seed locally (step 3).

## Hosted

No hand-off to the founder. The migration reaches hosted through the `Supabase migrations` workflow on merge. **This is an early real migration through that path:** the CTO reads the PR's `Migration check` and the post-merge `Apply to hosted database` job closely. No edge function changes. The registry only feeds surfaces that PAD-179 hides, so nothing needs an EAS build for this to work: the server enforces the new limits as soon as the migration applies, including for builds already installed.

## Known consequence, accepted for launch

**Basic is now tighter than free Starter** (50 members, 3 groups, 5 series, 1 co-organizer, against 250, unlimited, unlimited, 3). The founder's acceptance says Basic is unchanged, so this plan keeps it. Any community already on Basic keeps the lower limits, while PAD-179 hides the screen it would use to move. The CTO raises this on PAD-178. Don't add a data change for it here.

## Out of scope

- Stopping paid plans being self-granted: PAD-158.
- Hiding plan surfaces: PAD-179.
- Blasts: PAD-180.
