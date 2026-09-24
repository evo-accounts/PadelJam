import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { describeSelector, query, queryAll, snapshot, type AxElement, type Selector } from '../driver/a11y';
import { scrollUntilVisible, swipe, tap } from '../driver/actions';
import { freshInstall } from '../driver/app';
import { CONFIG } from '../driver/config';
import { captureFailure, expectVisible } from '../driver/expect';
import { deepLink } from '../driver/flows';
import { overrideStatusBar, screenshot } from '../driver/sim';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Where the gallery's viewport really ends. Storybook's on-device UI docks its
 * own bar under the story — a 40pt nav, a 1pt border and the 34pt home-indicator
 * inset — so the story is clipped at y=799, not at the bottom of the screen.
 * Measured twice on PR #191's artifact: the bar's menu button reports
 * y=812..829, and the fullscreen toggle Storybook floats 16pt above the bar
 * ends at y=783.
 */
const STORYBOOK_BAR_TOP = 799;

/**
 * `scrollUntilVisible`, then make sure the WHOLE control sits above Storybook's
 * bar before anything taps it.
 *
 * The shared stop rule judges an element by its top edge (y < 800). That is
 * right on every real screen and must stay that way: tightening it once broke
 * 12 tests across 7 suites. Only the Storybook build puts something the tree
 * cannot see across the bottom band. On PR #191's run "Show banner" came to rest
 * at y=799..843. The stop rule accepted it, the gallery clipped it out of sight,
 * and the tap at its centre (y≈821) hit the bar's menu button. That slid
 * Storybook's story navigator up over the gallery, and the banner assertion
 * timed out against a perfectly healthy tree. Whether it happens depends on
 * where the scroll decelerates, which is why the same gallery passes on other
 * runs.
 *
 * One ordinary swipe is the right size of nudge. It only happens when the
 * target's top is already past y≈755, and a swipe carries the gallery about
 * 600pt. Measured with each button parked on the bar: "Open confirm" went from
 * y=793 to y=192, and "Show banner" from y=792 to y=199. An overshoot past the
 * top would get a swipe back down on the next pass. The second read after a
 * pause is the same settle guard `scrollUntilVisible` uses: the content is
 * still decelerating when swipe() returns.
 */
