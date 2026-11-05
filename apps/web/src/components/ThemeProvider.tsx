'use client';

import { ThemeProvider as NextThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

/**
 * Web is LIGHT-ONLY for now: `forcedTheme="light"` pins <html> to light whatever the OS
 * prefers and whatever an earlier visit saved in `localStorage.theme`.
 *
 * Why: the dark tokens are broken. `--button-primary-bg` has no `.dark` override, so in dark
 * mode the primary fill equals the page background (`#2f103d`) and Join, Follow and Apply lose
 * their fill. Until the Designer fixes the dark tokens, no one should be able to land there,
 * which is why the toggle is gone too and `enableSystem` is off. The `.dark` tokens and `dark:`
 * classes stay in place for that fix; when it lands, restore `defaultTheme`/`enableSystem` and
 * the toggle (git has `ThemeToggle`).
 *
 * MOUNTED ABOVE `Providers`, deliberately. `Providers` returns `null` until i18n has loaded,
 * so a theme provider nested inside it would not exist during that first paint.
 *
 * `next-themes` is kept because it injects a blocking inline script that sets the class BEFORE
 * first paint, so a saved "dark" never flashes.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      forcedTheme="light"
    >
      {children}
    </NextThemeProvider>
  );
}
