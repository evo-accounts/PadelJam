/**
 * Expo's stock `Colors` map, re-pointed at the design tokens.
 *
 * This file survived the whole migration by being invisible: the hex budget
 * scanned `app/`, `components/` and `lib/`, and this lives in `constants/`. The
 * ESLint rule that replaced the budget lints everything, and found it
 * immediately — which is the argument for the rule over the script.
 *
 * It was pure Expo scaffolding, and its tint was `#2f95dc`: a blue that appears
 * NOWHERE else in the app and has no counterpart in the shared palette at all.
 * It is `primary` now, which is the design system reaching the last of the
 * screen furniture.
 *
 * ONE consumer left — `app/(tabs)/_layout.tsx`. `components/Themed.tsx` was the
 * other and has been deleted: it was a second theming mechanism (a
 * `useThemeColor` hook plus light/dark props on Text and View) serving a single
 * screen, which the primitives already cover.
 *
 * This file is NOT redundant in the same way, which is why it survives. It is
 * the only place that picks a colour BY SCHEME, so a dark-mode device gets
 * `dark.primary` on the tab bar today. `colors` is the light map alone. When
 * mobile dark mode lands (see theme/DARK-MODE-SPIKE.md), this collapses into
 * `useColors()` and can go.
 */
import { dark, light } from '@padel/ui';

import { palette } from '../theme';

export default {
  light: {
    text: light.foreground,
    background: light.background,
    tint: light.primary,
    tabIconDefault: palette.slate[400],
    tabIconSelected: light.primary,
  },
  dark: {
    text: dark.foreground,
    background: dark.background,
    tint: dark.primary,
    tabIconDefault: palette.slate[500],
    tabIconSelected: dark.primary,
  },
};
