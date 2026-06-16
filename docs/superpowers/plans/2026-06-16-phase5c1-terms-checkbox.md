# Phase 5C-1 — Terms Checkbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a Terms of Use / Privacy Policy checkbox to enable Continue on the Create-account screen (AU-15).

**Architecture:** An inline checkbox + tappable links on `create-account.tsx`, gating the existing Continue button. Client-only; no backend, no new component.

**Tech Stack:** React Native (`Linking`), Expo Router, `@padel/i18n`.

**Spec:** `docs/superpowers/specs/2026-06-16-phase5c1-terms-checkbox-design.md`

**Verification:** `pnpm -w typecheck`; simulator smoke (Continue disabled until checked; links open).

**Verified context:** `create-account.tsx` has `fullName`/`secondary`/`password`/`busy` state + a `submit` fn (early-returns on empty fields) + a Continue `Pressable` `style={[styles.button, busy && styles.buttonDisabled]} onPress={submit} disabled={busy}`. `TERMS_URL`/`PRIVACY_URL` live in `settings.tsx`. No checkbox component exists.

---

## Task 1: Terms checkbox gating Continue

**Files:**
- Modify: `apps/mobile/app/(auth)/create-account.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: Add the i18n fragments**

In `apps/mobile/lib/i18n-mobile.ts`, add to the `auth` namespace's `en` object:

```ts
    termsAgreePrefix: 'I agree to the ',
    termsLink: 'Terms of Use',
    termsAnd: ' and ',
    privacyLink: 'Privacy Policy',
```
(Find the `mobileAuth` const / `auth` namespace; it's registered via `registerMobileCopy`.)

- [ ] **Step 2: Add the checkbox + gate Continue**

In `apps/mobile/app/(auth)/create-account.tsx`:

Add `Linking` to the `react-native` import. Add the two URL constants near the top of the module (mirroring `settings.tsx`):

```tsx
const TERMS_URL = 'https://padeljam.app/terms';
const PRIVACY_URL = 'https://padeljam.app/privacy';
```

Add state in the component:

```tsx
  const [agreed, setAgreed] = useState(false);
```

In `submit`, add an early return after the existing empty-field guard:

```tsx
    if (!agreed) return;
```

Render the checkbox row immediately before the Continue `Pressable` (after the `{error ? ... : null}` line):

```tsx
        <Pressable style={styles.termsRow} onPress={() => setAgreed((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }}>
          <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
            {agreed ? <Text style={styles.checkboxMark}>✓</Text> : null}
          </View>
          <Text style={styles.termsText}>
            {t('termsAgreePrefix')}
            <Text style={styles.termsLink} onPress={() => void Linking.openURL(TERMS_URL)}>{t('termsLink')}</Text>
            {t('termsAnd')}
            <Text style={styles.termsLink} onPress={() => void Linking.openURL(PRIVACY_URL)}>{t('privacyLink')}</Text>
          </Text>
        </Pressable>
```

Gate the Continue button — change its `style`/`disabled` to include `!agreed`:

```tsx
        <Pressable
          style={[styles.button, (busy || !agreed) && styles.buttonDisabled]}
          onPress={submit}
          disabled={busy || !agreed}
          accessibilityRole="button"
        >
```

Add styles to the `StyleSheet`:

```tsx
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16, marginBottom: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#9AA7B6', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxOn: { backgroundColor: '#0B7BFF', borderColor: '#0B7BFF' },
  checkboxMark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  termsText: { flex: 1, fontSize: 13, color: '#3A4A5E', lineHeight: 18 },
  termsLink: { color: '#0B7BFF', fontWeight: '700' },
```
(`View` is already imported; if not, add it to the `react-native` import.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add 'apps/mobile/app/(auth)/create-account.tsx' apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(auth): required Terms/Privacy checkbox gating create-account (AU-15)"
```

---

## Verification gate
```bash
pnpm -w typecheck
# Simulator: Continue stays disabled (dimmed) until the box is checked + fields filled; the two links open the browser.
```

## Self-Review
- AU-15 (checkbox required to enable Continue) → Task 1 (`!agreed` in `disabled` + `submit` guard). ✓
- Tappable Terms/Privacy links → Task 1 (nested `Text` `onPress` → `Linking.openURL`). ✓
- i18n fragments for the two-link sentence → Task 1 Step 1. ✓
- Placeholder scan: none. Type consistency: `agreed` state used in render + `submit` + button; styles defined; `Linking`/`View` imports noted. ✓
- Client-only, no backend (matches spec). Recovery flow is 5C-2. ✓
