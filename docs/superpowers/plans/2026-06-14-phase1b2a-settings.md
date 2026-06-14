# Phase 1B-2a — Settings Hub + Log Out + Language + Legal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a settings screen (reached from a gear on the own-profile) with language selection (live + persisted to `profiles.locale`), Terms/Privacy links, and log out, plus a boot change so the chosen language persists across restarts.

**Architecture:** A new `app/profile/settings.tsx` screen reuses `useUpdateProfile({ locale })`, `i18n.changeLanguage`, `signOut`, and `Linking`. The own-profile view gains a gear button. `_layout.tsx`'s i18n init prefers `profiles.locale` when signed in. No new tables/migration.

**Tech Stack:** Expo Router, react-i18next (`@padel/i18n`), `@padel/auth` (`signOut`), `@padel/api` (`useUpdateProfile`), Supabase.

**Spec:** `docs/superpowers/specs/2026-06-14-phase1b2a-settings-design.md`. **Branch:** `feat/phase1b2-settings` (stacked on `feat/phase1b-profile-edit`). **No migration.**

## Resolved facts
- `useT` is re-exported `useTranslation` → `const { t, i18n } = useT('profile')`; `i18n.changeLanguage(code)` switches live.
- `signOut(client)` is exported from `@padel/auth` (`packages/auth/src/session.ts`). `supabase` is `@/lib/supabase`.
- The `Boot` component routes only at startup (no live sign-out listener), so log out must `router.replace('/(auth)/sign-in')` itself.
- `profiles.locale` exists (`'en'|'pt-PT'|'pt-BR'` CHECK); RLS update `id = auth.uid()` (+ WITH CHECK from 1B-1). `UpdateProfileInput` is in `packages/api/src/profile/mutations.ts` (no `locale` yet).
- `_layout.tsx` i18n-init effect (lines ~46-69) currently uses device locale only (`resolveLocale(deviceLocale…)`), with a TODO to prefer `profiles.locale`. `supabase` is already imported there.
- `resolveLocale(candidate?: string)` (`apps/mobile/lib/locale.ts`) maps any candidate to a supported locale.
- `ProfileView` already imports `SymbolView` and `useRouter`, and renders an Edit button (1B-1) when `isSelf`.

## File Structure
```
packages/api/src/profile/mutations.ts            (modify: + locale on UpdateProfileInput)
apps/mobile/lib/i18n-mobile.ts                    (modify: + settings keys in profile ns)
apps/mobile/app/profile/settings.tsx              (create: settings hub)
apps/mobile/components/profile/ProfileView.tsx    (modify: + gear button)
apps/mobile/app/_layout.tsx                       (modify: i18n init prefers profiles.locale)
```

---

## Task 1: Add `locale` to `UpdateProfileInput`

**Files:** Modify `packages/api/src/profile/mutations.ts`.

- [ ] **Step 1:** In `UpdateProfileInput`, add a `locale` field:
```ts
export type UpdateProfileInput = {
  full_name?: string;
  description?: string | null;
  dominant_hand?: string | null;
  court_side?: string | null;
  gender?: string | null;
  preferred_time?: string | null;
  date_of_birth?: string | null;
  avatar_url?: string | null;
  locale?: string;
};
```
(Only the `locale?: string;` line is new — keep the rest as-is.)

- [ ] **Step 2: Verify + commit:**
```bash
pnpm --filter @padel/api typecheck && pnpm --filter @padel/api test
git add packages/api/src/profile/mutations.ts
git commit -m "feat(api): allow locale in UpdateProfileInput"
```
Expected: typecheck clean, tests pass.

---

## Task 2: Settings i18n keys

**Files:** Modify `apps/mobile/lib/i18n-mobile.ts`.

- [ ] **Step 1: Merge keys** into the existing `mobileProfile.en` object (keep existing keys):
```ts
    settings: 'Settings',
    preferences: 'Preferences',
    language: 'Language',
    languageEnglish: 'English',
    languagePtPt: 'Português (Portugal)',
    languagePtBr: 'Português (Brasil)',
    legal: 'Legal',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    logout: 'Log out',
```

