# Phase 5C-2 — Auth Recovery Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Try-another-way sheet, password sign-in fallback, and OTP password-recovery flow off the OTP screen (AU-10 generic / AU-11 / AU-12/13), and confirm lazy secondary verification (AU-07).

**Architecture:** Two `@padel/auth` helpers (`signInWithPassword`, `setPassword`); a generic action sheet on `otp.tsx`; a password sign-in screen (rate-limited via `otpReducer`); a single 3-step recovery screen (OTP to the entered identifier → new password → success). Reuses the OTP infra + `getAuthTarget()`.

**Tech Stack:** Expo Router, React Native, `@padel/auth` (Supabase Auth), `@padel/i18n`.

**Spec:** `docs/superpowers/specs/2026-06-16-phase5c2-auth-recovery-design.md`

**Verification:** `pnpm --filter @padel/auth test` + `pnpm -w typecheck`; full flow on a dev build (OTP via local inbucket).

**Verified context:**
- `otpReducer` (`@padel/auth`): `{attempts,locked,cooldownUntil}`; `'sent'` resets + sets cooldown, `'fail'` increments + `locked` at `MAX_ATTEMPTS=5`, `'reset'`. `RESEND_COOLDOWN_MS=30_000`.
- `password.ts` `changePassword` uses `c.auth.signInWithPassword({ email, password })` + `c.auth.updateUser({ password })`. Both `otp.ts` + `password.ts` are re-exported from `@padel/auth`.
- `otp.tsx`: single numeric `TextInput` (`code`), `verify()` → on success checks `profiles` (exists → `/(tabs)`, else → `/(auth)/create-account`); `resend()` re-sends OTP by `kind`; `tryAnotherWay()` currently `dispatch reset` + `router.replace('/(auth)/sign-in')`.
- `getAuthTarget()` → `{ identifier, kind }`; `supabase` from `@/lib/supabase`.

---

## File Structure
- **Modify** `packages/auth/src/password.ts` (+ `password.test.ts`) — `signInWithPassword`, `setPassword`.
- **Modify** `apps/mobile/app/(auth)/otp.tsx` — Try-another-way modal sheet.
- **Create** `apps/mobile/app/(auth)/password.tsx` — password sign-in fallback.
- **Create** `apps/mobile/app/(auth)/recovery.tsx` — 3-step recovery.
- **Modify** `apps/mobile/lib/i18n-mobile.ts` — `auth` keys.

---

## Task 1: @padel/auth helpers

**Files:**
- Modify: `packages/auth/src/password.ts`
- Modify: `packages/auth/src/password.test.ts`

- [ ] **Step 1: Add the helpers**

Append to `packages/auth/src/password.ts`:

```ts
import type { IdentifierKind } from './otp-kinds'; // if no such module, inline the union below
```
(If there is no shared `IdentifierKind` in `@padel/auth`, define it locally instead: `type IdentifierKind = 'email' | 'phone';` at the top of `password.ts`.)

```ts
// Password sign-in with an email or phone identifier (the one entered on the identifier screen).
export const signInWithPassword = (
  c: TypedClient,
  identifier: string,
  kind: 'email' | 'phone',
  password: string,
) =>
  c.auth.signInWithPassword(
    kind === 'phone' ? { phone: identifier, password } : { email: identifier, password },
  );

// Set a new password for the currently-authenticated user (used after a recovery OTP login).
export const setPassword = (c: TypedClient, password: string) => c.auth.updateUser({ password });
```
(Keep it minimal — `IdentifierKind` inline as `'email' | 'phone'` in the signature is fine; no new import needed.)

- [ ] **Step 2: Add unit tests**

Append to `packages/auth/src/password.test.ts` (mirror the `email-change.test.ts` mock-client style):

