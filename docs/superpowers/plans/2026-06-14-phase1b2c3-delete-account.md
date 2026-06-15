# Phase 1B-2c-3 — Delete Account (soft-delete) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user delete their account: anonymize + soft-delete the profile, drop their memberships/social rows, ban the auth user, keep owned entities intact.

**Architecture:** A `soft_delete_account()` `SECURITY DEFINER` RPC does the scrub + dependent-row deletes (scoped to `auth.uid()`). A `delete-account` edge function (mirroring `complete-account`) calls the RPC as the user, then bans the auth user via the admin client. A `/profile/delete-account` screen confirms and invokes it, then signs out.

**Tech Stack:** Supabase Postgres RPC + GoTrue admin (edge function, Deno), Expo Router, Vitest (SQL test via psql).

**Spec:** `docs/superpowers/specs/2026-06-14-phase1b2c3-delete-account-design.md`. **Branch:** `feat/phase1b2c3-delete-account` (off `main`). **Migration `0059`.**

## Resolved facts
- Hard delete is blocked by NOT NULL RESTRICT FKs (`created_by`/`organizer_id`/…). Soft-delete + ban instead.
- Membership tables use `user_id`: `community_members`, `group_members`, `event_participants`; social: `follows` (follower_id/followee_id), `blocks` (blocker_id/blocked_id), `reports` (reporter_id), `user_settings` (user_id).
- `trg_member_caps` on `community_members` is `before insert or update` only — **delete is not trigger-guarded**; sole-owner protection lives in RPCs, so a direct DEFINER delete is safe (intended for account deletion).
- `complete-account/index.ts` is the edge-fn template: `userClient` (anon + Authorization header) for `auth.getUser()`/user-scoped calls, `admin` (service-role) for privileged ops; env `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`.
- App invokes edge fns via `fetch(`${SUPABASE_URL}/functions/v1/<fn>`, { headers: { Authorization: `Bearer ${session.access_token}` } })`; `SUPABASE_URL` + `supabase` from `@/lib/supabase`.
- The screen calls the edge function directly (no `@padel/api` hook); the RPC isn't called from the app → **no `database.types.ts` change needed**.

## File Structure
```
infra/supabase/migrations/0059_account_deletion.sql   profiles.deleted_at + soft_delete_account RPC
infra/supabase/tests/account_deletion.sql             scrub/dependent-delete/owned-preserved test
infra/supabase/functions/delete-account/index.ts      edge fn (rpc + admin ban)
apps/mobile/lib/i18n-mobile.ts                         (modify: + delete-account keys)
apps/mobile/app/profile/delete-account.tsx            (create: warning/confirm screen)
apps/mobile/app/profile/settings.tsx                  (modify: + destructive Delete account row)
```

---

## Task 1: Migration `0059` + SQL test

**Files:** Create `infra/supabase/migrations/0059_account_deletion.sql`; Test `infra/supabase/tests/account_deletion.sql`.

- [ ] **Step 1: Migration** `infra/supabase/migrations/0059_account_deletion.sql`:
```sql
alter table profiles add column deleted_at timestamptz;

-- Soft-delete the caller's own account: anonymize PII, mark deleted, drop the user's
-- memberships/social rows. Owned entities (created_by/organizer_id) are kept and now reference
-- the anonymized "Deleted user" profile. SECURITY DEFINER to scrub/delete across tables; scoped to auth.uid().
create or replace function soft_delete_account()
returns void
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return; end if;

  delete from follows  where follower_id = uid or followee_id = uid;
  delete from blocks   where blocker_id = uid or blocked_id = uid;
  delete from reports  where reporter_id = uid;
  delete from user_settings     where user_id = uid;
  delete from community_members where user_id = uid;
  delete from group_members     where user_id = uid;
  delete from event_participants where user_id = uid;

  update profiles
     set full_name = 'Deleted user',
         email = 'deleted+' || uid::text || '@deleted.invalid',
         phone = 'deleted-' || uid::text,
         avatar_url = null,
         description = null,
         location_text = null,
         location_point = null,
         dominant_hand = null,
         court_side = null,
         gender = null,
         date_of_birth = null,
         deleted_at = now()
   where id = uid;
end;
$$;

grant execute on function soft_delete_account() to authenticated;
```

