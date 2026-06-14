# Phase 1B-2c-2a — Change Email (OTP) + Contact Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user change their email (OTP-verified) from settings, and keep `profiles.email/phone` in sync with `auth.users` via a trigger.

**Architecture:** A `SECURITY DEFINER` trigger on `auth.users` mirrors email/phone into `profiles`. `@padel/auth` gains `startEmailChange`/`verifyEmailChange` (GoTrue `updateUser` + `verifyOtp type:'email_change'`). A two-phase `/profile/change-email` screen drives it. Local `double_confirm_changes` is set false so a single new-email code completes the change.

**Tech Stack:** Supabase Postgres trigger + GoTrue auth, Expo Router, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-14-phase1b2c2a-change-email-design.md`. **Branch:** `feat/phase1b2c2-change-email` (off `main`). **Migration `0058`.**

## Resolved facts
- No `auth.users`→`profiles` sync exists; `profiles.email/phone` are NOT NULL UNIQUE.
- `config.toml` has `double_confirm_changes = true` at line 224 (`[auth.email]`); Inbucket web UI is port **55324**. A config change needs a Supabase restart (`db reset` restarts containers).
- `@padel/auth/otp.ts` holds OTP helpers (take `TypedClient`); index re-exports `./otp`. `password.test.ts` is the mock-client unit-test pattern.
- `verifyOtp({ type: 'email_change' })` is valid in supabase-js v2.
- Settings hub Account section (from 1B-2c-1) has a Change password row; add a Change email row beside it. `useRouter`/`Pressable`/`Text`/`styles.row`/`styles.rowLabel` available.

## File Structure
```
infra/supabase/config.toml                          (modify: double_confirm_changes false)
infra/supabase/migrations/0058_profile_contact_sync.sql   sync trigger
infra/supabase/tests/profile_contact_sync.sql       trigger sync test
packages/auth/src/otp.ts                             (modify: + startEmailChange/verifyEmailChange)
packages/auth/src/otp.test.ts OR password.test.ts    (extend/create with change-email unit tests)
apps/mobile/lib/i18n-mobile.ts                       (modify: + change-email keys)
apps/mobile/app/profile/change-email.tsx             (create: two-phase screen)
apps/mobile/app/profile/settings.tsx                 (modify: + Change email row)
```

---

## Task 1: Contact-sync trigger + SQL test

**Files:** Create `infra/supabase/migrations/0058_profile_contact_sync.sql`; Test `infra/supabase/tests/profile_contact_sync.sql`.

- [ ] **Step 1: Migration** `infra/supabase/migrations/0058_profile_contact_sync.sql`:
```sql
-- Keep profiles.email/phone in sync with auth.users after a verified email/phone change.
-- coalesce avoids nulling profiles' NOT NULL columns on a transient null on auth.users.
create or replace function sync_profile_contact()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles
     set email = coalesce(new.email, profiles.email),
         phone = coalesce(new.phone, profiles.phone)
   where profiles.id = new.id;
  return new;
end;
$$;
create trigger sync_profile_contact_aiu
  after update of email, phone on auth.users
  for each row execute function sync_profile_contact();
```

- [ ] **Step 2: Test** `infra/supabase/tests/profile_contact_sync.sql`:
```sql
-- Trigger keeps profiles.email/phone in sync with auth.users; null on auth.users doesn't null profiles.
begin;
insert into auth.users (id, instance_id, aud, role, email, phone) values
  ('f4000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','old@x.com','+351900010001') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f4000001-0000-0000-0000-000000000001','old@x.com','+351900010001','Sync Me') on conflict do nothing;

do $$
declare uid constant uuid := 'f4000001-0000-0000-0000-000000000001';
begin
  update auth.users set email = 'new@x.com' where id = uid;
  if not exists (select 1 from profiles where id = uid and email = 'new@x.com') then
    raise exception using errcode='PT001', message='email not synced'; end if;

  update auth.users set phone = '+351900010099' where id = uid;
  if not exists (select 1 from profiles where id = uid and phone = '+351900010099') then
    raise exception using errcode='PT001', message='phone not synced'; end if;

  update auth.users set phone = null where id = uid;
  if not exists (select 1 from profiles where id = uid and phone = '+351900010099') then
    raise exception using errcode='PT001', message='null on auth.users nulled the profile phone'; end if;

  raise notice 'OK profile_contact_sync';
