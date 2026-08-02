import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

import glyphButtonNeedsLabel from './eslint-rules/glyph-button-needs-label.mjs';

import rootConfig from '../../eslint.config.mjs';

/**
 * ESLint for the Expo app.
 *
 * Extends the root config rather than restating it (unlike apps/web, which
 * cannot — eslint-config-next brings its own base). Everything below is a
 * documented departure that React Native genuinely requires; the goal is that
 * the app lints clean without any rule being switched off wholesale.
 */
export default [
  ...rootConfig,

  {
    // Metro's config and the web stubs are real CommonJS, not ESM that happens
    // to end in .js — they are loaded by the bundler, not the app.
    files: ['metro.config.js', 'stubs/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // React Compiler-era advisory rules, downgraded to warnings for the same
      // reason apps/web downgrades its two: every current hit is pre-existing
      // and deliberate, so erroring would only mean disabling them. Spot-checked
      // before choosing this — useClientOnlyValue's setState-in-effect IS the
      // hook (it detects the client by running where effects run),
      // `useState(Date.now())` seeds a ticking clock, and `sessionRef.current =
      // session` is the latest-ref pattern behind a stable callback.
      //
      // Warnings, not `off`: they stay visible and fixable incrementally, and
      // `eslint .` still exits 0, so CI is green without hiding anything.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',

      // `require()` stays an error in app code, with two narrow exemptions
      // rather than the rule turned off:
      //
      //   - Static assets. Metro resolves `require('...png')` to the numeric
      //     asset reference that RN's Image expects; an ESM import does not
      //     give you that, so this is the idiom, not a shortcut.
      //   - @sentry/react-native. lib/sentry.ts requires it lazily on purpose,
      //     so the native module never loads without a DSN and the app stays
      //     bootable in Expo Go. An import would hoist and defeat that.
      //
      // Anything else still has to justify itself.
      '@typescript-eslint/no-require-imports': [
        'error',
        { allow: ['\\.(png|jpg|jpeg|gif|webp|svg)$', '^@sentry/react-native$'] },
      ],
    },
  },

  {
    // Storybook writes this file and stamps it "do not change". It uses
    // `require.context` to discover stories, which has no ESM equivalent Metro
    // understands — the bundler needs that call site to stay a literal so it can
    // expand the glob at build time.
    //
    // MUST STAY LAST. Flat config applies matching blocks in order, so this has
    // to come after the `**/*.{ts,tsx}` block above or that block turns the rule
    // back on for this file. (The metro.config.js exemption near the top is safe
    // where it is only because it targets .js, which that block never matches.)
    //
    // Scoped to the single generated file, not the whole .rnstorybook directory,
    // so main.ts / preview.tsx / index.tsx beside it are still linted normally.
    files: ['.rnstorybook/storybook.requires.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    // No raw colours. This replaces scripts/check-hex-budget.mjs, which ratcheted
    // 1316 hardcoded colours down to 0 across five PRs and has now been deleted.
    //
    // The ratchet could not have started here: at `error` it would have failed on
    // all 1316 from day one, and at `warn` it would not have gated CI at all. A
    // decreasing integer got the count to zero; the rule is what keeps it there.
    //
    // One deliberate difference in coverage: the budget scanned TEXT, so it also
    // caught hexes inside comments — it once failed on a doc comment explaining
    // which colour a token replaced. This works on the AST, so prose about
    // colours is fine and only real values are rejected. That is the better
    // behaviour, and worth knowing if a comment ever "should" have been flagged.
    files: ['**/*.{ts,tsx}'],
    ignores: ['theme/**'], // where colours are ALLOWED to be spelled out
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,4}){1,2}$/]',
          message: 'Use a token from apps/mobile/theme instead of a raw hex colour.',
        },
        {
          // The scrims that blocked the last 21: `overlay` covers them now.
          selector: 'Literal[value=/^rgba?\\(/]',
          message: 'Use colors.overlay (or a theme token) instead of a raw rgba() colour.',
        },
      ],
    },
  },

  {
    // A glyph-only pressable must say what it does.
    //
    // Seven of these shipped during the primitive migration, each found by hand:
    // a screen reader announced "bullet bullet bullet" for the chat kebab and
    // "greater-than sign" for a navigation chevron. Unlike the hex rule this one
    // starts at `error` with zero violations, because seven was small enough to
    // fix outright — no ratchet needed.
    files: ['**/*.tsx'],
    ignores: ['components/ui/**'], // IconButton already REQUIRES the prop
    plugins: { a11y: { rules: { 'glyph-button-needs-label': glyphButtonNeedsLabel } } },
    rules: {
      'a11y/glyph-button-needs-label': 'error',
    },
  },
];
