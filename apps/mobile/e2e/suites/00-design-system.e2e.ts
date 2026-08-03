import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { query, queryAll, snapshot } from '../driver/a11y';
import { scrollUntilVisible } from '../driver/actions';
import { freshInstall } from '../driver/app';
import { CONFIG } from '../driver/config';
import { expectVisible } from '../driver/expect';
import { deepLink } from '../driver/flows';
import { pollUntil } from '../fixtures/poll';
import { overrideStatusBar, screenshot, setAppearance } from '../driver/sim';

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
    await setAppearance('light');
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
      { file: '07-topbar.png', heading: /^topbar$/i },
      { file: '08-iconbutton.png', heading: /^iconbutton$/i },
      { file: '09-listrow.png', heading: /^listrow$/i },
      { file: '10-card.png', heading: /^card$/i },
      { file: '11-field.png', heading: /^field$/i },
      { file: '12-empty-loading.png', heading: /^loading$/i },
    ];

    for (const section of sections) {
      await scrollUntilVisible({ text: section.heading }, { maxSwipes: 6 });
      await screenshot(join(dir, section.file));
    }

    console.log(`[e2e] design-system screenshots: ${dir}`);
  }, 240_000);

  /**
   * The screenshots above prove the primitives RENDER. They cannot prove the
   * primitives are USABLE, and the difference is not academic:
   *
   * `ListRow` set an accessibilityLabel unconditionally, which makes the row a
   * single accessibility element and drops its children from the tree. Its
   * trailing slot — an unread count, a language, a pending count — stopped being
   * announced at all. That shipped to four screens and was caught by an
   * unrelated assertion in suite 08, not here, even though the gallery renders
   * the very component with the very defect.
   *
   * A screenshot cannot see it. The row LOOKS correct; the badge is right there
   * in the picture. Only the accessibility tree shows that the badge is gone.
   *
   * So this reads the tree the way a screen reader would.
   */
  it('primitives announce their content, not their glyphs', async () => {
    // Deliberately does NOT scroll. The gallery is a ScrollView, so every
    // section is mounted and present in the accessibility tree regardless of
    // where the viewport happens to be — which the first version of this test
    // proved the hard way, failing with "found at y=-712, off screen" because it
    // ran after the screenshot pass had already scrolled to the bottom.
    //
    // Not scrolling is also more honest about what is being tested. These are
    // assertions about NAMES, not about layout; making them depend on scroll
    // position would couple them to section ordering for no benefit.
    const tree = await snapshot();

    // Guard against a vacuous pass: if the gallery failed to render, every
    // queryAll below returns [] and the glyph assertion would "succeed".
    expect(
      queryAll(tree, { type: 'Button' }).length,
      'the gallery should contribute a good number of buttons to the tree',
    ).toBeGreaterThan(10);

    // 1. A trailing slot carrying INFORMATION must reach the accessible name.
    const unreadRow = query(tree, { text: /ana silva/i, type: 'Button' });
    expect(unreadRow, 'the ListRow story with a badge should be in the tree').toBeDefined();
    expect(
      unreadRow?.AXLabel ?? '',
      'ListRow must fold its trailingLabel into the accessible name — without it the badge is announced to nobody',
    ).toMatch(/2 unread/i);

    // Sanity: the row still carries its own text, i.e. the assertion above is
    // not passing because the label became ONLY the trailing.
    expect(unreadRow?.AXLabel ?? '').toMatch(/ana silva/i);

    // 2. No control anywhere in the gallery may announce a bare glyph. This is
    //    the runtime twin of the a11y/glyph-button-needs-label lint rule: the
    //    rule catches the source pattern, this catches anything that produces
    //    the same RESULT by another route — an icon font, a mis-set label, a
    //    primitive that forwards the wrong prop.
    const GLYPH = /^[^\w\s]{1,3}$/u;
    const speaksGlyph = queryAll(tree, { type: 'Button' })
      .filter((b) => b.AXLabel && GLYPH.test(b.AXLabel.trim()))
      .map((b) => b.AXLabel);

    expect(
      speaksGlyph,
      'these controls announce a punctuation character instead of what they do',
    ).toEqual([]);
  }, 180_000);

  /**
   * The one thing the dark-mode spike could not prove without a device: that
   * `useThemedStyles` actually resolves dark tokens when the scheme changes.
   *
   * A screenshot alone would not settle it. "The dark capture looks different"
   * is also satisfied by a half-applied theme, or by the navigation chrome
   * changing while screen content stays light — which is precisely the state
   * this app was in before ColorSchemeProvider was mounted, since expo-router
   * already themed the chrome. So the gallery renders the RESOLVED value and
   * this asserts on it.
   */
  it('resolves dark tokens when the simulator switches appearance', async () => {
    const dir = join(CONFIG.artifactsDir, 'design-system');

    // Does NOT scroll, for the same reason the test above does not: this runs
    // after the screenshot pass has already scrolled to the bottom, and
    // `scrollUntilVisible` only scrolls DOWN — it fails with "found at y=-928,
    // off screen". The gallery is a ScrollView, so the probe is in the tree
    // either way, and what is being asserted is a VALUE, not visibility.
    const probeLabel = async () =>
      query(await snapshot(), { text: /scheme=/i })?.AXLabel ?? '';

    expect(await probeLabel(), 'beforeAll pins the simulator to light').toMatch(/scheme=light/i);

    await setAppearance('dark');
    try {
      // No relaunch: RN's useColorScheme is live, so the re-render IS the
      // mechanism under test. Waiting for this text to change is the assertion
      // that the context propagated and useMemo re-ran.
      const dark = await pollUntil(probeLabel, (l) => /scheme=dark/i.test(l), {
        timeoutMs: 20_000,
        label: 'gallery switches to the dark scheme',
      });

      expect(
        dark,
        'the resolved background must be the DARK token, not merely a changed one',
      ).toMatch(/background=#2f103d/i);

      await screenshot(join(dir, '99-dark.png'));
    } finally {
      // The lock hands this simulator to the next suite; leaving it dark would
      // silently change every screenshot that follows.
      await setAppearance('light');
    }

    await pollUntil(probeLabel, (l) => /scheme=light/i.test(l), {
      timeoutMs: 20_000,
      label: 'gallery restored to light',
    });
  }, 180_000);
});
