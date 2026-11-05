# Plan: hide every plan and upgrade surface for launch (PAD-179)

**Why.** The founder chose D1 option A (PAD-142): the app launches free, with no plan or upgrade screens. The settings paywall shows prices and a trial, and its button grants Jammer+ without payment. The billing code stays, behind one constant.

**Owners, on one branch, `feat/hide-plans-for-launch`:**
1. Engineer A: the constant and web (Parts 1 and 2). Pushes, then hands to Engineer B.
2. Engineer B: mobile and the E2E suites (Parts 3 to 5). Opens the PR, then QA, then CTO review.

No migration and no edge function, so there is no hosted hand-off. Web goes live on merge. Mobile reaches users with the next build.

## Merge order: this is a gate

PAD-158 (`fix/plan-writers-server-only`) revokes `set_account_plan` and `set_community_plan`, and its migration goes live on merge. **It merges with this PR or straight after, never before.** The CTO holds that merge. PAD-178 (the new `starter` limits) can merge at any time.

## Part 1: the constant (Engineer A)

In `packages/features/src/registry.ts`:

```ts
/** Plan and upgrade UI, off for the free launch (D1 option A). Billing turns it back on. */
export const PLANS_VISIBLE: boolean = false;
```

The `: boolean` annotation is required. Without it, TypeScript narrows the type to `false` and treats the visible branches as unreachable.

The web app doesn't depend on `@padel/features` yet. Add it to `apps/web/package.json` as `workspace:*`, add it to `transpilePackages` in `apps/web/next.config.*`, and update the lockfile.

## Part 2: web (Engineer A)

| File | Change |
|---|---|
| `components/community/UpgradePrompt.tsx` | With the flag off, the dialog's title is a new key `upgradeLimitTitle` and its body is the `title` prop (the limit). The `canManage` and `body` lines about changing a plan aren't shown. The button stays OK. |
| `components/event/manage/BlastComposer.tsx` | Don't render the locked "Customize your blast" button (`blast-customize-locked`) with the flag off. The Templates list stays. |
| `app/(app)/app/event/[id]/manage/blast/page.tsx` | No change needed: its prompt only opens from that button. Leave it in place. |
| `event-create/page.tsx`, `manage/page.tsx`, `EventEditDialog.tsx` | No change needed: they all go through `UpgradePrompt`. |

**Limit errors outside the prompt.** `packages/api/src/client.ts:85-86` turns the member and co-organizer limits into `community_full` and `co_organizers_limit_reached`, and neither key is in `i18n-web.ts`. Check what web shows for both. If a path shows a raw code or a generic error where a limit was hit, add the key in all three locales. Say in the hand-off what you found.

**Copy in `apps/web/src/lib/i18n-web.ts`:**

| Key | pt-PT | pt-BR | en |
|---|---|---|---|
| `upgradeLimitTitle` (new) | Limite atingido | Limite atingido | Limit reached |
| `upgradeRecurringCap` | Esta comunidade atingiu o limite de eventos recorrentes. | Esta comunidade atingiu o limite de eventos recorrentes. | This community has reached its recurring event limit. |
| `groups_per_community` | Atingiste o limite de grupos. Arquiva um grupo para adicionar mais. | Você atingiu o limite de grupos. Arquive um grupo para adicionar mais. | You've reached the group limit. Archive a group to add more. |
| `blast_customization_required` | Não é possível personalizar este comunicado. Envia o modelo tal como está. | Não é possível personalizar este comunicado. Envie o modelo como está. | This blast can't be customised. Send the template as it is. |

`pnpm i18n:check` scans mobile only, so check every new or changed web key by hand in all three locales.

`apps/web` has no unit test setup, and this task doesn't add one. Web is verified by QA in the browser (see Verification).

## Part 3: mobile screens (Engineer B)