- [ ] **Step 2: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): settings i18n keys"
```

---

## Task 3: Settings screen + profile gear

**Files:** Create `apps/mobile/app/profile/settings.tsx`; Modify `apps/mobile/components/profile/ProfileView.tsx`.

- [ ] **Step 1: Create the settings screen** `apps/mobile/app/profile/settings.tsx`:
```tsx
import { useUpdateProfile } from '@padel/api';
import { signOut } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { supabase } from '@/lib/supabase';

const TERMS_URL = 'https://padeljam.app/terms';
const PRIVACY_URL = 'https://padeljam.app/privacy';
const LANGS = [
  { code: 'en', key: 'languageEnglish' as const },
  { code: 'pt-PT', key: 'languagePtPt' as const },
  { code: 'pt-BR', key: 'languagePtBr' as const },
];

export default function SettingsScreen() {
  const { t, i18n } = useT('profile');
  const router = useRouter();
  const update = useUpdateProfile();
  const [langOpen, setLangOpen] = useState(false);

  const current = LANGS.find((l) => l.code === i18n.language) ?? LANGS[0];

  const onSelectLang = (code: string) => {
    void i18n.changeLanguage(code);
    update.mutate({ locale: code });
    setLangOpen(false);
  };

  const onLogout = async () => {
    await signOut(supabase);
    router.replace('/(auth)/sign-in');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('settings') }} />

      <Text style={styles.section}>{t('preferences')}</Text>
      <Pressable style={styles.row} onPress={() => setLangOpen((v) => !v)} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('language')}</Text>
        <Text style={styles.rowValue}>{t(current.key)}</Text>
      </Pressable>
      {langOpen &&
        LANGS.map((l) => (
          <Pressable key={l.code} style={styles.option} onPress={() => onSelectLang(l.code)} accessibilityRole="button">
            <Text style={[styles.optionText, l.code === current.code && styles.optionActive]}>{t(l.key)}</Text>
          </Pressable>
        ))}

      <Text style={styles.section}>{t('legal')}</Text>
      <Pressable style={styles.row} onPress={() => void Linking.openURL(TERMS_URL)} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('terms')}</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => void Linking.openURL(PRIVACY_URL)} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('privacy')}</Text>
      </Pressable>

      <Pressable style={styles.logout} onPress={onLogout} accessibilityRole="button">
        <Text style={styles.logoutText}>{t('logout')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { padding: 16, gap: 4 },
  section: { fontSize: 13, fontWeight: '700', color: '#6B7685', textTransform: 'uppercase', marginTop: 16, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 6 },
  rowLabel: { fontSize: 15, color: '#0B1F3A', fontWeight: '600' },
  rowValue: { fontSize: 14, color: '#6B7685' },
  option: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginBottom: 4 },
  optionText: { fontSize: 15, color: '#0B1F3A' },
  optionActive: { color: '#0B7BFF', fontWeight: '700' },
  logout: { marginTop: 24, alignItems: 'center', paddingVertical: 14 },
  logoutText: { color: '#D7263D', fontWeight: '700', fontSize: 16 },
});
```

- [ ] **Step 2: Add the gear to `ProfileView`.** In `apps/mobile/components/profile/ProfileView.tsx`, find the `isSelf` Edit-button block (added in 1B-1):
```tsx
        {isSelf && (
          <Pressable style={styles.editBtn} onPress={() => router.push('/profile/edit')} accessibilityRole="button">
            <Text style={styles.editText}>{t('edit')}</Text>
          </Pressable>
        )}
```
Replace it with an Edit + gear row:
```tsx
        {isSelf && (
          <View style={styles.selfActions}>
            <Pressable style={styles.editBtn} onPress={() => router.push('/profile/edit')} accessibilityRole="button">
              <Text style={styles.editText}>{t('edit')}</Text>
            </Pressable>
            <Pressable style={styles.gear} onPress={() => router.push('/profile/settings')} accessibilityRole="button" accessibilityLabel={t('settings')}>
              <SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} tintColor="#0B1F3A" size={22} />
            </Pressable>
          </View>
        )}
```
Add these styles to the `ProfileView` `StyleSheet.create({...})`:
```ts
  selfActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  gear: { padding: 8 },
