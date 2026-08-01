import { join } from 'node:path';

import { beforeAll, describe, it } from 'vitest';

import { scrollUntilVisible } from '../driver/actions';
import { freshInstall } from '../driver/app';
import { CONFIG } from '../driver/config';
import { expectVisible } from '../driver/expect';
import { deepLink } from '../driver/flows';
import { overrideStatusBar, screenshot } from '../driver/sim';

/**
 * 00 design system — the acceptance gate for the token migration.
 *
 * Opens the on-device Storybook gallery and photographs it top to bottom, so a
 * human can approve the redesign from a REAL device render before any of the
 * 136 screens adopt it. The artifacts are the deliverable here; the assertions
 * exist so that a broken render fails loudly instead of quietly producing a
 * folder of blank images.
 *
 * That distinction is the whole design of this file. A capture-only suite is
 * worthless — it passes just as happily on a white screen, and nobody looks at
 * every frame every run. So each scroll position asserts on text that must be
 * there, and the run fails if it is not.
 *
 * Numbered 00 deliberately: it runs first, on the freshest simulator, which is
 * when `simctl openurl` is most reliable (it degrades on long-running devices —
 * see the note on `deepLink`). It needs no database and no login, so it is also
 * the fastest thing in the suite to fail if the app will not boot at all.
 */
describe('00 design system', () => {
  beforeAll(async () => {
    await freshInstall();
    // Pins the clock to 9:41 and the battery to charged, so two runs of an
    // unchanged gallery produce identical pixels apart from the gallery itself.
    await overrideStatusBar();
    await deepLink('mobile:///storybook', /design system/i);
  }, 180_000);

  it('renders the gallery and captures it end to end', async () => {
    const dir = join(CONFIG.artifactsDir, 'design-system');

    // The route opens on Design System/Overview because .rnstorybook/index.tsx
    // pins initialSelection and disables selection persistence. If that ever
    // regresses, this first assertion is what catches it.
    await expectVisible({ text: /design system/i }, { timeout: 30_000 });
    await screenshot(join(dir, '00-colour.png'));

    // EACH HEADING MUST BE UNIQUE IN THE ACCESSIBILITY TREE. `scrollUntilVisible`
    // takes the first match anywhere in the tree, not the nearest one below, so
    // a heading that also appears as a label earlier in the page sends it
    // chasing an element it has already scrolled past — the failure reads
    // "found at y=-2347, off screen", which does not obviously mean "duplicate
    // text". Two of these bit during development: `card` (a colour swatch label)
    // and `Loading` (a button label). Both were renamed in Gallery.stories.tsx.
    //
    // Scroll to each section by NAME rather than by a fixed number of swipes.
    // Section heights change every time a variant is added, so counting swipes
    // would silently drift until a capture landed between two sections. Reading
    // the accessibility tree and stopping when the heading is actually on screen
    // is self-correcting, and it doubles as the assertion: a section that failed
    // to render is never found, and the test fails instead of the eye.
    const sections: { file: string; heading: RegExp }[] = [
      { file: '01-type.png', heading: /^type$/i },
      { file: '02-radius.png', heading: /^radius$/i },
      { file: '03-spacing.png', heading: /^spacing$/i },
      { file: '04-button.png', heading: /^button$/i },
      { file: '05-avatar.png', heading: /^avatar$/i },
      { file: '06-badge-chip.png', heading: /^chip$/i },
      { file: '07-card.png', heading: /^card$/i },
      { file: '08-field.png', heading: /^field$/i },
      { file: '09-empty-loading.png', heading: /^loading$/i },
    ];

    for (const section of sections) {
      await scrollUntilVisible({ text: section.heading }, { maxSwipes: 6 });
      await screenshot(join(dir, section.file));
    }

    console.log(`[e2e] design-system screenshots: ${dir}`);
  }, 240_000);
});
