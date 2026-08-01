'use client';

import { ThemeProvider as NextThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

/**
 * Puts the `dark` class on <html>, which is what `@custom-variant dark
 * (&:is(.dark *))` in globals.css keys off — and therefore what swaps every
 * token in `tokens.generated.css`.
 *
 * MOUNTED ABOVE `Providers`, deliberately. `Providers` returns `null` until
 * i18n has loaded, so a theme provider nested inside it would not exist during
 * that first paint — the page would flash the light palette before the theme
 * applied. Theme is presentation and must not wait on data.
 *
 * `next-themes` rather than a hand-rolled provider for one reason worth naming:
 * it injects a blocking inline script that sets the class BEFORE first paint.
 * Doing this in an effect — the obvious hand-rolled approach — renders light
 * first and then corrects, which is the flash every dark mode implementation
 * gets wrong once.
 *
 * `defaultTheme="system"` means we follow the OS until someone chooses
 * explicitly; `disableTransitionOnChange` stops every colour on the page from
 * animating at once when they do, which reads as a glitch rather than a
 * transition.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}
