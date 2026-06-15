# Phase 1B-2d-2 — App-Icon Picker (scaffold) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an app-icon picker (2×3 grid) that switches the device icon via `expo-dynamic-app-icon`, with placeholder icon assets and the native config plugin.

**Architecture:** Install `expo-dynamic-app-icon` (config plugin + `setAppIcon`/`getAppIcon`), add 6 placeholder icon assets + the plugin config, and a `/profile/app-icon` picker screen + settings row. No DB/API — the OS persists the selection.

**Tech Stack:** `expo-dynamic-app-icon`, Expo config plugin, Expo Router, RN. **Verification = typecheck only** (the actual switch needs a native rebuild — not runnable here).

**Spec:** `docs/superpowers/specs/2026-06-15-phase1b2d2-app-icon-design.md`. **Branch:** `feat/phase1b2d2-app-icon` (stacked on `feat/phase1b2d-support`). **No migration.**

## Resolved facts
- No alternate-icon lib/assets exist; only `apps/mobile/assets/images/icon.png`. `app.json` `plugins` is an array (already has `expo-location` etc.).
- Settings hub has a Preferences section (Language row) + Support/Legal sections (Support from the stacked 1B-2d-1). Add an App-icon row in Preferences.
- **The exact `expo-dynamic-app-icon` API + config-plugin shape are version-specific** — Task 1 reconciles them from the installed package before the picker is written.

## File Structure
```
apps/mobile/package.json                       (modify: + expo-dynamic-app-icon, via expo install)
apps/mobile/assets/app-icons/*.png             (create: 6 placeholder icons, copies of icon.png)
apps/mobile/app.json                           (modify: + expo-dynamic-app-icon plugin config)
apps/mobile/lib/i18n-mobile.ts                 (modify: + app-icon keys)
apps/mobile/app/profile/app-icon.tsx           (create: 2×3 picker)
apps/mobile/app/profile/settings.tsx           (modify: + App icon row in Preferences)
```

---

## Task 1: Install lib + placeholder assets + config plugin

**Files:** Modify `apps/mobile/package.json`, `apps/mobile/app.json`; Create `apps/mobile/assets/app-icons/{default,blue,dark,light,mono,classic}.png`.

- [ ] **Step 1: Install the library.**
```bash
cd apps/mobile && npx expo install expo-dynamic-app-icon
```
Expected: added to `apps/mobile/package.json`. (If the sandbox blocks network, report BLOCKED — the controller installs it, as with `expo-location`.)

- [ ] **Step 2: Reconcile the API + config shape (the key unknown).** Read the installed package to record the EXACT exports and config-plugin format:
```bash
cd /Users/joaopaulos4/Cursor/PadelJam
sed -n '1,80p' node_modules/expo-dynamic-app-icon/README.md 2>/dev/null
cat node_modules/expo-dynamic-app-icon/build/*.d.ts 2>/dev/null | grep -nE "export|setAppIcon|getAppIcon|function|declare" | head -30
```
Note the precise `setAppIcon`/`getAppIcon` (or equivalently-named) signatures and the `app.json` plugin config shape (the `icons` map format: per-icon `image`/`ios`/`android` keys). **Tasks 3 and the plugin config in Step 4 must match what you find here** (the snippets below are the expected shape — adjust to the installed version).

- [ ] **Step 3: Create 6 placeholder icons** (identical copies of the existing icon; replace with real art before release):
```bash
cd /Users/joaopaulos4/Cursor/PadelJam
mkdir -p apps/mobile/assets/app-icons
for n in default blue dark light mono classic; do cp apps/mobile/assets/images/icon.png "apps/mobile/assets/app-icons/$n.png"; done
ls apps/mobile/assets/app-icons
```
Expected: 6 PNGs.