end $$;
rollback;
```

- [ ] **Step 3: Verify FAIL first.** Create only the test, then:
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/profile_contact_sync.sql
```
Expected: assertion fails — `email not synced` (no trigger yet; the `update auth.users` doesn't touch profiles).

- [ ] **Step 4: Create migration, re-reset, verify PASS:**
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/profile_contact_sync.sql
```
Expected: `NOTICE:  OK profile_contact_sync`.

- [ ] **Step 5: Commit:**
```bash
git add infra/supabase/migrations/0058_profile_contact_sync.sql infra/supabase/tests/profile_contact_sync.sql
git commit -m "feat(profile): sync profiles.email/phone from auth.users via trigger + SQL test"
```

---

## Task 2: Disable double-confirm (single-code email change)

**Files:** Modify `infra/supabase/config.toml`.

- [ ] **Step 1: Flip the flag.** In `infra/supabase/config.toml` line ~224 (`[auth.email]`), change:
```toml
double_confirm_changes = true
```
to:
```toml
# Single-code email change for now (only the NEW address is confirmed). NOTE: weaker than
# secure email change — production should re-enable this (and the UI would then collect two codes).
double_confirm_changes = false
```

- [ ] **Step 2: Apply + sanity check.** Restart so GoTrue reloads the setting:
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
```
Expected: reset completes; `grep double_confirm_changes infra/supabase/config.toml` shows `false`.

- [ ] **Step 3: Commit:**
```bash
git add infra/supabase/config.toml
git commit -m "chore(supabase): single-code email change locally (double_confirm_changes=false)"
```

---

## Task 3: `@padel/auth` change-email helpers + unit test

**Files:** Modify `packages/auth/src/otp.ts`; Create/extend `packages/auth/src/email-change.test.ts`.

- [ ] **Step 1: Add helpers** to the end of `packages/auth/src/otp.ts`:
```ts
export const startEmailChange = (c: TypedClient, newEmail: string) => c.auth.updateUser({ email: newEmail });
export const verifyEmailChange = (c: TypedClient, newEmail: string, token: string) =>
  c.auth.verifyOtp({ email: newEmail, token, type: 'email_change' });
```
(`TypedClient` is already imported in `otp.ts`.)

- [ ] **Step 2: Unit test** `packages/auth/src/email-change.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { startEmailChange, verifyEmailChange } from './otp';
import type { TypedClient } from '@padel/db';

const makeClient = () => {
  const updateUser = vi.fn().mockResolvedValue({ data: {}, error: null });
  const verifyOtp = vi.fn().mockResolvedValue({ data: {}, error: null });
  return { client: { auth: { updateUser, verifyOtp } } as unknown as TypedClient, updateUser, verifyOtp };
};

describe('email change helpers', () => {
  it('startEmailChange calls updateUser with the new email', async () => {
    const { client, updateUser } = makeClient();
    await startEmailChange(client, 'new@x.com');
    expect(updateUser).toHaveBeenCalledWith({ email: 'new@x.com' });
  });
  it('verifyEmailChange calls verifyOtp with type email_change', async () => {
    const { client, verifyOtp } = makeClient();
    await verifyEmailChange(client, 'new@x.com', '123456');
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'new@x.com', token: '123456', type: 'email_change' });
  });
});
```

- [ ] **Step 3: Verify + commit:**
```bash
pnpm --filter @padel/auth test && pnpm --filter @padel/auth typecheck
git add packages/auth/src/otp.ts packages/auth/src/email-change.test.ts
git commit -m "feat(auth): startEmailChange + verifyEmailChange helpers + tests"
```
Expected: tests pass, typecheck clean.

---

## Task 4: Change-email i18n keys

**Files:** Modify `apps/mobile/lib/i18n-mobile.ts`.

- [ ] **Step 1: Merge keys** into the existing `mobileProfile.en` object (keep existing):
```ts
    changeEmail: 'Change email',
    newEmailLabel: 'New email',
    sendCode: 'Send code',
    codeLabel: 'Verification code',
    verify: 'Verify',
    codeSentTo: 'Enter the 6-digit code sent to your new email.',
    emailChanged: 'Email updated.',
    changeEmailFailed: "Couldn't start the email change. Please try again.",
    invalidCode: 'Invalid or expired code.',
```

- [ ] **Step 2: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): change-email i18n keys"
```

---

## Task 5: Change-email screen + settings row

**Files:** Create `apps/mobile/app/profile/change-email.tsx`; Modify `apps/mobile/app/profile/settings.tsx`.

- [ ] **Step 1: Create the screen** `apps/mobile/app/profile/change-email.tsx`:
```tsx
import { startEmailChange, verifyEmailChange } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { supabase } from '@/lib/supabase';

