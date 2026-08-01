/**
 * The raw colour ramps — the single source of truth for both platforms.
 *
 * Transcribed verbatim from `apps/web/src/app/globals.css`, which was the
 * canonical palette (a Shadcn Studio / Tailwind export). That file now IMPORTS
 * the CSS generated from this module, so these values are no longer duplicated:
 * edit here, run `pnpm tokens:build`, and both web and mobile follow.
 *
 * Standard Tailwind ramps for slate/red/yellow/teal/sky/blue/rose; custom tinted
 * ramps for orange/green/purple. Kept explicit rather than derived so direct
 * utilities (`bg-green-500`) match the export exactly.
 *
 * `as const` throughout, deliberately: tsconfig.base.json sets
 * `noUncheckedIndexedAccess`, so a `Record<string, string>` would make every
 * lookup `string | undefined` at the call site.
 */
export const palette = {
  white: '#ffffff',
  black: '#000000',

  slate: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },

  red: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
    950: '#450a0a',
  },

  /** Custom tinted ramp (not stock Tailwind). */
  orange: {
    50: '#fff8f5',
    100: '#fedbcd',
    200: '#fec0a8',
    300: '#fda482',
    400: '#fd895b',
    500: '#fc6d35',
    600: '#ca572a',
    700: '#974120',
    800: '#652c15',
    900: '#32160b',
    950: '#431407',
  },

  yellow: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
    950: '#451a03',
  },

  /** Custom tinted ramp (not stock Tailwind). */
  green: {
    50: '#f8fcfa',
    100: '#dcf2e8',
    200: '#c3e9d7',
    300: '#a8dfc5',
    400: '#8ed5b3',
    500: '#73cba1',
    600: '#5ca281',
    700: '#457a61',
    800: '#2e5140',
    900: '#0e3d27',
    950: '#022c22',
  },

  teal: {
    50: '#f0fdfa',
    100: '#ccfbf1',
    200: '#99f6e4',
    300: '#5eead4',
    400: '#2dd4bf',
    500: '#14b8a6',
    600: '#0d9488',
    700: '#0f766e',
    800: '#115e59',
    900: '#134e4a',
    950: '#042f2e',
  },

  sky: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
    950: '#082f49',
  },

  blue: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
    950: '#172554',
  },

  /** Custom tinted ramp (not stock Tailwind). Holds the brand primary at 500. */
  purple: {
    50: '#fbf8ff',
    100: '#eddeff',
    200: '#dfc6ff',
    300: '#d0abff',
    400: '#c394ff',
    500: '#b57bff',
    600: '#9162cc',
    700: '#6d4a99',
    800: '#3d1d4e',
    900: '#2f103d',
    950: '#3b0764',
  },

  rose: {
    50: '#fff1f2',
    100: '#ffe4e6',
    200: '#fecdd3',
    300: '#fda4af',
    400: '#fb7185',
    500: '#f43f5e',
    600: '#e11d48',
    700: '#be123c',
    800: '#9f1239',
    900: '#881337',
    950: '#4c0519',
  },
} as const;

export type Palette = typeof palette;
/** Ramp names, excluding the two standalone values. */
export type RampName = Exclude<keyof Palette, 'white' | 'black'>;