- [ ] **Step 4: Add the config plugin** to `apps/mobile/app.json` `expo.plugins` (append; **match the installed version's documented shape** from Step 2 — this representative form is the common one):
```json
[
  "expo-dynamic-app-icon",
  {
    "blue": { "image": "./assets/app-icons/blue.png", "prerendered": true },
    "dark": { "image": "./assets/app-icons/dark.png", "prerendered": true },
    "light": { "image": "./assets/app-icons/light.png", "prerendered": true },
    "mono": { "image": "./assets/app-icons/mono.png", "prerendered": true },
    "classic": { "image": "./assets/app-icons/classic.png", "prerendered": true }
  }
]
```
(`default` uses the app's main `icon`; the 5 alternates are declared here. If the installed version expects a different key/shape, use that.)

- [ ] **Step 5: Validate manifest + commit.**
```bash
cd /Users/joaopaulos4/Cursor/PadelJam
node -e "JSON.parse(require('fs').readFileSync('apps/mobile/app.json','utf8')); console.log('app.json OK')"
git add apps/mobile/package.json apps/mobile/app.json pnpm-lock.yaml apps/mobile/assets/app-icons
git commit -m "build(mobile): expo-dynamic-app-icon + placeholder icon assets + plugin config"
```
Expected: `app.json OK`. (Do NOT run a native build — typecheck/build verification is later/deferred.)

---

## Task 2: App-icon i18n keys

**Files:** Modify `apps/mobile/lib/i18n-mobile.ts`.

- [ ] **Step 1: Merge keys** into the existing `mobileProfile.en` object (keep existing):
```ts
    appIcon: 'App icon',
    iconDefault: 'Default',
    iconBlue: 'Blue',
    iconDark: 'Dark',
    iconLight: 'Light',
    iconMono: 'Mono',
    iconClassic: 'Classic',
    appIconUnsupported: 'Changing the app icon needs a full app build (not available in Expo Go).',
```

- [ ] **Step 2: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): app-icon i18n keys"
```

---

## Task 3: App-icon picker screen + settings row

**Files:** Create `apps/mobile/app/profile/app-icon.tsx`; Modify `apps/mobile/app/profile/settings.tsx`.

- [ ] **Step 1: Create the picker** `apps/mobile/app/profile/app-icon.tsx`. Use the API names confirmed in Task 1 Step 2 — the code below assumes `setAppIcon(name: string | null)` and `getAppIcon(): string` (the common API); **adjust the two import/call sites if the installed version differs**:
```tsx
import { getAppIcon, setAppIcon } from 'expo-dynamic-app-icon';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type IconOption = { name: string; labelKey: 'iconDefault' | 'iconBlue' | 'iconDark' | 'iconLight' | 'iconMono' | 'iconClassic'; preview: number };

const OPTIONS: IconOption[] = [
  { name: 'DEFAULT', labelKey: 'iconDefault', preview: require('@/assets/app-icons/default.png') },
  { name: 'blue', labelKey: 'iconBlue', preview: require('@/assets/app-icons/blue.png') },
  { name: 'dark', labelKey: 'iconDark', preview: require('@/assets/app-icons/dark.png') },
  { name: 'light', labelKey: 'iconLight', preview: require('@/assets/app-icons/light.png') },
  { name: 'mono', labelKey: 'iconMono', preview: require('@/assets/app-icons/mono.png') },
  { name: 'classic', labelKey: 'iconClassic', preview: require('@/assets/app-icons/classic.png') },
];

export default function AppIconScreen() {
  const { t } = useT('profile');
  const [current, setCurrent] = useState<string>(() => {
    try {
      return getAppIcon();
    } catch {
      return 'DEFAULT';
    }
  });
  const [notice, setNotice] = useState<string | null>(null);

  const select = (name: string) => {
    try {
      setAppIcon(name === 'DEFAULT' ? null : name);
      setCurrent(name);
      setNotice(null);
    } catch {
      setNotice(t('appIconUnsupported'));
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('appIcon') }} />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <View style={styles.grid}>
        {OPTIONS.map((o) => {
          const active = o.name === current || (o.name === 'DEFAULT' && (current === 'DEFAULT' || !current));
          return (
            <Pressable key={o.name} style={[styles.tile, active && styles.tileActive]} onPress={() => select(o.name)} accessibilityRole="button">
              <Image source={o.preview} style={styles.preview} />
              <Text style={[styles.label, active && styles.labelActive]}>{t(o.labelKey)}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { padding: 16, gap: 12 },
  notice: { color: '#6B7685', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between' },
  tile: { width: '30%', alignItems: 'center', gap: 6, paddingVertical: 8, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  tileActive: { borderColor: '#0B7BFF', backgroundColor: '#EAF3FF' },
  preview: { width: 64, height: 64, borderRadius: 14 },
  label: { fontSize: 13, color: '#0B1F3A' },
  labelActive: { color: '#0B7BFF', fontWeight: '700' },
});
```

- [ ] **Step 2: Add the App-icon row** to `apps/mobile/app/profile/settings.tsx` in the Preferences section, right after the Language block (after the `{langOpen && …}` map, before the Account section):
```tsx
      <Pressable style={styles.row} onPress={() => router.push('/profile/app-icon')} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('appIcon')}</Text>
      </Pressable>
```

- [ ] **Step 3: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add "apps/mobile/app/profile/app-icon.tsx" apps/mobile/app/profile/settings.tsx
git commit -m "feat(mobile): app-icon picker screen + settings row"
```
Expected: clean. If typecheck fails on the `expo-dynamic-app-icon` import/signatures, adjust the two call sites (`getAppIcon`/`setAppIcon`) to the installed version's exports (from Task 1 Step 2) and re-run. (`/profile/app-icon` matches the existing `/profile/${string}` typed-route pattern.)

---

## Task 4: Verification + finish

**Files:** none.

- [ ] **Step 1: Workspace typecheck (the only automated gate):**
```bash
pnpm -w typecheck
```
Expected: 0 type errors.

- [ ] **Step 2: Document the unverified state.** This slice's actual behavior is **not** verifiable here. Record in the finish summary: "App-icon switch requires `expo prebuild` + a native rebuild to verify; placeholder icons are identical copies of `icon.png` and must be replaced with 6 real designs before release."

- [ ] **Step 3: Manual verification (deferred — for whoever does the next native build):**
`cd apps/mobile && npx expo prebuild` then `npx expo run:ios` (or `run:android`) → Settings → Preferences → App icon → tap a tile → the home-screen icon changes; relaunch keeps it. (Cannot run in this environment.)

- [ ] **Step 4: Finish the branch.**
Announce: "I'm using the finishing-a-development-branch skill to complete this work." Follow superpowers:finishing-a-development-branch; integration targets `feat/phase1b2d-support` (the stacked base) — or `main` once support lands.

---

## Self-Review notes (addressed)
- **Spec coverage:** lib + placeholder assets + config plugin → Task 1; i18n → Task 2; picker + settings row → Task 3; (typecheck) verification + deferred-rebuild note → Task 4.
- **No silent placeholders:** the placeholder icons are explicitly copies-of-`icon.png` and called out as needing real art; the lib-API/config-shape unknown is an explicit Task 1 reconciliation step, and Tasks 3/Step-4-config say to match the installed version.
- **Verification honesty:** typecheck is the only gate run here; the icon-switch is a deferred native-rebuild step (Task 4 Step 3), per the agreed scaffold basis.
- **No DB/API:** the OS persists the icon; `getAppIcon`/`setAppIcon` are client-only.
- **Stacking:** branch is on `feat/phase1b2d-support` (settings.tsx already has Support) to avoid a settings-file conflict.
```