```
(`SymbolView`, `useRouter`/`router`, `View`, `Pressable`, `Text` are already imported in `ProfileView.tsx`.)

- [ ] **Step 3: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add "apps/mobile/app/profile/settings.tsx" apps/mobile/components/profile/ProfileView.tsx
git commit -m "feat(mobile): settings hub (language, legal, logout) + profile gear"
```
Expected: clean. (`/profile/settings` is a static child of the existing `/profile/${string}` typed-route pattern, so no route-typegen needed.)

---

## Task 4: Boot prefers `profiles.locale`

**Files:** Modify `apps/mobile/app/_layout.tsx`.

- [ ] **Step 1: Replace the i18n-init effect.** Find the effect that does `const deviceLocale = Localization.getLocales()[0];` … `createI18n(locale).then(...)` (around lines 46-69) and replace the whole effect body with:
```tsx
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Prefer the signed-in user's saved locale; fall back to the device locale.
      let candidate: string | undefined;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          const { data } = await supabase.from('profiles').select('locale').eq('id', session.user.id).single();
          candidate = data?.locale ?? undefined;
        }
      } catch {
        // ignore — fall back to device locale
      }
      if (!candidate) {
        const deviceLocale = Localization.getLocales()[0];
        candidate = deviceLocale?.languageTag ?? deviceLocale?.languageCode ?? undefined;
      }
      const locale = resolveLocale(candidate);
      try {
        const instance = await createI18n(locale);
        registerMobileCopy(instance);
        if (!cancelled) setI18n(instance);
      } catch {
        const fallback = await createI18n('en');
        registerMobileCopy(fallback);
        if (!cancelled) setI18n(fallback);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
```
(`supabase`, `Localization`, `resolveLocale`, `createI18n`, `registerMobileCopy`, `setI18n` are all already imported/in scope in `_layout.tsx`.)

- [ ] **Step 2: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): boot prefers profiles.locale for app language"
```
Expected: clean.

---

## Task 5: Full verification

**Files:** none.

- [ ] **Step 1: Unit tests + workspace typecheck:**
```bash
pnpm --filter @padel/api test && pnpm -w typecheck
```
Expected: PASS, 0 type errors.

- [ ] **Step 2: Manual smoke (iOS simulator, JS only).**
Sign in → Profile tab → tap the **gear** → Settings opens. Tap **Language** → pick Português (Portugal): UI strings that are localized switch immediately. Relaunch the app (or `r` in Metro) → the language is still Portuguese (boot read `profiles.locale`). Tap **Terms of Service** / **Privacy Policy** → the browser opens the URL. Tap **Log out** → returns to the sign-in screen; the tabs are no longer reachable (the back gesture doesn't re-enter the authed app).

- [ ] **Step 3: Finish the branch.**
Announce: "I'm using the finishing-a-development-branch skill to complete this work." Follow superpowers:finishing-a-development-branch; integration targets `feat/phase1b-profile-edit` (stacked) or `feat/discovery-explore` once 1B-1 lands.

---

## Self-Review notes (addressed)
- **Spec coverage:** `locale` on `UpdateProfileInput` → Task 1; settings i18n → Task 2; settings screen (language + legal + logout) + gear entry → Task 3; boot-prefers-`profiles.locale` → Task 4; verification → Task 5.
- **No placeholders:** complete TSX for the screen, the exact ProfileView block replacement, and the full boot effect; legal URLs and language codes spelled out.
- **Type consistency:** `locale?: string` (Task 1) matches `update.mutate({ locale: code })` (Task 3). Language codes `'en'|'pt-PT'|'pt-BR'` match the `profiles.locale` CHECK and the i18n bundle locales. i18n keys used in Task 3 (`settings`, `preferences`, `language`, `language{English,PtPt,PtBr}`, `legal`, `terms`, `privacy`, `logout`) all added in Task 2.
- **No migration:** language writes the existing `profiles.locale`; RLS already permits self-update.
- **Log-out redirect:** explicit `router.replace('/(auth)/sign-in')` since the Boot guard only runs at startup.
- **Deferred:** notifications/`user_settings` (1B-2b), password/OTP/delete (1B-2c), app-icon/support (1B-2d), account/subscription rows (1C).
