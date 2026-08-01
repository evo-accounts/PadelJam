import { view } from './storybook.requires';

/**
 * The on-device Storybook root. Mounted on an ordinary expo-router route
 * (`app/(dev)/storybook.tsx`) — no entry-point swap, so the normal app and
 * Storybook coexist.
 *
 * `shouldPersistSelection` DEFAULTS TO TRUE, which would make the screenshot
 * gate non-deterministic: Storybook reopens whichever story was last viewed, so
 * `00-design-system.e2e.ts` would capture a different frame depending on what a
 * human last tapped on that simulator. Pinning it off, plus an explicit
 * `initialSelection`, means the route always opens on the same gallery.
 *
 * The trade-off is that a developer browsing stories loses their place across
 * reloads. That is the right way round — the CI artifact has to be
 * reproducible, and re-selecting a story by hand costs one tap.
 */
const StorybookUIRoot = view.getStorybookUI({
  initialSelection: { kind: 'Design System/Overview', name: 'Overview' },
  shouldPersistSelection: false,
});

export default StorybookUIRoot;
