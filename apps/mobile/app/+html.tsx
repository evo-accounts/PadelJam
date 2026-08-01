import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';
import { dark, light } from '@padel/ui';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/*
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native.
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>{children}</body>
    </html>
  );
}

/**
 * The one place in the app that legitimately needs BOTH schemes.
 *
 * `apps/mobile/theme` exports light only, on purpose — nothing in the RN app
 * renders dark yet. But this is a `prefers-color-scheme` media query in the
 * Expo *web* shell, and it has to name both, so it reaches past the theme to
 * the shared tokens directly.
 *
 * White/black become the real page backgrounds, so the anti-flicker colour now
 * matches what actually paints a moment later instead of approximating it.
 */
const responsiveBackground = `
body {
  background-color: ${light.background};
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: ${dark.background};
  }
}`;
