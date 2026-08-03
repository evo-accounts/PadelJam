/**
 * Theme context + `useThemedStyles` — the SPIKE for mobile dark mode.
 *
 * The problem this exists to answer: 124 screens declare
 *
 *     const styles = StyleSheet.create({ card: { backgroundColor: colors.card } })
 *
 * at MODULE scope. That runs once, at import, long before any theme is known,
 * and it holds 1,075 colour references. No amount of primitive adoption reaches
 * them at a useful rate — measured across three PRs, conversions removed about
 * 8 references each, so the remaining work is ~130 PRs. Dark mode needs those
 * screens changed directly, and this is the cheapest change that could work.
 *
 * WHY NOT DynamicColorIOS: it throws on Android, which is a target. A context is
 * the only mechanism that behaves identically on both.
 *
 * THE SHAPE:
 *
 *     const makeStyles = (c: ThemeColors) => StyleSheet.create({ ... });  // module scope
 *     function Screen() { const styles = useThemedStyles(makeStyles); }
 *
 * Module scope is load-bearing, not style: `useMemo` keys on the factory's
 * identity, so an inline arrow is a new function every render and rebuilds the
 * stylesheet every render. At module scope the identity is stable forever and
 * the memo hits on everything except an actual theme change.
 *
 * MEASURED COST per screen — three structural edits plus one line per colour:
 *
 *     swap the theme import                     1 line
 *     add the hook call                         1 line
 *     `StyleSheet.create({` -> the factory      1 line
 *     `colors.x` -> `c.x`                       1 line each
 *
 *   app/(tabs)/community/created.tsx   1 colour   +4  -3
 *   app/event/[id]/live.tsx           41 colours  +45 -43
 *
 * The colour lines have to change under any design, so the fixed overhead is
 * three lines a file. That is what makes 124 files tractable.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme as useSystemColorScheme } from '@/components/useColorScheme';

import { dark, light } from '@padel/ui';

export type Scheme = 'light' | 'dark';

/**
 * Widened deliberately. The token maps are `as const`, so `typeof light` is a
 * map of literal types — `'#f8fafc'`, not `string` — and `dark` is therefore not
 * assignable to it. Keying on the NAMES and widening the values is what makes
 * the two schemes interchangeable.
 *
 * What this type does NOT do, checked rather than assumed: it does not catch a
 * scheme gaining an extra token. `dark` arrives as a variable, not an object
 * literal, so excess-property checking never runs and the build stays green.
 * Losing a token IS caught, but by `SemanticScheme` back in packages/ui, which
 * would have caught it with or without this file. Nothing here is load-bearing
 * for scheme parity; that guarantee lives in the token package where it belongs.
 */
export type ThemeColors = Record<keyof typeof light, string>;

const SCHEMES: Record<Scheme, ThemeColors> = { light, dark };

const ThemeContext = createContext<Scheme>('light');

/**
 * NOT called ThemeProvider: `app/_layout.tsx` already imports one of those from
 * expo-router (it swaps DarkTheme/DefaultTheme for the navigation chrome, which
 * is why the header and tab bar ALREADY follow the system scheme while screen
 * content does not). Two components with one name, mounted in the same file, is
 * a bug waiting to happen.
 *
 * `system` follows the OS. An explicit value pins it, which is what the E2E
 * suite and the Storybook gallery need in order to render both schemes
 * deterministically without touching simulator settings.
 */
export function ColorSchemeProvider({
  scheme = 'system',
  children,
}: {
  scheme?: Scheme | 'system';
  children: ReactNode;
}) {
  // `components/useColorScheme` already maps RN's 'unspecified' to 'light'.
  // Re-deriving that here would be a second place for the same edge case.
  const system = useSystemColorScheme();
  const resolved: Scheme = scheme === 'system' ? system : scheme;
  return <ThemeContext.Provider value={resolved}>{children}</ThemeContext.Provider>;
}

/** The active scheme name, for the rare branch that is not a style value. */
export function useScheme(): Scheme {
  return useContext(ThemeContext);
}

/** The active colours, for inline styles and props like `tintColor`. */
export function useColors(): ThemeColors {
  return SCHEMES[useContext(ThemeContext)];
}

/**
 * Build a stylesheet from the active scheme.
 *
 * The factory calls `StyleSheet.create` ITSELF:
 *
 *     const makeStyles = (c: ThemeColors) => StyleSheet.create({ ... });
 *
 * That looks redundant next to a hook that could call `create` for you. It is
 * not, and the spike proved it the expensive way: with the hook calling
 * `create`, converting one 53-key screen produced **81 type errors**.
 *
 * The reason is contextual typing. `StyleSheet.create`'s signature
 * (`<T extends NamedStyles<T>>(styles: T & NamedStyles<any>) => T`) types the
 * object literal passed DIRECTLY to it, so `alignItems: 'center'` stays the
 * literal `'center'`. Route that literal through a factory's return value
 * instead and TypeScript infers it first — widening it to `string` — and only
 * then checks the constraint, which fails. That file alone had 38 such
 * properties.
 *
 * So the object literal must sit inside `create()` at the call site. This hook's
 * only jobs are supplying the scheme and memoising.
 *
 * THE ONE RULE: define the factory at MODULE scope. `useMemo` keys on its
 * identity, so an inline arrow is a new function every render and rebuilds the
 * stylesheet every render.
 */
export function useThemedStyles<T>(factory: (c: ThemeColors) => T): T {
  const scheme = useContext(ThemeContext);
  return useMemo(() => factory(SCHEMES[scheme]), [factory, scheme]);
}