async function scrollAboveStorybookBar(
  sel: Selector,
  opts?: Parameters<typeof scrollUntilVisible>[1],
): Promise<void> {
  await scrollUntilVisible(sel, opts);
  // The top limit is the one scrollUntilVisible stops on.
  const clear = (el: AxElement | undefined) =>
    !!el && el.frame.y > 60 && el.frame.y + el.frame.height <= STORYBOOK_BAR_TOP;
  for (let i = 0; i < 3; i++) {
    const el = query(await snapshot(), sel);
    if (clear(el)) {
      await sleep(700);
      if (clear(query(await snapshot(), sel))) return;
      continue;
    }
    await swipe(el && el.frame.y <= 60 ? 'down' : 'up');
  }
  const el = query(await snapshot(), sel);
  const where = el
    ? `at y=${Math.round(el.frame.y)}..${Math.round(el.frame.y + el.frame.height)}`
    : 'gone from the tree';
  const reason =
    `could not bring ${describeSelector(sel)} clear of Storybook's bar `
    + `(the gallery shows y=60..${STORYBOOK_BAR_TOP}): ${where}`;
  const dir = await captureFailure(reason);
  throw new Error(`${reason}\nartifacts: ${dir}`);
}

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
    // No explicit timeout: inherit hookTimeout (600 s) from vitest.e2e.config.ts.
    // freshInstall can retry the purge three times, and since #115 a relaunch
    // that SpringBoard refuses escalates to a reinstall and then a device
    // reboot. The old 180 s cap was tighter than that worst case and aborted a
    // recovery that was working.
  });

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
      { file: '10b-cards.png', heading: /^cards$/i },
      { file: '11-field.png', heading: /^field$/i },
      { file: '11b-password-field.png', heading: /^passwordfield$/i },
      // CodeField, Dots, Illustration and Checkbox share one heading, so this is
      // one entry rather than four. The heading is two words for the same reason
      // `card` and `Loading` had to be renamed: `checkbox` and `dots` also appear
      // as sub-labels inside the section, and `scrollUntilVisible` takes the
      // FIRST match anywhere in the tree.
      { file: '11c-sign-in-primitives.png', heading: /^sign-in primitives$/i },
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

    // 3. Every TopBar control has a real name, and the variants are all mounted.
    for (const label of ['Search', 'More', 'Close', 'Back']) {
      expect(queryAll(tree, { text: new RegExp(`^${label}$`, 'i'), type: 'Button' }).length, `a TopBar control named ${label}`).toBeGreaterThan(0);
    }
    // The wizard bar carries both: the heading text sits between a Back and a Close.
    expect(query(tree, { text: /create event/i }), 'wizard bar title').toBeDefined();

    // 2. No control may announce a bare glyph, or a blank name.
    //
    //    The glyph half is the runtime twin of a11y/glyph-button-needs-label:
    //    the rule catches the source pattern, this catches the same RESULT
    //    arriving another way — an icon font, a mis-set label, a primitive
    //    forwarding the wrong prop.
    //
    //    WHAT NEITHER GUARD COVERS, measured rather than assumed. A control with
    //    NO accessible name at all — ImagePickerRow shipped one, whose only
    //    child was an <Image> — is invisible to both:
    //
    //      the lint rule    has no text to inspect, so there is nothing to match
    //      this assertion   never sees it: iOS does not classify an unlabeled
    //                       pressable as a Button. A probe added one to the
    //                       gallery and the tree reported it as a
    //                       GenericElement, so `{ type: 'Button' }` skips it.
    //      IconButton       DOES prevent it — accessibilityLabel is required
    //
    //    So the defence against unnamed controls is routing icon-only controls
    //    through a primitive that demands a name, not a checker. The blank-name
    //    clause below is kept anyway because it is free and does cover a Button
    //    whose label is whitespace.
    const GLYPH = /^[^\w\s]{1,3}$/u;
    const unusable = queryAll(tree, { type: 'Button' })
      .filter((b) => {
        const name = b.AXLabel?.trim() ?? '';
        return name === '' || GLYPH.test(name);
      })
      .map((b) => b.AXLabel ?? '(no accessible name)');

    expect(
      unusable,
      'these controls announce a punctuation character, or nothing at all',
    ).toEqual([]);
  }, 180_000);

  /**
   * The sheet and banner primitives render inside their own Modal / overlay
   * (SheetHost, BannerProvider), mounted above the gallery route rather than
   * inside its ScrollView. Confirming they are reachable — a real tap opens
   * them, their content is labelled, and the demo reports back what happened —
   * is the only way to exercise that wiring; a screenshot cannot tell a Modal
   * that failed to attach from one that is merely off screen.
   */
  it('sheet and banner primitives are reachable and labelled', async () => {
    // The screenshot pass leaves the gallery scrolled to the bottom; the sheet
    // demo sits above the viewport, so scroll the content back DOWN to it.
    //
    // The budget has to cover the whole gallery BELOW this section, so it grows
    // every time one is added. 10 was enough until "Choice controls" landed
    // between BottomSheet and the end (#130): the target then came to rest at
    // y=-166, a swipe and a half short, and the failure read as if the sheet
    // demo had vanished.
    //
    // All three demo buttons go through scrollAboveStorybookBar, not only the
    // one that failed. Each can come to rest with its top above y=800 and its
    // centre on Storybook's bar. That includes "Open action sheet", which used
    // to get no scroll of its own: it sits 52pt below "Open confirm" and
    // inherited whatever position the first scroll left.
    await scrollAboveStorybookBar({ text: /open confirm/i, type: 'Button' }, { direction: 'down', maxSwipes: 20 });
    await tap({ text: /open confirm/i, type: 'Button' });
    let tree = await snapshot();
    expect(query(tree, { text: /delete this\?/i }), 'confirm sheet title').toBeDefined();
    expect(query(tree, { id: 'confirm-sheet-close', text: /^close$/i, type: 'Button' }), 'confirm sheet ✕ is labelled').toBeDefined();
    await tap({ text: /^delete$/i, type: 'Button' });
    // The sheet is a Modal with accessibilityViewIsModal: while it animates out
    // the page behind it is absent from the tree, so poll instead of snapshotting.
    await expectVisible({ text: /last result: confirmed/i }, { timeout: 10_000 });

    await scrollAboveStorybookBar({ text: /open action sheet/i, type: 'Button' });
    await tap({ text: /open action sheet/i, type: 'Button' });
    await expectVisible({ text: /^remove$/i, type: 'Button' }, { timeout: 10_000 });
    await tap({ text: /^remove$/i, type: 'Button' }); // destructive → the host asks to confirm
    await expectVisible({ text: /^cancel$/i, type: 'Button' }, { timeout: 10_000 }); // the confirm step
    tree = await snapshot();
    expect(query(tree, { text: /^remove$/i, type: 'Button' }), 'destructive row asks for confirmation').toBeDefined();
    await tap({ text: /^cancel$/i, type: 'Button' });
    await expectVisible({ text: /last result: dismissed/i }, { timeout: 10_000 });

    await scrollAboveStorybookBar({ text: /show banner/i, type: 'Button' });
    await tap({ text: /show banner/i, type: 'Button' });
    await expectVisible({ text: /missing information/i }, { timeout: 5_000 });
  }, 180_000);
});
