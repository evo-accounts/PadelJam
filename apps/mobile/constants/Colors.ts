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
 * Two files read this map — `app/(tabs)/_layout.tsx` and `components/Themed.tsx`
 * — so that stray blue was tinting the real tab bar. It is `primary` now, which
 * is the design system finally reaching the last of the screen furniture.
 *
 * The shape is unchanged, so both consumers keep working. Dark is wired up
 * because Themed.tsx switches on the colour scheme, though it still renders
 * nothing today: nothing puts the app into dark mode.
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