```ts
import { signInWithPassword, setPassword } from './password';

it('signInWithPassword uses email for email kind', async () => {
  const signIn = vi.fn().mockResolvedValue({ data: {}, error: null });
  const c = { auth: { signInWithPassword: signIn } } as unknown as TypedClient;
  await signInWithPassword(c, 'a@x.com', 'email', 'pw12345678');
  expect(signIn).toHaveBeenCalledWith({ email: 'a@x.com', password: 'pw12345678' });
});

it('signInWithPassword uses phone for phone kind', async () => {
  const signIn = vi.fn().mockResolvedValue({ data: {}, error: null });
  const c = { auth: { signInWithPassword: signIn } } as unknown as TypedClient;
  await signInWithPassword(c, '+351900000001', 'phone', 'pw12345678');
  expect(signIn).toHaveBeenCalledWith({ phone: '+351900000001', password: 'pw12345678' });
});

it('setPassword calls updateUser with the new password', async () => {
  const updateUser = vi.fn().mockResolvedValue({ data: {}, error: null });
  const c = { auth: { updateUser } } as unknown as TypedClient;
  await setPassword(c, 'newpw12345');
  expect(updateUser).toHaveBeenCalledWith({ password: 'newpw12345' });
});
```
(Match the existing imports in `password.test.ts` — `vi`, `TypedClient`, the `it`/`expect` from the test setup. If the file uses a shared `makeClient()` helper, reuse it.)

- [ ] **Step 3: Test + typecheck**

Run: `pnpm --filter @padel/auth test` → all pass. `pnpm --filter @padel/auth typecheck` → PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/auth/src/password.ts packages/auth/src/password.test.ts
git commit -m "feat(auth): signInWithPassword + setPassword helpers"
```

---

## Task 2: Try-another-way sheet on otp.tsx

**Files:**
- Modify: `apps/mobile/app/(auth)/otp.tsx`

- [ ] **Step 1: Replace tryAnotherWay with a modal sheet**

In `apps/mobile/app/(auth)/otp.tsx`: add `Modal` to the `react-native` import + a `sheetOpen` state
(`const [sheetOpen, setSheetOpen] = useState(false)`). Change the `tryAnotherWay` handler to open the
sheet (`() => setSheetOpen(true)`), and add the sheet markup before the closing `</View>`:

```tsx
      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)}>
          <View style={styles.sheet}>
            <Pressable
              style={styles.sheetRow}
              onPress={() => { setSheetOpen(false); router.push('/(auth)/password' as never); }}
              accessibilityRole="button"
            >
              <Text style={styles.sheetText}>{t('usePassword')}</Text>
            </Pressable>
            <Pressable
              style={styles.sheetRow}
              onPress={() => { setSheetOpen(false); dispatch({ type: 'reset' }); router.replace('/(auth)/sign-in'); }}
              accessibilityRole="button"
            >
              <Text style={styles.sheetText}>{t('useDifferentId')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
```

Add the sheet styles to the `StyleSheet`:

```tsx
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingVertical: 8 },
  sheetRow: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  sheetText: { fontSize: 16, color: '#0B1F3A', fontWeight: '600' },
```

> The existing "Try another way" `Pressable` keeps its label (`t('tryAnotherWay')`); only its `onPress` changes to `() => setSheetOpen(true)`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter mobile typecheck` → PASS. (Route `/(auth)/password` may be unknown to typed routes until the file exists in Task 3 — the `as never` cast covers it.)

- [ ] **Step 3: Commit**

```bash
git add 'apps/mobile/app/(auth)/otp.tsx'
git commit -m "feat(auth): Try-another-way sheet (password / different identifier)"
```

---

## Task 3: password sign-in screen

**Files:**
- Create: `apps/mobile/app/(auth)/password.tsx`

- [ ] **Step 1: Create the screen**

Create `apps/mobile/app/(auth)/password.tsx`:

