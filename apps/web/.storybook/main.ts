import type { StorybookConfig } from '@storybook/nextjs';

/**
 * Storybook for apps/web.
 *
 * Uses the NEXT framework rather than `@storybook/react-vite`, even though none
 * of the 21 primitives touches a Next-specific API. The reason is CSS: the
 * app's styles are Tailwind v4 processed through `@tailwindcss/postcss`, and
 * they pull in `tokens.generated.css`, which is generated from
 * `packages/ui/src/tokens/*.ts`. Running Storybook on the app's own pipeline
 * means those tokens are resolved exactly once, the same way in both places.
 *
 * A second, hand-written Vite/PostCSS config would be one more thing that can
 * disagree with production — which is the failure this whole design system
 * exists to remove.
 *
 * `@storybook/nextjs@10.5.5` lists `next: ^14.1.0 || ^15.0.0 || ^16.0.0`, and
 * this app is on 16.2.9. Checked rather than assumed, because Next 16 is new.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx|mdx)'],
  addons: [],
  framework: {
    name: '@storybook/nextjs',
    options: {},
  },
  // The whole point is documenting components, so their props should be
  // readable. react-docgen-typescript reads the actual TS types rather than
  // guessing from runtime defaults.
  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
  // No `staticDirs`: this app has no public/ directory, and pointing at a
  // missing one is a hard build error rather than a warning.
};

export default config;
