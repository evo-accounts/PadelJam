# UX-GLOB-10 Paid Features in the MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jammer+ and the community premium plan are granted on request: tapping the upgrade action activates the plan immediately and reversibly, gated features unlock, and the plan screens stay in place with no transaction.

**Architecture:** One migration adds two `security definer` RPCs that are the only client-reachable writers of `subscriptions` and `community_subscriptions` (RLS stays select-only). `packages/api` gains read hooks over the existing `account_plan` / `community_plan` SQL functions and two mutations. The paywall screen becomes reachable from Profile settings and actually activates; Manage Community gains a Plan section; the four cap errors become gated UI with an upgrade destination.

**Tech Stack:** PLpgSQL, the REST test harness `infra/supabase/tests/lib.mjs`, TanStack Query, react-native, `useConfirm` and `useBanner` (foundations), `packages/features` registry for the limits shown.

**Spec:** `docs/superpowers/specs/2026-09-12-ux-global-rules-design.md` section 9. **Depends on:** the foundations PR merged (confirm sheet, banner) and the headers PR (`nav` bar on the paywall).

**Prerequisites:** local Supabase stack running; `git fetch origin && git checkout -b feat/ux-paid-features origin/main`. Next migration number: `ls infra/supabase/migrations | tail -1` (0093 is the last known; use 0094 unless something landed).

---

### Task 1: Failing RPC tests

**Files:**
- Create: `infra/supabase/tests/plans.test.mjs`

- [ ] **Step 1: Write the tests**
```js
// infra/supabase/tests/plans.test.mjs
import { user, rpc, sel, insert, expectError, assert, run } from './lib.mjs';

const plan = (jwt) => rpc(jwt, 'account_plan_of_caller');
const cplan = (jwt, id) => rpc(jwt, 'community_plan', { c: id });

async function ownCommunity(owner, name) {
  return rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: name, p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
}

await run('a user can grant and revoke Jammer+ for themselves', async () => {
  const u = await user('jp');
  assert((await plan(u.jwt)) === 'free', 'starts free');
  await rpc(u.jwt, 'set_account_plan', { p_plan: 'jammer_plus' });
  assert((await plan(u.jwt)) === 'jammer_plus', 'granted');
  const rows = await sel('subscriptions', `user_id=eq.${u.id}&select=plan_id,status,provider`);
  assert(rows.length === 1 && rows[0].plan_id === 'jammer_plus' && rows[0].status === 'active' && rows[0].provider === 'manual', 'manual row');
  await rpc(u.jwt, 'set_account_plan', { p_plan: 'jammer_plus' });   // idempotent
  assert((await sel('subscriptions', `user_id=eq.${u.id}&select=id`)).length === 1, 'still one row');
  await rpc(u.jwt, 'set_account_plan', { p_plan: 'free' });
  assert((await plan(u.jwt)) === 'free', 'revoked');
  await expectError(() => rpc(u.jwt, 'set_account_plan', { p_plan: 'club' }), 'invalid_plan');
});

await run('the owner can upgrade a community to Community Pro and back', async () => {
  const owner = await user('own');
  const member = await user('mem');
  const cid = await ownCommunity(owner, 'Plan Club');
  await rpc(member.jwt, 'join_community', { p_community_id: cid, p_ack: true });
  assert((await cplan(owner.jwt, cid)) === 'starter', 'starts on starter');
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'community_pro' });
  assert((await cplan(owner.jwt, cid)) === 'community_pro', 'upgraded');
  await expectError(() => rpc(member.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'starter' }), 'forbidden');
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'starter' });
  assert((await cplan(owner.jwt, cid)) === 'starter', 'downgraded');
});

await run('a downgrade is refused while the community exceeds Starter limits', async () => {
  const owner = await user('own2');
  const cid = await ownCommunity(owner, 'Big Club');
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'community_pro' });
  await rpc(owner.jwt, 'create_group', { p_community_id: cid, p_name: 'Second', p_description: null, p_is_private: false, p_thumbnail_path: null });
  await expectError(() => rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'starter' }), 'plan_downgrade_over_limit');
  await rpc(owner.jwt, 'archive_group', { p_group_id: (await sel('groups', `community_id=eq.${cid}&is_general=eq.false&select=id`))[0].id });
  await rpc(owner.jwt, 'set_community_plan', { p_community_id: cid, p_plan: 'starter' });
  assert((await cplan(owner.jwt, cid)) === 'starter', 'downgraded after archiving');
});
```
`account_plan(u uuid)` exists as a SQL function but takes a user id; the client needs "my plan", so the migration adds `account_plan_of_caller()` (no args) and confirms `community_plan(c uuid)` is executable by `authenticated` (grant it if 0014 did not).

- [ ] **Step 2:** `node infra/supabase/tests/plans.test.mjs` → first case fails (`set_account_plan` not found).