| File | Change |
|---|---|
| `components/community/UpgradePrompt.tsx` | Show "See plans" only when `canManage && PLANS_VISIBLE`; otherwise OK, which closes. This one change covers community join, `MembersList`, `GroupCreateScreen`, event create, `RecurringCapPrompt` and `EventEditSheet`. `wizard/draft.ts` only mentions the prompt in a comment, so it needs no change. |
| `app/profile/settings.tsx` | Don't render the Subscription group with the flag off. |
| `lib/useCommunityMenu.ts` | Drop the `plan` row ("Community plan") from the admin menu with the flag off. **This row and the next one aren't in the task's list, but they are plan surfaces.** |
| `app/event/[id]/blast.tsx` | Don't render `lockedCard` with the flag off (line 355). Its `blastLockedBody` says plans are "enabled on request". The prompts below it then can't open, so leave them. |
| `app/profile/plan.tsx` | With the flag off, `<Redirect>` to `/profile/settings`, so a deep link can't reach the paywall. |
| `app/community/[id]/manage/index.tsx` | With the flag off, `<Redirect>` to `/community/[id]`. |
| `app/(onboarding)/jammer-plus.tsx` | With the flag off, `<Redirect>` to `/(onboarding)/notifications`. Keep the route registered. |

Put each redirect in a small wrapper, so the existing component's hooks aren't called conditionally.

**Copy in `apps/mobile/lib/i18n-mobile.ts`, changed in place** (the keys keep their names; git has the old copy for billing):

| Key | pt-PT | pt-BR | en |
|---|---|---|---|
| `upgradeGroupsCap` | Esta comunidade atingiu o limite de grupos. | Esta comunidade atingiu o limite de grupos. | This community has reached its group limit. |
| `upgradeMembersCap` | Esta comunidade está cheia. | Esta comunidade está cheia. | This community is full. |
| `upgradeCoOrganizersCap` | Limite de coorganizadores atingido. | Limite de coorganizadores atingido. | Co-organizer limit reached. |
| `upgradeRecurringCap` | Esta comunidade atingiu o limite de eventos recorrentes. | Esta comunidade atingiu o limite de eventos recorrentes. | This community has reached its recurring event limit. |
| `groups_per_community` | Atingiste o limite de grupos. Arquiva um grupo para adicionar mais. | Você atingiu o limite de grupos. Arquive um grupo para adicionar mais. | You've reached the group limit. Archive a group to add more. |
| `blast_customization_required` | Não é possível personalizar este comunicado. Envia o modelo tal como está. | Não é possível personalizar este comunicado. Envie o modelo como está. | This blast can't be customised. Send the template as it is. |

Delete `upgradeBlast` from all three locales if a search confirms no code uses it. It names Community Pro and is already unused. Keys used only by the hidden screens stay, because the code that reads them stays.

## Part 4: the onboarding stamp (Engineer B)

The Jammer+ step stamps `onboarded_at` today. With the flag off, the notifications step becomes the last step and stamps it.

1. **`lib/onboardingStamps.ts`:** add a helper that stamps `markNotificationsPrompted` through `stampWithRetry`, then, with the flag off, `markOnboarded` the same way. It returns `true` only if every stamp landed. Both stamps are first-time-only on the server (0120), so a retry after a partial failure is safe.
2. **`app/(onboarding)/notifications.tsx`, `goNext`:** call the helper. Failure handling doesn't change: the first failure stays with a banner, the second continues with a banner (`onStampFailure`). With the flag off, finish with `router.replace('/(tabs)')`; with it on, keep `router.push('/(onboarding)/jammer-plus')`.
3. **`lib/postVerifyRoute.ts`, `onboardingRoute`:** with the flag off, a user who isn't onboarded but has answered everything goes to notifications, even if `notifications_prompted_at` is set:
   ```ts
   if (!profile.notifications_prompted_at || !PLANS_VISIBLE) return '/(onboarding)/notifications';
   return '/(onboarding)/jammer-plus';
   ```
   This covers two cases: someone who left at the Jammer+ step on an older build, and someone whose second stamp failed. They see the notifications step once more, and one tap finishes. If they already answered the OS prompt, iOS doesn't ask again.
