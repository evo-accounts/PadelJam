import type { Preview } from '@storybook/nextjs';

// The app's real stylesheet: Tailwind, then tokens.generated.css, then the
// `@theme inline` remap. Importing it (rather than restating any of it) is what
// guarantees a swatch here is the same colour the app paints.
import '../src/app/globals.css';

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // `background` is a token, so let the canvas use it instead of Storybook's
    // default white — otherwise every story is judged against a surface the app
    // never renders.
    backgrounds: {
      options: {
        app: { name: 'app background', value: 'var(--background)' },
        card: { name: 'card', value: 'var(--card)' },
      },
    },
  },
  initialGlobals: {
    backgrounds: { value: 'app' },
  },
};

export default preview;
