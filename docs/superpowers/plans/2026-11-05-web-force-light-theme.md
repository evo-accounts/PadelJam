# Web: force light theme, remove dark-mode toggle (T-DM, W4)

Approved by CTO (PAD-139). Web-only; no migration.

**Why.** In web dark mode `--button-primary-bg` (`#2f103d`) has no dark override, so it equals the
dark background and Join/Follow/Apply lose their fill. `defaultTheme="system"` sends anyone with a
dark OS or saved "dark" there. Token fix is out of scope (Designer).

**Changes**
1. `ThemeProvider.tsx`: `forcedTheme="light"`, keep `attribute="class"`, drop `defaultTheme`, `enableSystem`, `disableTransitionOnChange`; honest doc comment.
2. App preferences page: remove the Appearance section and `ThemeToggle` import.
3. Delete `ThemeToggle.tsx` and its story.
4. Remove the 8 theme/appearance i18n keys from pt-PT, pt-BR, en.

**Leave:** `.dark` tokens, `dark:` classes, `packages/ui`, `Tokens.stories.tsx`, `next-themes`.

**Test.** `e2e-web/tests/force-light-theme.spec.ts`, `colorScheme: 'dark'`, with and without
`localStorage.theme='dark'`: no `dark` class on `<html>`; primary button background differs from page background.
Fails first with the old provider.
