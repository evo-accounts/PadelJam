import { dark, light } from '@padel/ui';
import { describe, expect, it } from 'vitest';

import type { ThemeColors } from './ThemeProvider.tsx';

/**
 * What this can and cannot cover.
 *
 * `useThemedStyles` is a hook, and this app has no React Native render-test
 * library — adding one is a dependency decision, not a spike decision. So these
 * test the part that carries the actual risk and needs no renderer: whether a
 * module-scope factory really does yield different values per scheme, and
 * whether the two schemes are interchangeable at all.
 *
 * NOT covered, and stated so it is not mistaken for covered: that the context
 * propagates, that useMemo re-runs on a scheme change, and that a converted
 * screen renders dark on a device. The first two need a renderer; the third
 * needs a ThemeProvider mounted at the app root, which nothing does yet.
 */
describe('themed style factories', () => {
  // Exactly the shape every converted screen uses, minus StyleSheet.create,
  // which is a React Native import and identity-returns its argument here.
  const makeStyles = (c: ThemeColors) => ({
    screen: { backgroundColor: c.background },
    card: { backgroundColor: c.card, borderColor: c.border },
    title: { color: c.foreground },
    cta: { backgroundColor: c.primary },
  });

  it('produces different colours for each scheme', () => {
    const l = makeStyles(light);
    const d = makeStyles(dark);

    expect(l.screen.backgroundColor).not.toBe(d.screen.backgroundColor);
    expect(l.card.backgroundColor).not.toBe(d.card.backgroundColor);
    expect(l.title.color).not.toBe(d.title.color);
    expect(l.cta.backgroundColor).not.toBe(d.cta.backgroundColor);
  });

  it('keeps the two schemes interchangeable', () => {
    // A factory takes ThemeColors, so any token it reads must exist in BOTH.
    // A screen that reads a light-only token would fail to typecheck, but only
    // if the key sets are genuinely identical — assert that rather than trust it.
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  it('has no token that is the same in both schemes by accident', () => {
    // Not a correctness requirement — some tokens legitimately match, e.g. a
    // brand colour that does not change. This pins WHICH ones do, so that a
    // scheme edit which silently collapses a colour pair shows up as a diff
    // here rather than as an invisible control on a device.
    const shared = (Object.keys(light) as (keyof typeof light)[])
      .filter((k) => light[k] === dark[k])
      .sort();

    expect(shared).toMatchInlineSnapshot(`
      [
        "infoForeground",
        "sidebarPrimaryForeground",
        "warningForeground",
      ]
    `);
  });
});