export default function ChangeEmailScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const [phase, setPhase] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSend = async () => {
    if (busy || !email.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const { error: e } = await startEmailChange(supabase, email.trim());
      if (e) { setError(t('changeEmailFailed')); return; }
      setPhase('code');
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    if (busy || !code.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const { error: e } = await verifyEmailChange(supabase, email.trim(), code.trim());
      if (e) { setError(t('invalidCode')); return; }
      Alert.alert(t('emailChanged'), undefined, [{ text: 'OK', onPress: () => router.back() }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('changeEmail') }} />
      {phase === 'email' ? (
        <>
          <Text style={styles.label}>{t('newEmailLabel')}</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.btn, busy && styles.btnDisabled]} onPress={onSend} disabled={busy} accessibilityRole="button">
            <Text style={styles.btnText}>{t('sendCode')}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.hint}>{t('codeSentTo')}</Text>
          <Text style={styles.label}>{t('codeLabel')}</Text>
          <TextInput style={styles.input} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.btn, busy && styles.btnDisabled]} onPress={onVerify} disabled={busy} accessibilityRole="button">
            <Text style={styles.btnText}>{t('verify')}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { padding: 16, gap: 8 },
  hint: { color: '#6B7685', fontSize: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#0B1F3A', marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: '#fff' },
  error: { color: '#D7263D', fontSize: 13 },
  btn: { backgroundColor: '#0B7BFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
```
(No `profiles` write or cache invalidation in the screen — the `0058` trigger updates `profiles` server-side after the verified change, and the profile screen refetches on next focus.)

- [ ] **Step 2: Add the Change email row** to `apps/mobile/app/profile/settings.tsx`, in the Account section right after the Change password row:
```tsx
      <Pressable style={styles.row} onPress={() => router.push('/profile/change-email')} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('changeEmail')}</Text>
      </Pressable>
```

- [ ] **Step 3: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add "apps/mobile/app/profile/change-email.tsx" apps/mobile/app/profile/settings.tsx
git commit -m "feat(mobile): change-email screen + settings row"
```
Expected: clean (`/profile/change-email` matches the existing `/profile/${string}` typed-route pattern).

---

## Task 6: Full verification

**Files:** none.

- [ ] **Step 1: Fresh DB + SQL test:**
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/profile_contact_sync.sql
```
Expected: `NOTICE:  OK profile_contact_sync`.

- [ ] **Step 2: Unit tests + workspace typecheck:**
```bash
pnpm --filter @padel/auth test && pnpm -w typecheck
```
Expected: PASS, 0 type errors.

- [ ] **Step 3: Manual smoke (iOS simulator, against the restarted local Supabase).**
Sign in → Profile → gear → Settings → Account → Change email → enter a new email → Send code. Open the Inbucket web UI at `http://localhost:55324`, read the 6-digit code from the "Confirm Email Change" message → enter it → Verify → success Alert → back. Confirm the profile/DB now shows the new email (`select email from profiles where id=…`); log out and sign in with the NEW email.

- [ ] **Step 4: Finish the branch.**
Announce: "I'm using the finishing-a-development-branch skill to complete this work." Follow superpowers:finishing-a-development-branch; integration targets `main`.

---

## Self-Review notes (addressed)
- **Spec coverage:** sync trigger + SQL test → Task 1; single-code config → Task 2; auth helpers + test → Task 3; i18n → Task 4; screen + settings row → Task 5; verification → Task 6.
- **No placeholders:** complete SQL/TS/TSX; the screen imports only what it uses (`startEmailChange`/`verifyEmailChange`).
- **Type consistency:** `startEmailChange`/`verifyEmailChange` signatures match between Task 3 (defn + test) and Task 5 (call sites); `type: 'email_change'` consistent. i18n keys used in Task 5 (`changeEmail`, `newEmailLabel`, `sendCode`, `codeLabel`, `verify`, `codeSentTo`, `emailChanged`, `changeEmailFailed`, `invalidCode`) all added in Task 4.
- **Profiles sync via trigger:** no client-side profile write; the screen relies on the `0058` trigger + next-focus refetch (no `useProfile` invalidation coupling).
- **Config restart:** Task 2 reruns `db reset` so GoTrue reloads `double_confirm_changes`.
- **Deferred:** change phone (1B-2c-2b), secure-email-change two-code UX (prod), delete account (1B-2c-3).
```
