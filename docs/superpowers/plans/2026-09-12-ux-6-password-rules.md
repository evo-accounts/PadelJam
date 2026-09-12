# UX-GLOB-07 Password Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every password input shows a show/hide eye; every screen that creates or changes a password lists the four rules under the input with live per-rule state; the server enforces the same rules.

**Architecture:** A pure `passwordRules(value)` helper is the single client validator. A `PasswordField` primitive wraps `Field` with the eye toggle and an optional live checklist. The four password screens adopt it. Server: `password_requirements` in the Supabase auth config and a matching check in the `complete-account` edge function.

**Tech Stack:** react-native, the `Field` primitive, expo-symbols, vitest, Supabase config.toml, Deno edge function.

**Spec:** `docs/superpowers/specs/2026-09-12-ux-global-rules-design.md` section 6. **Depends on:** the foundations PR (for `IconButton` in the field; already on main) — no other dependency.

**Prerequisites:** `git fetch origin && git checkout -b feat/ux-password-rules origin/main`.

---

### Task 1: `passwordRules` with tests

**Files:**
- Create: `apps/mobile/lib/passwordRules.ts`, `apps/mobile/lib/passwordRules.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, it } from 'vitest';
import { passwordRules, passwordValid } from './passwordRules';

describe('passwordRules', () => {
  it('reports each rule separately', () => {
    expect(passwordRules('abc')).toEqual({ minLength: false, uppercase: false, number: false, symbol: false });
    expect(passwordRules('Padel1234#')).toEqual({ minLength: true, uppercase: true, number: true, symbol: true });
    expect(passwordRules('padel1234#')).toEqual({ minLength: true, uppercase: false, number: true, symbol: true });
    expect(passwordRules('Padelpadel#')).toEqual({ minLength: true, uppercase: true, number: false, symbol: true });
    expect(passwordRules('Padel12345')).toEqual({ minLength: true, uppercase: true, number: true, symbol: false });
  });
  it('counts unicode uppercase and any non-alphanumeric as a symbol', () => {
    expect(passwordRules('Ólá12345!').uppercase).toBe(true);
    expect(passwordRules('Abcdefg1 ').symbol).toBe(true);
  });
  it('passwordValid is the conjunction', () => {
    expect(passwordValid('Padel1234#')).toBe(true);
    expect(passwordValid('padel1234#')).toBe(false);
  });
});
```
- [ ] **Step 2: Implement**
```ts
// apps/mobile/lib/passwordRules.ts
/** UX-GLOB-07. Mirrors GoTrue's `lower_upper_letters_digits_symbols` and the complete-account function. */
export type PasswordRuleKey = 'minLength' | 'uppercase' | 'number' | 'symbol';
export const PASSWORD_RULE_KEYS: PasswordRuleKey[] = ['minLength', 'uppercase', 'number', 'symbol'];

export function passwordRules(value: string): Record<PasswordRuleKey, boolean> {
  return {
    minLength: value.length >= 8,
    uppercase: /\p{Lu}/u.test(value),
    number: /\d/.test(value),
    symbol: /[^\p{L}\p{N}]/u.test(value),
  };
}
export function passwordValid(value: string): boolean {
  return Object.values(passwordRules(value)).every(Boolean);
}
```
- [ ] **Step 3:** `pnpm --filter mobile test -- passwordRules` → 3 passed. Commit `feat(mobile): passwordRules validator`.

---

### Task 2: `PasswordField` primitive

**Files:**
- Create: `apps/mobile/components/ui/PasswordField.tsx`
- Modify: `apps/mobile/components/ui/index.ts`, `apps/mobile/components/ui/Gallery.stories.tsx`
- Modify: `packages/i18n/src/resources/*/common.json` (rule labels and eye labels)

- [ ] **Step 1: Copy** (three locales) in `common.json`: `showPassword` "Show password", `hidePassword` "Hide password", `ruleMinLength` "Minimum 8 characters", `ruleUppercase` "At least one uppercase letter", `ruleNumber` "At least one number", `ruleSymbol` "At least one symbol". pt-PT: "Mostrar palavra-passe" / "Ocultar palavra-passe" / "Mínimo de 8 caracteres" / "Pelo menos uma letra maiúscula" / "Pelo menos um número" / "Pelo menos um símbolo". pt-BR: "Mostrar senha" / "Ocultar senha" / "Mínimo de 8 caracteres" / "Pelo menos uma letra maiúscula" / "Pelo menos um número" / "Pelo menos um símbolo".

