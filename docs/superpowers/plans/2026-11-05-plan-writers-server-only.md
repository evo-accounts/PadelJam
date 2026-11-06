# Plan: close the client-callable plan writers (PAD-158)

**Why.** QA's audit found that any signed-in user can call `set_account_plan`, and any community admin `set_community_plan`, to get a paid plan without paying. The founder chose option A on PAD-142: free launch, no plan screens, and paid plans can't be self-granted. Hiding the screens doesn't stop the call, so the server has to refuse it. What a self-grant unlocks today is custom blast text (`_blast_scope_can_customize`, 0124).

**Owner:** Engineer A. **Branch:** `fix/plan-writers-server-only`. **Then:** QA, then CTO review.

## Merge order: this is a gate

A migration goes live on merge. **This PR must not merge before the task that hides the plan screens** (PAD-136 opens it), or the visible upgrade buttons start erroring. Build and QA it now. The CTO holds the merge until the hide PR is on `main`. If the hide task lands first, there's nothing to wait for.

Builds already installed keep their buttons until they update, and those buttons show the generic error once this is live. That's acceptable before launch.

## Changes

1. **Migration, next free number on `main` when you open the PR** (0149 and 0150 are claimed by open branches):
   - `revoke execute on function set_account_plan(text) from public, anon, authenticated;`
   - `revoke execute on function set_community_plan(uuid, text) from public, anon, authenticated;`
   - A short comment: a plan is now written only by the service role, and the functions stay so the hidden client code still typechecks.
   - **Don't drop the functions** (`packages/api/src/plans/mutations.ts` and the generated types still name them, and the screens' code stays for billing). **Don't delete or update any subscription rows**: the workflow would hold a delete, and row cleanup is the CTO's follow-up after merge.
   - Don't touch `account_plan_of_caller` or `community_plan`; those reads stay.
2. **Test helpers in `infra/supabase/tests/lib.mjs`:** `setAccountPlan(userId, plan)` and `setCommunityPlan(communityId, plan)`, writing `subscriptions` / `community_subscriptions` with the service key. `free` and `starter` delete the row; anything else upserts it with `status: 'active'`, `provider: 'manual'`.
3. **`blasts.test.mjs`, `blast-recipients-privacy.test.mjs`, `discovery-departed-founder.test.mjs`** (9 calls): swap the RPC for the helper. What they assert doesn't change.
4. **`plans.test.mjs`** (34 calls):
   - Add: as a signed-in user, both functions fail with `permission denied for function`, on your own account and on a community you admin, and the plan read afterwards is unchanged. Anon is refused too.
   - Keep, using the helpers: the tests about what a plan grants (Basic bundling Jammer+ for its creator, and any test whose subject is the plan read).
   - Delete the tests whose only subject is the body of `set_*_plan` (who may call it, the downgrade guards, "upgrade never refused", "club not settable"): nothing can reach that code any more, so they would test nothing. The billing work brings back whatever it reuses. List the deleted test names in the PR.

## Not in this PR

- Hiding screens, removing client code, E2E suites: the hide task.
- Raising the free limits: its own task. It also touches `plans.test.mjs`, so expect a small rebase, and whoever is second rebases.
- The billing writer. Both functions use `auth.uid()`, so a webhook can't reuse them; their upsert also overwrites a non-manual row with `provider = 'manual'`. Both are for the billing work to solve.
- `Structure Files/CLAUDE.md`: rule 3 is already updated on this branch by the CTO.

## Acceptance

- QA's PAD-158 steps 1 and 3, run on a local stack, now return `permission denied for function`, and `account_plan_of_caller` stays `free`.
- A seeded or helper-written plan still grants its features: custom blast text still works for a Jammer+ organizer in `blasts.test.mjs`.
- `pnpm lint && pnpm typecheck && pnpm tokens:check && pnpm i18n:check && pnpm size:check && pnpm test && pnpm test:functions && pnpm test:db` all pass.
- The PR's `Migration check` is green and lists only this migration, with no destructive warning.

No user-facing strings change. No hosted hand-off: the migrations workflow applies it on merge.