---

### Task 2: Migration

**Files:**
- Create: `infra/supabase/migrations/0094_manual_plans.sql`

- [ ] **Step 1: Write it**
```sql
-- UX-GLOB-10: paid features are granted on request in the MVP. These two RPCs are the ONLY
-- client-reachable writers of subscriptions / community_subscriptions (RLS stays select-only).
-- provider = 'manual' marks the rows so a future billing integration can tell them apart.

create or replace function account_plan_of_caller() returns text
language sql stable security definer set search_path = public as $$
  select account_plan(auth.uid());
$$;
grant execute on function account_plan_of_caller() to authenticated;
grant execute on function community_plan(uuid) to authenticated;

create or replace function set_account_plan(p_plan text) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_plan not in ('free', 'jammer_plus') then raise exception 'invalid_plan' using errcode='P0001'; end if;
  if p_plan = 'free' then
    delete from subscriptions where user_id = v_user and provider = 'manual';
  else
    insert into subscriptions (user_id, dimension, plan_id, status, provider)
    values (v_user, 'account', 'jammer_plus', 'active', 'manual')
    on conflict (user_id) do update set plan_id = 'jammer_plus', status = 'active', provider = 'manual', updated_at = now();
  end if;
  return account_plan(v_user);
end; $$;
grant execute on function set_account_plan(text) to authenticated;

create or replace function set_community_plan(p_community_id uuid, p_plan text) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_members int; v_groups int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_plan not in ('starter', 'community_pro') then raise exception 'invalid_plan' using errcode='P0001'; end if;
  if not exists (select 1 from community_members where community_id = p_community_id and user_id = v_user and role = 'owner') then
    raise exception 'forbidden' using errcode='P0001';
  end if;
  if p_plan = 'starter' then
    select count(*) into v_members from community_members where community_id = p_community_id;
    select count(*) into v_groups from groups where community_id = p_community_id and archived_at is null;
    if v_members > coalesce(community_limit_for_plan('starter', 'members_per_community'), 2147483647)
       or v_groups > coalesce(community_limit_for_plan('starter', 'groups_per_community'), 2147483647) then
      raise exception 'plan_downgrade_over_limit' using errcode='P0001';
    end if;
    delete from community_subscriptions where community_id = p_community_id and provider = 'manual';
  else
    insert into community_subscriptions (community_id, dimension, plan_id, status, provider)
    values (p_community_id, 'community', 'community_pro', 'active', 'manual')
    on conflict (community_id) do update set plan_id = 'community_pro', status = 'active', provider = 'manual', updated_at = now();
  end if;
  return community_plan(p_community_id);
end; $$;
grant execute on function set_community_plan(uuid, text) to authenticated;
```
`community_limit_for_plan(plan_id, key)` may not exist: 0014 defines `community_limit(c uuid, key text)` which resolves the community's CURRENT plan. Add the helper in this migration by reading `plan_features` directly (see 0013 for the table shape: `(dimension, plan_id, feature_key, limit_value)` or similar — read it and write `select limit_value from plan_features where dimension='community' and plan_id=$1 and feature_key=$2`). Check whether `subscriptions`/`community_subscriptions` have `updated_at` (0011 shows both do).

- [ ] **Step 2:** `pnpm dlx supabase@latest --workdir infra db reset && pnpm test:db` → plans 3 ✔ plus the existing suites.
- [ ] **Step 3:** Commit `feat(db): manual plan grants — set_account_plan, set_community_plan`.

---

### Task 3: API hooks

**Files:**
- Modify: `packages/db/src/database.types.ts` (Functions: `account_plan_of_caller`, `set_account_plan`, `set_community_plan`, and `community_plan` if missing)
- Create: `packages/api/src/plans/queries.ts`, `packages/api/src/plans/mutations.ts`; export from `packages/api/src/index.ts`; keys in `query-keys.ts` (`accountPlan`, `communityPlan(id)`)
- Modify: `packages/api/src/client.ts` `KNOWN` += `'invalid_plan', 'plan_downgrade_over_limit'`; `client.test.ts` case

- [ ] **Step 1:** `useAccountPlan()` → `db.rpc('account_plan_of_caller')`; `useCommunityPlan(id)` → `db.rpc('community_plan', { c: id })`; `useSetAccountPlan()` and `useSetCommunityPlan()` call the RPCs and invalidate the two keys plus `qk.community(id)`/`qk.groups(id)`/`qk.canCreateGroup(id)` so caps refresh.
- [ ] **Step 2:** `pnpm --filter @padel/api test && pnpm typecheck`; commit `feat(api): plan read hooks and grant mutations`.

---

### Task 4: Jammer+ from Profile settings

