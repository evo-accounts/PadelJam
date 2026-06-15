# Phase 1B-2d-2 — App-Icon Picker (scaffold) — Design

*Padel Jam • 2026-06-15 • Brainstormed design / spec*

## Goal

Add an app-icon picker (PR-13): a 2×3 grid of icon variants; selecting one switches the device
app icon. Built as a **scaffold** — real mechanism + native config, but **placeholder** icon
assets and **typecheck-only** verification (the actual icon switch requires a native rebuild).

Branch `feat/phase1b2d2-app-icon` (stacked on `feat/phase1b2d-support`, which has the settings
Support section). **No migration, no API** — the OS persists the selected icon.

## Scope decisions (made with the user)

1. **Scaffold, proceed despite limits** — placeholder icons + verify-on-rebuild (typecheck is the only gate here).
2. **`expo-dynamic-app-icon`** (community lib: config plugin + `setAppIcon`/`getAppIcon`, iOS+Android).
3. **Placeholder assets are copies of `icon.png`** (visually identical) — must be replaced with 6 real designs before release.

## Known limits (explicit)
- The picker compiles and wires correctly, but the **icon switch is unverified** until `expo prebuild` + a native dev-client rebuild on a device/simulator.
- All 6 tiles look identical (placeholder copies) until real art is dropped in.
- Won't work in Expo Go (native module) — the screen guards with a notice.

## Architecture / components

```
Settings › Preferences › App icon → /profile/app-icon
  grid of 6 tiles (preview + label); current = getAppIcon(); tap → setAppIcon(name) (try/catch)
config plugin (expo-dynamic-app-icon) declares the 6 icons → applied at prebuild/rebuild
```

- **Library:** `npx expo install expo-dynamic-app-icon`. *(Implementation note: confirm the exact exported API — `setAppIcon`/`getAppIcon` names and the config-plugin shape — against the installed version's README/types before writing the picker.)*
- **Assets:** `apps/mobile/assets/app-icons/{default,blue,dark,light,mono,classic}.png` — copies of `apps/mobile/assets/images/icon.png` (identical placeholders). 6 variants per PR-13 (one is the default).
- **Config plugin** in `app.json` `plugins`: `["expo-dynamic-app-icon", { icons: { blue: { ios: "./assets/app-icons/blue.png", android: "./assets/app-icons/blue.png" }, dark: {…}, light: {…}, mono: {…}, classic: {…} } }]` (shape per the lib's docs; default uses the main `icon`).
- **`apps/mobile/app/profile/app-icon.tsx`** — a 2×3 `View` grid of 6 `Pressable` tiles (each: an `Image`/preview + a label; the active one highlighted via `getAppIcon()`); tap → `setAppIcon(name)` wrapped in try/catch → on failure show `appIconUnsupported` (e.g. Expo Go). Local state mirrors the selection optimistically.
- **Settings hub** (`apps/mobile/app/profile/settings.tsx`) — an **App icon** row in the Preferences section (after Language) → `router.push('/profile/app-icon')`.
- i18n (`profile` ns): `appIcon`, `iconDefault`, `iconBlue`, `iconDark`, `iconLight`, `iconMono`, `iconClassic`, `appIconUnsupported`.

## Testing
- **Automated:** `pnpm --filter mobile typecheck` only (the picker compiles against the lib's types; the JS layer is the verifiable part). No SQL/unit test (no DB/API).
- **Manual (deferred to a native rebuild — NOT runnable here):** `expo prebuild` + `expo run:ios`/`run:android`, then Settings → App icon → tap a tile → the home-screen icon changes; relaunch keeps it.

## Explicitly deferred / follow-ups
- **Real icon designs** (6 distinct variants) — replace the placeholders before release.
- Native-rebuild verification of the actual switch.
- Change phone (1B-2c-2b), subscriptions (1C).

## Conventions followed
No migration/API; native dep via `expo install` + config plugin in `app.json` (like `expo-location` in 0B);
screen under `apps/mobile/app/profile/`; copy via `useT('profile')`; settings row mirrors existing rows.

## Open items for the implementation plan
- **Confirm the installed `expo-dynamic-app-icon` API** (export names, `setAppIcon`/`getAppIcon` signatures, config-plugin key shape) — write the picker + `app.json` plugin entry to match the actual version. This is the one real unknown; resolve it right after install.
- Confirm placeholder asset generation: `cp apps/mobile/assets/images/icon.png` into the 6 `assets/app-icons/*.png` names (identical bytes).
- If `expo install expo-dynamic-app-icon` is blocked by the sandbox, the controller installs it (as with `expo-location`).
