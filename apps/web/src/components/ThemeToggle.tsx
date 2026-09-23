'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useT } from '@padel/i18n';

import { Button } from '@/components/ui/button';

/**
 * Cycles system → light → dark.
 *
 * Three states, not two. A plain light/dark switch quietly discards "follow the
 * OS", which is the default and what most people actually want — once they
 * toggle they can never get back to it.
 *
 * MOUNT GUARD: `theme` is unknowable on the server, because the real value comes
 * from localStorage or the OS. Rendering it before mount produces markup that
 * cannot match the client, so this returns a same-sized placeholder until
 * mounted. Without it you get a hydration error, or a button that says "light"
 * for a frame on a dark page.
 */
const ORDER = ['system', 'light', 'dark'] as const;
type Mode = (typeof ORDER)[number];

/**
 * The labels were hardcoded English — "Theme: system" read untranslated on a Portuguese page,
 * which is the same defect UX-PROF-04 names for the report reasons. They come from the `settings`
 * namespace now.
 */
const LABEL_KEYS: Record<Mode, string> = {
  system: 'themeSystem',
  light: 'themeLight',
  dark: 'themeDark',
};

const MODE_KEYS: Record<Mode, string> = {
  system: 'themeModeSystem',
  light: 'themeModeLight',
  dark: 'themeModeDark',
};

const GLYPH: Record<Mode, string> = { system: '◐', light: '☀', dark: '☾' };

export function ThemeToggle() {
  const { t } = useT('settings');
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current: Mode = ORDER.includes(theme as Mode) ? (theme as Mode) : 'system';
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!;

  if (!mounted) {
    // Same footprint as the real control, so nothing shifts when it appears.
    return <Button variant="ghost" size="sm" aria-hidden className="invisible">◐ Theme</Button>;
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(next)}
      // The visible label already says the CURRENT mode, so the accessible name
      // has to say what pressing it DOES — otherwise a screen-reader user hears
      // the state and never learns the action.
      aria-label={t('themeSwitchTo', { current: t(LABEL_KEYS[current]), next: t(MODE_KEYS[next]) })}
    >
      <span aria-hidden>{GLYPH[current]}</span>
      {t(LABEL_KEYS[current])}
    </Button>
  );
}