```tsx
import { initialOtpState, otpReducer, signInWithPassword } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useReducer, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAuthTarget } from '@/lib/auth-flow';
import { supabase } from '@/lib/supabase';

export default function PasswordScreen() {
  const { t } = useT('auth');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { identifier, kind } = getAuthTarget();

  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, dispatch] = useReducer(otpReducer, undefined, initialOtpState);

  const submit = async () => {
    if (busy || state.locked || !password) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: signInError } = await signInWithPassword(supabase, identifier, kind, password);
      if (signInError || !data.user) {
        dispatch({ type: 'fail' });
        setError(t('passwordWrong'));
        return;
      }
      const { data: profile } = await supabase.from('profiles').select('id').eq('id', data.user.id).maybeSingle();
      router.replace(profile ? '/(tabs)' : '/(auth)/create-account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.title}>{t('passwordTitle')}</Text>
      <Text style={styles.help}>{t('otpHelp', { identifier })}</Text>
      <Text style={styles.label}>{t('passwordLabel')}</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder={t('passwordPlaceholder')}
        secureTextEntry
        autoCapitalize="none"
        editable={!busy && !state.locked}
        autoFocus
      />
      {state.locked ? (
        <Text style={styles.error}>{t('passwordRateLimited')}</Text>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}
      <Pressable
        style={[styles.button, (busy || state.locked || !password) && styles.buttonDisabled]}
        onPress={submit}
        disabled={busy || state.locked || !password}
        accessibilityRole="button"
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('continue')}</Text>}
      </Pressable>
      <Pressable style={styles.linkButton} onPress={() => router.push('/(auth)/recovery' as never)} accessibilityRole="button">
        <Text style={styles.link}>{t('forgotPassword')}</Text>
      </Pressable>
      <Pressable style={styles.linkButton} onPress={() => router.back()} accessibilityRole="button">
        <Text style={styles.link}>{t('tryAnotherWay')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC', paddingHorizontal: 24 },
  title: { fontSize: 24, fontWeight: '800', color: '#0B1F3A', marginBottom: 8 },
  help: { fontSize: 14, color: '#6B7685', marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: '#0B1F3A', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: '#fff' },
  error: { color: '#D7263D', fontSize: 13, marginTop: 8 },
  button: { backgroundColor: '#0B7BFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  linkButton: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  link: { color: '#0B7BFF', fontWeight: '600', fontSize: 14 },
});
```

> Styles mirror `otp.tsx`. If `otp.tsx` shares a style module, reuse it; otherwise the local copy is fine.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter mobile typecheck`. If it flags the `/(auth)/recovery` route (created in Task 4), the `as never` cast covers it. Expected: PASS. If typed routes need regenerating after Task 4, briefly start Metro then re-run.

- [ ] **Step 3: Commit**

```bash
git add 'apps/mobile/app/(auth)/password.tsx'
git commit -m "feat(auth): password sign-in fallback screen"
```

---

## Task 4: recovery screen (3-step)

**Files:**
- Create: `apps/mobile/app/(auth)/recovery.tsx`

- [ ] **Step 1: Create the screen**

Create `apps/mobile/app/(auth)/recovery.tsx`:

```tsx
import {
  initialOtpState,
  otpReducer,
  setPassword as setUserPassword,
  startEmailOtp,
  startPhoneOtp,
  verifyEmailOtp,
  verifyPhoneOtp,
} from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useReducer, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAuthTarget } from '@/lib/auth-flow';
import { supabase } from '@/lib/supabase';

type Step = 'code' | 'password' | 'done';

