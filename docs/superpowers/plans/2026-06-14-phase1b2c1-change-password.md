# Phase 1B-2c-1 — Change Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user change their password (current + new + repeat) from a settings screen.

**Architecture:** A `changePassword` helper in `@padel/auth` verifies the current password via `signInWithPassword`, then sets the new one via `updateUser`. A `/profile/change-password` screen drives it; the settings hub gains an Account section.

**Tech Stack:** Supabase auth (`@padel/auth`), Expo Router, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-14-phase1b2c1-change-password-design.md`. **Branch:** `feat/phase1b2c-password` (off `feat/discovery-explore`). **No migration.**

## Resolved facts
- `@padel/auth` helpers take `TypedClient` (imported `import type { TypedClient } from '@padel/db'`); index re-exports `./session`, `./otp`, etc. — add `./password`.
- `TypedClient` is the supabase-js client → `c.auth.signInWithPassword({email,password})` and `c.auth.updateUser({password})` exist.
- Every user has an email + a password (set by the `complete-account` edge function at signup).
- `otp.test.ts` is the vitest pattern in `@padel/auth` (pure-function tests).
- `settings.tsx` has a `legal` section at line ~57; insert an Account section above it. Styles `styles.section`, `styles.row`, `styles.rowLabel` exist. `useRouter`/`Pressable`/`Text` already imported.
- `@/lib/supabase` is the app's client; `useSession().session?.user.email` gives the email.

## File Structure
```
packages/auth/src/password.ts        changePassword helper
packages/auth/src/password.test.ts   unit test (mock client)
packages/auth/src/index.ts            (modify: export ./password)
apps/mobile/lib/i18n-mobile.ts        (modify: + change-password keys)
apps/mobile/app/profile/change-password.tsx   (create: the form)
apps/mobile/app/profile/settings.tsx  (modify: + Account section / Change password row)
```

---

## Task 1: `changePassword` helper + unit test

**Files:** Create `packages/auth/src/password.ts`, `packages/auth/src/password.test.ts`; Modify `packages/auth/src/index.ts`.

- [ ] **Step 1: Write the failing test** `packages/auth/src/password.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { changePassword } from './password';
import type { TypedClient } from '@padel/db';

const makeClient = (signInErr: unknown, updateErr: unknown) => {
  const signInWithPassword = vi.fn().mockResolvedValue({ error: signInErr });
  const updateUser = vi.fn().mockResolvedValue({ error: updateErr });
  return { client: { auth: { signInWithPassword, updateUser } } as unknown as TypedClient, signInWithPassword, updateUser };
};