**Files:**
- Modify: `apps/mobile/app/profile/settings.tsx` (Account section gains a `ListRow` "Plan · Jammer" / "Plan · Jammer+" → `router.push('/profile/plan')`)
- Create: `apps/mobile/app/profile/plan.tsx` — renders the existing paywall body (`app/(onboarding)/jammer-plus.tsx` extracted into `components/profile/JammerPlusPaywall.tsx` with an `onDone` prop and a `mode: 'onboarding' | 'settings'`)
- Modify: `apps/mobile/app/(onboarding)/jammer-plus.tsx` to use the extracted component

- [ ] **Step 1:** In the paywall component: "Try 7-day free trial" → `await setAccountPlan.mutateAsync('jammer_plus'); banner.show(t('jammerPlusActivated'), 'success'); onDone()`. When `useAccountPlan()` is `jammer_plus`, the screen shows the current plan card and a "Return to free" action → `confirm({ title: t('returnToFreeTitle'), body: t('returnToFreeBody'), confirmLabel: t('returnToFree'), destructive: true })` then `setAccountPlan('free')`. Onboarding mode keeps ✕ and "Continue with Free" finishing onboarding as today; settings mode uses the `nav` bar.
- [ ] **Step 2:** Copy (profile namespace, three locales): `planRow` "Plan", `planJammer` "Jammer", `planJammerPlus` "Jammer+", `jammerPlusActivated` "Jammer+ is on", `returnToFreeTitle` "Return to the free plan?", `returnToFreeBody` "Jammer+ features switch off right away.", `returnToFree` "Return to free".
- [ ] **Step 3:** Checks; commit `feat(mobile): Jammer+ is reachable from settings and activates on request`.

---

### Task 5: Community plan section

**Files:**
- Create: `apps/mobile/components/community/PlanSection.tsx`
- Modify: `apps/mobile/app/community/[id]/manage/index.tsx` (render `<PlanSection communityId={id} />` for the owner)

- [ ] **Step 1:** `PlanSection` shows two `Card`s side by side, Starter and Community Pro, each listing the limits from `packages/features/src/registry.ts` (members, groups, recurring events, co-organizers; "Unlimited" for `null`) with the current one marked by a `Badge`. Owner action: "Upgrade to Community Pro" → `setCommunityPlan('community_pro')` + success banner; on Pro: "Return to Starter" → confirm sheet → `setCommunityPlan('starter')`; a `plan_downgrade_over_limit` error shows the banner `t('downgradeOverLimit')` ("Archive extra groups or remove members first").
- [ ] **Step 2:** Copy in the community namespace (three locales): `planSectionTitle` "Plan", `planStarter`, `planCommunityPro`, `planCurrent` "Current", `upgradeToPro` "Upgrade to Community Pro", `returnToStarter` "Return to Starter", `returnToStarterTitle`, `returnToStarterBody`, `downgradeOverLimit`, `limitUnlimited` "Unlimited", `limitMembers`/`limitGroups`/`limitRecurring`/`limitCoOrganizers` labels, `planActivated` "Community Pro is on".
- [ ] **Step 3:** Checks; commit `feat(mobile): community plan section with on-request upgrade`.

---

### Task 6: Gated UI with an upgrade destination

**Files:**
- Modify: the places that surface `groups_per_community` (`app/community/[id]/group-create.tsx:24`, `app/group/[id]/manage/seasons.tsx:14`), `co_organizers_limit_reached`, `recurring_events` (`packages/api/src/client.ts:20` consumers: the wizard's recurring step), `members_per_community` (`community_full`)
- Modify: `apps/mobile/app/event/[id]/blast.tsx` (Starter → read-only default template + upgrade action)

- [ ] **Step 1:** Add a shared `UpgradePrompt` (`components/community/UpgradePrompt.tsx`): a `BottomSheet` with the cap message and one `Button` "See plans" → `router.push(`/community/${communityId}/manage?section=plan`)`. Each cap error opens it instead of a plain error (the manage screen scrolls to `PlanSection` when `?section=plan`).
- [ ] **Step 2:** `blast.tsx`: `const plan = useCommunityPlan(communityId)`; when not `community_pro` (i.e. no `custom_broadcasts`), render the default template read-only with `UpgradePrompt` behind a "Customize" button; when pro, the existing editor.
- [ ] **Step 3:** Checks; commit `feat(mobile): plan caps point at the upgrade screen; blast customisation is gated`.

---

### Task 7: Verification and PR

- [ ] `pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test && pnpm test:db`.
- [ ] Simulator against the audit seed: A1 is on Jammer+ (seed row) — settings shows "Jammer+", "Return to free" works and comes back; C1 is on Community Pro; C2 (owned by F1) upgrade then downgrade; a Starter community hitting the group cap sees the upgrade prompt.
- [ ] PR `feat/ux-paid-features` → main, spec section 9; body includes the hosted hand-off: paste 0094 in the SQL editor and record it in `schema_migrations`. End with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