- [ ] **Step 2: Test** `infra/supabase/tests/account_deletion.sql`:
```sql
-- soft_delete_account: anonymizes the profile, drops the user's memberships/social rows,
-- and KEEPS owned entities (a community the user created).
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f5000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','del1@x.com'),
  ('f5000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','del2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f5000001-0000-0000-0000-000000000001','del1@x.com','+351900020001','Del One'),
  ('f5000002-0000-0000-0000-000000000002','del2@x.com','+351900020002','Del Two') on conflict do nothing;

do $$
declare uid constant uuid := 'f5000001-0000-0000-0000-000000000001'; cid uuid;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', uid), true);

  -- owned entity + memberships + social + settings for the user.
  cid := create_community_with_personal_tenant('DelC','club','PT','public');  -- created_by = uid, adds membership
  insert into follows (follower_id, followee_id) values (uid, 'f5000002-0000-0000-0000-000000000002');
  insert into user_settings (user_id) values (uid);

  perform soft_delete_account();

  -- profile anonymized + soft-deleted.
  if not exists (select 1 from profiles where id = uid
      and full_name = 'Deleted user' and deleted_at is not null
      and email = 'deleted+' || uid::text || '@deleted.invalid'
      and phone = 'deleted-' || uid::text) then
    raise exception using errcode='PT001', message='profile not anonymized'; end if;
  -- personal/social rows gone.
  if exists (select 1 from follows where follower_id = uid or followee_id = uid) then
    raise exception using errcode='PT001', message='follows not removed'; end if;
  if exists (select 1 from user_settings where user_id = uid) then
    raise exception using errcode='PT001', message='settings not removed'; end if;
  if exists (select 1 from community_members where user_id = uid) then
    raise exception using errcode='PT001', message='membership not removed'; end if;
  -- owned community preserved.
  if not exists (select 1 from communities where id = cid) then
    raise exception using errcode='PT001', message='owned community was removed'; end if;

  raise notice 'OK account_deletion';
end $$;
rollback;
```

- [ ] **Step 3: Verify FAIL first.** Create only the test, then:
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/account_deletion.sql
```
Expected: error `function soft_delete_account() does not exist`.

- [ ] **Step 4: Create migration, re-reset, verify PASS:**
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/account_deletion.sql
```
Expected: `NOTICE:  OK account_deletion`. (If `create_community_with_personal_tenant` requires a subscription upgrade to add members/groups, mirror the `my_events.sql` fixture's `community_subscriptions` 'basic' upsert — but the default starter plan allows the creator's own membership, so it should pass as-is.)

- [ ] **Step 5: Commit:**
```bash
git add infra/supabase/migrations/0059_account_deletion.sql infra/supabase/tests/account_deletion.sql
git commit -m "feat(profile): soft_delete_account RPC (anonymize + drop memberships) + SQL test"
```

---

## Task 2: `delete-account` edge function

**Files:** Create `infra/supabase/functions/delete-account/index.ts`.

- [ ] **Step 1: Create the function** (mirrors `complete-account`):
```ts
// Soft-deletes the caller's account: runs soft_delete_account() as the user (anonymize + drop
// memberships/social rows), then bans the auth user so re-login is blocked. Hard delete is not
// possible (NOT NULL RESTRICT FKs from owned communities/events).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) return new Response('Unauthorized', { status: 401 });

  // 1) Anonymize + drop the user's data (runs as the caller → auth.uid()).
  const { error: rpcErr } = await userClient.rpc('soft_delete_account');
  if (rpcErr) return json({ error: rpcErr.message }, 400);

  // 2) Ban the auth user so they cannot sign in again (~100 years).
  const admin = createClient(url, serviceKey);
  const { error: banErr } = await admin.auth.admin.updateUserById(user.id, { ban_duration: '876000h' });
  if (banErr) return json({ error: banErr.message }, 400);

  return json({ ok: true });
});
```

- [ ] **Step 2: Serve + smoke the function (manual, optional here — full smoke in Task 5).** Confirm it loads:
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra functions serve > /tmp/fns.log 2>&1 &
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:55321/functions/v1/delete-account
pkill -f "functions serve"
```
Expected: `401` (no auth header) — proves the function is served and the guard works.

- [ ] **Step 3: Commit:**
```bash
git add infra/supabase/functions/delete-account/index.ts
git commit -m "feat(api): delete-account edge function (soft-delete + ban)"
```

---

## Task 3: Delete-account i18n keys

**Files:** Modify `apps/mobile/lib/i18n-mobile.ts`.

- [ ] **Step 1: Merge keys** into the existing `mobileProfile.en` object (keep existing):
```ts
    deleteAccount: 'Delete account',
    deleteWarningTitle: 'Delete your account?',
    deleteWarningBody: 'This permanently anonymizes your profile and removes your data. This cannot be undone.',
    deleteErasedProfile: '• Your profile and personal details',
    deleteErasedMemberships: '• Your community and group memberships',
    deleteErasedSocial: '• Your follows, blocks, and settings',
    deleteConfirm: 'Delete my account',
    deleteFailed: "Couldn't delete your account. Please try again.",
