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
    // Metro's config, the web stubs and the Expo config plugins are real
    // CommonJS, not ESM that happens to end in .js — they are loaded by the
    // bundler or by `expo prebuild`, on Node, not by the app.
    files: ['metro.config.js', 'stubs/**/*.js', 'plugins/**/*.js'],
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

      // React Compiler-era rules, split by whether the remaining hits are
      // genuinely deliberate. They were ALL 'warn' on the claim that every hit
      // was "pre-existing and deliberate". An audit of all 15 showed that claim
      // was wrong: 8 were fixable and one was a real bug.
      //
      // ERROR — audited to zero, entirely by fixing, with no suppressions:
      //
      //   purity (3)  `useState(Date.now())` re-evaluated the initialiser on
      //               EVERY render and discarded the result. Now `() =>`.
      //   refs (4)    usePushTapRouting wrote `sessionRef.current = session`
      //               DURING RENDER — a discarded render would mutate state on
      //               behalf of a render that never commits, so a push tap could
      //               route on a session that never existed. Moved to an effect.
      //               The other three were stale idioms
      //               (`useRef(new Animated.Value(0)).current`, a ref lazily
      //               seeding itself in render) that lazy `useState` replaces.
      //
      // Worth recording, because it is not obvious: satisfying one of these can
      // feed another. Adding `progress` to a dep array to silence
      // exhaustive-deps ADDED two refs warnings, because a deps array is render
      // phase too. Net zero. The fix was to stop using a ref at all.
      'react-hooks/purity': 'error',
      'react-hooks/refs': 'error',

      // WARN — the remaining hits ARE deliberate, and this was checked one by
      // one rather than assumed:
      //
      //   3x  form hydration (permissions, settings, profile/edit): seeding
      //       editable state from fetched data behind a `hydrated` flag. The
      //       alternatives — a `key` remount, or render-phase derivation — both
      //       risk discarding what the user is currently typing. The flag exists
      //       precisely so a refetch cannot clobber an in-progress edit.
      //   1x  useClientOnlyValue.web: setting state in an effect IS the hook. It
      //       detects the client by running where effects run.
      //   2x  a debounced search and an initial channel load — data loading.
      //
      // Left at 'warn' deliberately. Promoting would need six eslint-disable
      // lines in high-traffic screens, and a rule that is mostly suppressed
      // teaches people to reach for the suppression — the same reason
      // a11y/glyph-button-needs-label was kept narrow.
      'react-hooks/set-state-in-effect': 'warn',

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