describe('changePassword', () => {
  it('verifies current then updates, returning ok', async () => {
    const { client, signInWithPassword, updateUser } = makeClient(null, null);
    const r = await changePassword(client, 'a@x.com', 'old', 'newpassword');
    expect(r).toEqual({ ok: true });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@x.com', password: 'old' });
    expect(updateUser).toHaveBeenCalledWith({ password: 'newpassword' });
  });

  it('returns current_password_wrong and does not update when current is wrong', async () => {
    const { client, updateUser } = makeClient({ message: 'invalid' }, null);
    const r = await changePassword(client, 'a@x.com', 'bad', 'newpassword');
    expect(r).toEqual({ ok: false, reason: 'current_password_wrong' });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('returns update_failed when the update errors', async () => {
    const { client } = makeClient(null, { message: 'weak' });
    const r = await changePassword(client, 'a@x.com', 'old', 'newpassword');
    expect(r).toEqual({ ok: false, reason: 'update_failed' });
  });
});
```

- [ ] **Step 2: Run it — verify FAIL** (`changePassword` not defined):
```bash
pnpm --filter @padel/auth test 2>&1 | tail -15
```
Expected: FAIL importing `changePassword` from `./password`.

- [ ] **Step 3: Implement** `packages/auth/src/password.ts`:
```ts
import type { TypedClient } from '@padel/db';

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: 'current_password_wrong' | 'update_failed' };

/**
 * Verify the current password (re-auth via signInWithPassword — same user), then set the new
 * one. Returns a discriminated result so the UI can map to copy.
 */
export const changePassword = async (
  c: TypedClient,
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> => {
  const { error: verifyErr } = await c.auth.signInWithPassword({ email, password: currentPassword });
  if (verifyErr) return { ok: false, reason: 'current_password_wrong' };
  const { error: updateErr } = await c.auth.updateUser({ password: newPassword });
  if (updateErr) return { ok: false, reason: 'update_failed' };
  return { ok: true };
};
```

- [ ] **Step 4: Export.** In `packages/auth/src/index.ts` add (after `export * from './otp';`):
```ts
export * from './password';
```

- [ ] **Step 5: Run tests + typecheck — verify PASS:**
```bash
pnpm --filter @padel/auth test && pnpm --filter @padel/auth typecheck
```
Expected: tests pass, typecheck clean.

- [ ] **Step 6: Commit:**
```bash
git add packages/auth/src/password.ts packages/auth/src/password.test.ts packages/auth/src/index.ts
git commit -m "feat(auth): changePassword helper + unit test"
```

---

## Task 2: Change-password i18n keys

**Files:** Modify `apps/mobile/lib/i18n-mobile.ts`.

- [ ] **Step 1: Merge keys** into the existing `mobileProfile.en` object (keep existing):
```ts
    account: 'Account',
    changePassword: 'Change password',
    currentPassword: 'Current password',
    newPassword: 'New password',
    repeatPassword: 'Repeat new password',
    passwordTooShort: 'Password must be at least 8 characters.',
    passwordsDontMatch: "Passwords don't match.",
    currentPasswordWrong: 'Current password is incorrect.',
    updateFailed: "Couldn't update password. Please try again.",
    passwordChanged: 'Password changed.',
```

- [ ] **Step 2: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): change-password i18n keys"
```

---

## Task 3: Change-password screen + settings Account section

**Files:** Create `apps/mobile/app/profile/change-password.tsx`; Modify `apps/mobile/app/profile/settings.tsx`.

- [ ] **Step 1: Create the screen** `apps/mobile/app/profile/change-password.tsx`:
```tsx
import { changePassword } from '@padel/auth';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { supabase } from '@/lib/supabase';

export default function ChangePasswordScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const email = useSession().session?.user.email;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    if (busy || !email) return;
    if (next.length < 8) { setError(t('passwordTooShort')); return; }
    if (next !== repeat) { setError(t('passwordsDontMatch')); return; }
    setError(null);
    setBusy(true);
    try {
      const r = await changePassword(supabase, email, current, next);
      if (r.ok) {
        router.back();
        return;
      }
      setError(r.reason === 'current_password_wrong' ? t('currentPasswordWrong') : t('updateFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('changePassword') }} />
      <Text style={styles.label}>{t('currentPassword')}</Text>
      <TextInput style={styles.input} value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />
      <Text style={styles.label}>{t('newPassword')}</Text>
      <TextInput style={styles.input} value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" />
      <Text style={styles.label}>{t('repeatPassword')}</Text>
      <TextInput style={styles.input} value={repeat} onChangeText={setRepeat} secureTextEntry autoCapitalize="none" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.save, busy && styles.saveDisabled]} onPress={onSave} disabled={busy} accessibilityRole="button">
        <Text style={styles.saveText}>{t('changePassword')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { padding: 16, gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#0B1F3A', marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: '#fff' },
  error: { color: '#D7263D', fontSize: 13 },
  save: { backgroundColor: '#0B7BFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  saveDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
```
(Both imports are from `@padel/auth`; combine into one import line if preferred — `import { changePassword, useSession } from '@padel/auth';`.)

- [ ] **Step 2: Add the Account section** to `apps/mobile/app/profile/settings.tsx`, immediately before the Legal section (`<Text style={styles.section}>{t('legal')}</Text>`):
```tsx
      <Text style={styles.section}>{t('account')}</Text>
      <Pressable style={styles.row} onPress={() => router.push('/profile/change-password')} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('changePassword')}</Text>
      </Pressable>

```

- [ ] **Step 3: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add "apps/mobile/app/profile/change-password.tsx" apps/mobile/app/profile/settings.tsx
git commit -m "feat(mobile): change-password screen + settings Account section"
```
Expected: clean (`/profile/change-password` matches the existing `/profile/${string}` typed-route pattern).

---

## Task 4: Full verification

**Files:** none.

- [ ] **Step 1: Unit tests + workspace typecheck:**
```bash
pnpm --filter @padel/auth test && pnpm -w typecheck
```
Expected: PASS, 0 type errors.

- [ ] **Step 2: Manual smoke (iOS simulator, against local Supabase).**
Sign in → Profile → gear → Settings → Account → Change password. Enter the wrong current password → `currentPasswordWrong`. Enter a <8-char new password → `passwordTooShort`. Mismatched repeat → `passwordsDontMatch`. Correct current + valid matching new → returns to Settings; then log out and sign in with the NEW password (works) and the old one (fails).

- [ ] **Step 3: Finish the branch.**
Announce: "I'm using the finishing-a-development-branch skill to complete this work." Follow superpowers:finishing-a-development-branch; integration targets `feat/discovery-explore`.

---

## Self-Review notes (addressed)
- **Spec coverage:** `changePassword` helper + unit test → Task 1; i18n → Task 2; screen + settings Account row → Task 3; verification → Task 4.
- **No placeholders:** complete helper, test, screen, and settings edit; validation thresholds and error mapping spelled out.
- **Type consistency:** `ChangePasswordResult` `{ ok: true } | { ok: false; reason: 'current_password_wrong' | 'update_failed' }` defined in Task 1 and consumed in Task 3's `r.ok` / `r.reason` mapping. i18n keys used in Task 3 (`currentPasswordWrong`, `updateFailed`, `passwordTooShort`, `passwordsDontMatch`, `changePassword`, `account`, field labels) all added in Task 2.
- **Verify-then-update:** `signInWithPassword` gates the `updateUser` call (tested: update not called on wrong current).
- **Deferred:** email/phone OTP re-verify (1B-2c-2), delete account (1B-2c-3), forgot-password recovery, AU-13 other-device invalidation.
```