- [ ] **Step 2: Component**
```tsx
// apps/mobile/components/ui/PasswordField.tsx
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View, type TextInputProps, type ViewStyle } from 'react-native';

import { colors, space } from '../../theme';
import { Field } from './Field';
import { IconButton } from './IconButton';
import { Text } from './Text';
import { passwordRules, PASSWORD_RULE_KEYS, type PasswordRuleKey } from '@/lib/passwordRules';

type Props = Omit<TextInputProps, 'style' | 'secureTextEntry'> & {
  label?: string;
  value: string;
  /** Show the four-rule checklist with live state (creation/change screens). */
  showRules?: boolean;
  error?: string | null;
  containerStyle?: ViewStyle;
  testID?: string;
};

const RULE_KEY: Record<PasswordRuleKey, string> = {
  minLength: 'ruleMinLength', uppercase: 'ruleUppercase', number: 'ruleNumber', symbol: 'ruleSymbol',
};

export function PasswordField({ label, value, showRules = false, error, containerStyle, testID, ...rest }: Props) {
  const { t } = useT('common');
  const [visible, setVisible] = useState(false);
  const rules = passwordRules(value);
  return (
    <View style={containerStyle}>
      <View style={styles.row}>
        <Field
          label={label}
          value={value}
          error={error}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType={showRules ? 'newPassword' : 'password'}
          containerStyle={styles.field}
          testID={testID}
          {...rest}
        />
        <IconButton
          icon={<SymbolView name={{ ios: visible ? 'eye.slash' : 'eye', android: visible ? 'visibility_off' : 'visibility', web: 'eye' }} size={20} tintColor={colors.mutedForeground} />}
          accessibilityLabel={visible ? t('hidePassword') : t('showPassword')}
          size="md"
          onPress={() => setVisible((v) => !v)}
          style={[styles.eye, label ? styles.eyeWithLabel : null]}
          testID={testID ? `${testID}-toggle` : undefined}
        />
      </View>
      {showRules ? (
        <View style={styles.rules} accessibilityRole="list">
          {PASSWORD_RULE_KEYS.map((k) => (
            <Text key={k} variant="hint" tone={rules[k] ? 'success' : 'muted'} accessibilityLabel={`${t(RULE_KEY[k])}: ${rules[k] ? 'ok' : 'missing'}`}>
              {rules[k] ? '✓ ' : '○ '}{t(RULE_KEY[k])}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  field: { flex: 1 },
  eye: { position: 'absolute', right: space[2], top: space[1] },
  eyeWithLabel: { top: space[6] },
  rules: { marginTop: space[2], gap: space[1] },
});
```
Adjust `eyeWithLabel` so the eye sits vertically centred on the input (label height + half the 44 pt input); verify in the gallery. Export from `index.ts`; add a Gallery section "PasswordField" with `showRules` and a value of `Padel12` so two rules are ticked.

- [ ] **Step 3:** Checks; commit `feat(ui): PasswordField with eye toggle and live rules`.

---

### Task 3: The four screens

**Files:** `app/(auth)/create-account.tsx:348-353` (rules), `app/(auth)/recovery.tsx:142,144` (rules on both inputs; the confirm input without rules), `app/profile/change-password.tsx:49,51,53` (current password: eye only; new: rules; repeat: eye only), `app/(auth)/password.tsx:57-63` (eye only).

- [ ] **Step 1:** Replace each raw `TextInput secureTextEntry` with `PasswordField`; validation before submit uses `passwordValid(pw)` (replace `pw.length < 8`). On failure show the banner from the submission-feedback plan if merged, else the screen's existing error path. Remove the `passwordTooShort` message where the checklist now explains the requirement.
- [ ] **Step 2:** E2E suite 01 types passwords into these fields by ordinal (`typeText` finds inputs by position); the eye button is a `Button`, not an input, so ordinals hold. Run `pnpm --filter mobile e2e -- --suite 01`.
- [ ] **Step 3:** Commit `feat(mobile): password screens state the rules and toggle visibility`.

---

### Task 4: Server enforcement

**Files:**
- Modify: `infra/supabase/config.toml:188` → `password_requirements = "lower_upper_letters_digits_symbols"`
- Modify: `infra/supabase/functions/complete-account/index.ts:47`
- Modify: `infra/supabase/tests/lib.mjs` — nothing; but `Padel1234#` already satisfies the rules.

- [ ] **Step 1:** In `complete-account/index.ts`, replace the length check with:
```ts
const PASSWORD_OK = (p: string) => p.length >= 8 && /\p{Lu}/u.test(p) && /\d/.test(p) && /[^\p{L}\p{N}]/u.test(p);
if (!password || !PASSWORD_OK(password)) return json({ error: 'password_weak' }, 400);
```
and map `password_weak` in the client (`packages/api/src/client.ts` `KNOWN` if the create-account screen routes through `mapPgError`; otherwise the screen's own error switch) to the `auth` key `passwordWeak` ("Password does not meet the rules" / three locales).
- [ ] **Step 2:** Restart the local stack (`pnpm dlx supabase@latest --workdir infra stop && … start`) so the auth config applies; sign up via the app with `padel1234` → refused; with `Padel1234#` → accepted. Existing E2E personas use `demo1234` for password sign-in: GoTrue applies requirements on set, not on sign-in, so `seed-e2e.mjs` keeps working; but `adminCreateUser` with `demo1234` may be refused by the admin API under the new requirement — if `pnpm seed:e2e` fails, change `PW` in `infra/seed/seed-e2e.mjs` and `seed-demo.mjs` to `Demo1234#` and update `apps/mobile/e2e` fixtures that type it (grep `demo1234`).
- [ ] **Step 3:** Commit `feat(auth): enforce the password rules server-side`. Hosted hand-off: Authentication → Providers → Email → Password requirements = "Lowercase, uppercase, digits and symbols"; redeploy `complete-account` (dashboard Code tab).

---

### Task 5: Verification and PR

- [ ] `pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test`; suites 01 and (if the seed password changed) the full E2E run.
- [ ] PR `feat/ux-password-rules` → main, spec section 6, with the hosted steps in the body. End with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