export default function RecoveryScreen() {
  const { t } = useT('auth');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { identifier, kind } = getAuthTarget();

  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otp, dispatch] = useReducer(otpReducer, undefined, initialOtpState);
  const [now, setNow] = useState(Date.now());

  // Auto-send the recovery code to the entered identifier on mount.
  useEffect(() => {
    (kind === 'phone' ? startPhoneOtp(supabase, identifier) : startEmailOtp(supabase, identifier))
      .then(() => dispatch({ type: 'sent', at: Date.now() }))
      .catch(() => setError(t('recoveryCodeSent')));
  }, [identifier, kind, t]);

  useEffect(() => {
    if (otp.cooldownUntil <= now) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [otp.cooldownUntil, now]);
  const cooldown = Math.max(0, Math.ceil((otp.cooldownUntil - now) / 1000));

  const verifyCode = async () => {
    if (busy || code.length < 6) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: vErr } =
        kind === 'phone'
          ? await verifyPhoneOtp(supabase, identifier, code)
          : await verifyEmailOtp(supabase, identifier, code);
      if (vErr || !data.user) {
        setError(vErr?.message ?? t('passwordWrong'));
        return;
      }
      setStep('password');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || cooldown > 0) return;
    setBusy(true);
    try {
      await (kind === 'phone' ? startPhoneOtp(supabase, identifier) : startEmailOtp(supabase, identifier));
      dispatch({ type: 'sent', at: Date.now() });
      setNow(Date.now());
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    if (busy) return;
    if (pw.length < 8) { setError(t('passwordTooShort')); return; }
    if (pw !== pw2) { setError(t('passwordsDontMatch')); return; }
    setBusy(true);
    setError(null);
    try {
      const { error: sErr } = await setUserPassword(supabase, pw);
      if (sErr) { setError(t('passwordWrong')); return; }
      setStep('done');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    const { data } = await supabase.auth.getUser();
    const { data: profile } = data.user
      ? await supabase.from('profiles').select('id').eq('id', data.user.id).maybeSingle()
      : { data: null };
    router.replace(profile ? '/(tabs)' : '/(auth)/create-account');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      {step === 'code' ? (
        <>
          <Text style={styles.title}>{t('recoveryTitle')}</Text>
          <Text style={styles.help}>{t('recoveryCodeSent', { identifier })}</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={6}
            editable={!busy}
            autoFocus
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.button, (busy || code.length < 6) && styles.buttonDisabled]} onPress={verifyCode} disabled={busy || code.length < 6} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('continue')}</Text>}
          </Pressable>
          <Pressable style={styles.linkButton} onPress={resend} disabled={busy || cooldown > 0} accessibilityRole="button">
            <Text style={[styles.link, cooldown > 0 && { color: '#9AA7B6' }]}>{cooldown > 0 ? t('cooldown', { seconds: cooldown }) : t('resend')}</Text>
          </Pressable>
        </>
      ) : step === 'password' ? (
        <>
          <Text style={styles.title}>{t('newPasswordTitle')}</Text>
          <Text style={styles.label}>{t('newPasswordLabel')}</Text>
          <TextInput style={styles.input} value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" editable={!busy} />
          <Text style={[styles.label, { marginTop: 12 }]}>{t('confirmPasswordLabel')}</Text>
          <TextInput style={styles.input} value={pw2} onChangeText={setPw2} secureTextEntry autoCapitalize="none" editable={!busy} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={savePassword} disabled={busy} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('continue')}</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.title}>{t('recoveryDoneTitle')}</Text>
          <Pressable style={styles.button} onPress={finish} accessibilityRole="button">
            <Text style={styles.buttonText}>{t('recoveryDoneCta')}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC', paddingHorizontal: 24 },
  title: { fontSize: 24, fontWeight: '800', color: '#0B1F3A', marginBottom: 8 },
  help: { fontSize: 14, color: '#6B7685', marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: '#0B1F3A', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: '#fff' },
  error: { color: '#D7263D', fontSize: 13, marginTop: 8 },
  button: { backgroundColor: '#0B7BFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  linkButton: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  link: { color: '#0B7BFF', fontWeight: '600', fontSize: 14 },
});
```

- [ ] **Step 2: Typecheck (regen routes if needed)**

Run: `pnpm --filter mobile typecheck`. If `/(auth)/password` or `/(auth)/recovery` route literals error, briefly start Metro to regenerate typed routes (`cd apps/mobile && (npx expo start >/tmp/metro.log 2>&1 &) ; sleep 25 ; pkill -f "expo start" ; cd ../..`) then re-run. (Pushes use `as never`.) Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add 'apps/mobile/app/(auth)/recovery.tsx'
git commit -m "feat(auth): password recovery flow (code -> new password -> success)"
```