4. **`app/_layout.tsx`:** update the comment at line 145 that lists the steps. Its `OnboardingRoute` type can stay.

The push prompt has lived in the notifications step since the redesign, so there's no separate Home-arrival prompt to protect. A search for `hasRequestedPush` finds nothing. If you find one anyway, tell the CTO on your task before changing it.

Web needs no change: `middleware.ts` only reads `onboarded_at`.

**Unit tests**, with `PLANS_VISIBLE` mocked both ways:
- `postVerifyRoute.test.ts`: the `jammer-plus` expectation at line 69 becomes `notifications` with the flag off, and stays `jammer-plus` with it on.
- `onboardingStamps.test.ts`: with the flag off, both stamps run; if the second fails, the helper returns `false`. With the flag on, only the first runs.
- `UpgradePrompt`, if the mobile test setup can render it. If it can't, cover the label decision with a small pure function.

## Part 5: E2E suites (Engineer B)

No suite may reference a removed surface. **Suite 06 and `flows.ts` aren't in the task's list, but they do reference one.**

| File | Change |
|---|---|
| `suites/02-onboarding.e2e.ts` | "Skip for now" and "Allow" now land on Home. Assert both `notifications_prompted_at` and `onboarded_at` are set. Un-stamp **both** before the relaunch at line 83. Delete the "paywall continue free" test. Add one: `notifications_prompted_at` set and `onboarded_at` null, relaunch, the notifications step shows, a tap lands on Home with `onboarded_at` set. |
| `suites/02-onboarding-screens.e2e.ts` | After Allow, expect Home. Remove `shot('plans')`, the `jammerPlusFree` tap, the `/profile/plan` deep link and `shot('paywall-settings')`. |
| `suites/11-community-admin.e2e.ts` | Remove `/community plan/i` from the menu list and assert it's gone. Delete the plan section test, and fix the comment at line 322-323 that mentions it. |
| `suites/06-events-manage.e2e.ts` | Replace the scroll to `blast-customize-upgrade-cta` (line 458) with an assertion that it's absent. Fix the comment at line 456. |
| `driver/flows.ts` | Remove `Jammer\+` from the regex at line 53. Fix `completeOnboardingBySkipping`: drop the Jammer+ step and expect Home after notifications. It's currently unused and already lacks the Level step, so add that too or delete the helper. |

**Coordinate with PAD-180:** it may hide Send blast, which would change suite 06 and the manage screens. This PR owns the locked card in `blast.tsx` and `BlastComposer`. PAD-180 owns only the entry points to the blast screen.

## Verification

- All the checks in `docs/agents/_rules.md`: `pnpm lint && pnpm typecheck && pnpm tokens:check && pnpm i18n:check && pnpm size:check && pnpm test && pnpm test:functions`. `pnpm test:db` isn't needed, because nothing under `infra/` changes.
- Mobile E2E suites 02, 02-screens, 06 and 11 pass on the runner.
- **QA, by hand, on mobile and web:** walk Settings, the community admin menu, a full community join, the fourth co-organizer, event create, event edit and the blast screen. Check that no plan name appears as a choice, and no price, trial, "See plans" or Upgrade button. On mobile, open `mobile:///profile/plan` and check it redirects. A new account finishes onboarding on Home with `onboarded_at` set and no Jammer+ step.
- **Sweep the rendered strings:** search the code paths still reachable with the flag off for `Starter`, `Community Pro`, `Basic`, `Jammer+`, `upgrade`, `plano`, `plan` and `trial`. "Jammer" alone is the player name and the Founding Jammer badge, so it stays.

## Not in this PR

- The limits themselves (PAD-178) and revoking the RPCs (PAD-158).
- Deleting any billing code, or removing the `plan` hooks and `packages/api/src/plans/`.
- `Requirements/auth-onboarding.md`: the Product Manager is amending AU-20.
- Turning off customisation for anyone who already has it. Self-granted rows are cleaned up under PAD-158.