```

- [ ] **Step 2: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): delete-account i18n keys"
```

---

## Task 4: Delete-account screen + settings row

**Files:** Create `apps/mobile/app/profile/delete-account.tsx`; Modify `apps/mobile/app/profile/settings.tsx`.

- [ ] **Step 1: Create the screen** `apps/mobile/app/profile/delete-account.tsx`:
```tsx
import { signOut } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { SUPABASE_URL, supabase } from '@/lib/supabase';

export default function DeleteAccountScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError(t('deleteFailed')); return; }
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      });
      if (!resp.ok) { setError(t('deleteFailed')); return; }
      await signOut(supabase);
      router.replace('/(auth)/welcome');
    } catch {
      setError(t('deleteFailed'));
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (busy) return;
    Alert.alert(t('deleteWarningTitle'), t('deleteWarningBody'), [
      { text: t('deleteAccount'), style: 'cancel' },
      { text: t('deleteConfirm'), style: 'destructive', onPress: () => void doDelete() },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('deleteAccount') }} />
      <Text style={styles.title}>{t('deleteWarningTitle')}</Text>
      <Text style={styles.body}>{t('deleteWarningBody')}</Text>
      <Text style={styles.item}>{t('deleteErasedProfile')}</Text>
      <Text style={styles.item}>{t('deleteErasedMemberships')}</Text>
      <Text style={styles.item}>{t('deleteErasedSocial')}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.delete, busy && styles.deleteDisabled]} onPress={confirm} disabled={busy} accessibilityRole="button">
        <Text style={styles.deleteText}>{t('deleteConfirm')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#0B1F3A' },
  body: { fontSize: 14, color: '#3A4757' },
  item: { fontSize: 14, color: '#3A4757' },
  error: { color: '#D7263D', fontSize: 13 },
  delete: { backgroundColor: '#D7263D', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  deleteDisabled: { opacity: 0.6 },
  deleteText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
```

- [ ] **Step 2: Add the destructive row** to `apps/mobile/app/profile/settings.tsx`, in the Account section after the Change email row (uses `styles.row`; the label is red via an inline style):
```tsx
      <Pressable style={styles.row} onPress={() => router.push('/profile/delete-account')} accessibilityRole="button">
        <Text style={[styles.rowLabel, { color: '#D7263D' }]}>{t('deleteAccount')}</Text>
      </Pressable>
```

- [ ] **Step 3: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add "apps/mobile/app/profile/delete-account.tsx" apps/mobile/app/profile/settings.tsx
git commit -m "feat(mobile): delete-account screen + settings row"
```
Expected: clean (`/profile/delete-account` matches the existing `/profile/${string}` typed-route pattern).

---

## Task 5: Full verification

**Files:** none.

- [ ] **Step 1: Fresh DB + SQL test:**
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/account_deletion.sql
```
Expected: `NOTICE:  OK account_deletion`.

- [ ] **Step 2: Workspace typecheck:**
```bash
pnpm -w typecheck
```
Expected: 0 type errors.

- [ ] **Step 3: Manual smoke (iOS simulator + `supabase functions serve` running).**
Sign in → Profile → gear → Settings → Account → Delete account → confirm. Verify: signed out to welcome; in the DB `select full_name, deleted_at, email from profiles where id=<that uid>` shows the anonymized values; attempting to sign in again with the original email/phone is rejected (banned); a community the user created still exists with the "Deleted user" owner.

- [ ] **Step 4: Finish the branch.**
Announce: "I'm using the finishing-a-development-branch skill to complete this work." Follow superpowers:finishing-a-development-branch; integration targets `main`.

---

## Self-Review notes (addressed)
- **Spec coverage:** `deleted_at` + `soft_delete_account` RPC → Task 1; edge fn (rpc + ban) → Task 2; i18n → Task 3; screen + destructive row → Task 4; verification → Task 5.
- **No placeholders:** complete SQL/TS/TSX; the membership/social table+column names match the schema (`user_id`, `follower_id`/`followee_id`, etc.).
- **Safety:** membership deletes aren't trigger-guarded (`trg_member_caps` is insert/update only); the RPC is `auth.uid()`-scoped; owned entities preserved (tested).
- **No DB-type change:** the RPC is called only from the edge function (Deno), not the app, so `database.types.ts` is untouched.
- **Re-login block:** edge fn bans via `updateUserById(ban_duration)`; the app `signOut`s + redirects to welcome.
- **Deferred/limitation:** sole-owner community transfer; hard delete; data export.
```