---

## Task 5: i18n keys + AU-07 verification

**Files:**
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: Add the auth i18n keys**

In `apps/mobile/lib/i18n-mobile.ts`, add to the `auth` namespace's `en` object (reuse existing
`tryAnotherWay`/`resend`/`cooldown`/`passwordLabel`/`continue` if already present — only add what's missing):

```ts
    usePassword: 'Sign in with password',
    useDifferentId: 'Use a different email or phone',
    passwordTitle: 'Enter your password',
    passwordPlaceholder: 'Password',
    passwordWrong: "That password doesn't match our records.",
    passwordRateLimited: 'Too many attempts. Use Try another way or wait a few minutes.',
    forgotPassword: 'Forgot password?',
    recoveryTitle: 'Password recovery',
    recoveryCodeSent: "We've sent a verification code to {{identifier}}.",
    newPasswordTitle: 'New password',
    newPasswordLabel: 'New password',
    confirmPasswordLabel: 'Confirm new password',
    passwordsDontMatch: "Passwords don't match.",
    passwordTooShort: 'Password must be at least 8 characters.',
    recoveryDoneTitle: 'Your password has been changed.',
    recoveryDoneCta: 'Continue',
```
(If `passwordLabel`, `continue`, `tryAnotherWay`, `resend`, `cooldown`, `otpHelp` already exist in the
`auth` namespace — they do, used by otp/create-account — do not duplicate them.)

- [ ] **Step 2: AU-07 verification (no code unless blocked)**

Manually confirm (document the result; no code expected): a user who completed an account (secondary
identifier set unconfirmed by `complete-account`) can sign in via that secondary channel — the
identifier-first flow sends an OTP to it and a successful verify logs them in (confirming it). If
`signInWithOtp` to the unconfirmed secondary is rejected, add the minimal fix and note it; otherwise
record "AU-07 satisfied by the existing OTP flow." This is a dev-build check (OTP via inbucket) —
deferred like other native checks; capture the conclusion in the PR/commit notes.

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter mobile typecheck` → PASS.
```bash
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(auth): recovery-flow i18n keys"
```

---

## Verification gate (whole phase)
```bash
pnpm --filter @padel/auth test
pnpm -w typecheck
# Full flow (sheet -> password / forgot -> code -> new password -> success) on a dev build (inbucket OTP). Deferred.
```

## Self-Review
**Spec coverage:** signInWithPassword/setPassword + tests → Task 1. Generic Try-another-way sheet (password / different id) → Task 2. Password sign-in + 5-attempt lock (otpReducer) + Forgot link → Task 3. Recovery (OTP to entered identifier → new password ≥8/match → success → into app) → Task 4. i18n → Task 5. AU-07 verify-only → Task 5 Step 2. ✓
**Placeholder scan:** none — full code in helpers + both screens + sheet.
**Type consistency:** `signInWithPassword(c, identifier, kind, password)` / `setPassword(c, password)` (Task 1) match the screen call sites (Tasks 3/4). `otpReducer`/`initialOtpState`/`start*Otp`/`verify*Otp` reused as in `otp.tsx`. Routes `/(auth)/password` + `/(auth)/recovery` created in Tasks 3/4, referenced via `as never` in Task 2/3. i18n keys (Task 5) cover every `t(...)` in Tasks 2–4; existing keys (`otpHelp`,`continue`,`resend`,`cooldown`,`passwordLabel`,`tryAnotherWay`) reused, not duplicated.
**Known notes:** rate-limit reuses `otpReducer` (lock after 5 fails; no time-based auto-unlock — matches OTP behavior, acceptable). Recovery success routes into the app (user authed post-OTP), per the spec decision. AU-13 (other sessions) is Supabase password-change behavior.
