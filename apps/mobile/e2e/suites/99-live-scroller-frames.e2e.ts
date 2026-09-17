import { beforeAll, describe, it } from 'vitest';
import { keyboardTop, snapshot, queryAll, type AxElement } from '../driver/a11y';
import { freshInstall } from '../driver/app';
import { deepLink, loginAs } from '../driver/flows';
import { expectVisible } from '../driver/expect';
import { manifest, resetDb } from '../fixtures/seed';

/**
 * SCRATCH (99-*, excluded from the suite by vitest.e2e.config.ts). Not a test —
 * it asserts nothing. It prints numbers to be diffed between two builds.
 *
 * The question: app/event/[id]/live.tsx moved its content scroller onto
 * `<Screen scroll>`, and `Screen` puts `flex: 1` on the ScrollView it renders.
 * RN 0.85's ScrollView.js already composes `baseVertical`/`baseHorizontal`
 * (flexGrow: 1, flexShrink: 1) onto every ScrollView's OUTER node, so the only
 * thing that changes is flexBasis: auto -> 0.
 *
 * On seven of the eight migrated screens that is unobservable, because the
 * scroller is the single flexible child of its column. live.tsx is the
 * exception: the round-tab strip is `horizontal`, and `baseHorizontal` carries
 * flexGrow: 1 too — in a COLUMN parent that makes the strip a second flexible
 * child competing for vertical space. Changing the scroller's basis changes how
 * free space is split between them, in the direction of the strip taking more.
 *
 * So: print the strip's vertical band and the content's top edge, on a build of
 * main and on the migration branch, and diff. Equal numbers settle it; a moved
 * strip says live.tsx keeps its hand-rolled ScrollView.
 *
 * HOW TO RUN IT, because the obvious ways do not work. `exclude: ['suites/99-*']`
 * in vitest.e2e.config.ts is applied to the FOUND FILES, so it beats a positional
 * filter as well as the default run: `--suite 99` through scripts/e2e/run.mjs,
 * `e2e:test -- suites/99-...`, and a CLI `--exclude` override all collect zero
 * files. Measured, not assumed — the same spec copied to `suites/97-` collects
 * fine, which is what pins it on the pattern rather than on this file. It fails
 * loudly ("No test files found") rather than silently passing, at least.
 *
 * So: rename it to a non-99 prefix for the run, and rename it back after.
 *
 *   git mv .../99-live-scroller-frames.e2e.ts .../97-scratch.e2e.ts
 *   pnpm --filter mobile e2e -- --suite 97 --wait   # --wait queues behind a
 *   git mv ... back                                 # run already holding the lock
 *
 * Run it through run.mjs, not vitest directly: run.mjs is what takes
 * /tmp/padeljam-e2e.lock, and the simulator and local Supabase on this machine
 * are shared singletons that a second concurrent run corrupts.
 *
 * E3 "Live Mexicano" is points-scored with two rounds — the strip has round
 * tabs and the content overflows (the shrink case). E11 "Timed Americano" is
 * the only time-scored event, which is what gates the Timer tab, and it has one
 * round and far less content (the grow case, where a strip that grows has room
 * to show it).
 */

/** The vertical band the round-tab strip occupies, read off its chips. */
function band(els: AxElement[]): string {
  if (els.length === 0) return 'ABSENT';
  const top = Math.min(...els.map((e) => e.frame.y));
  const bottom = Math.max(...els.map((e) => e.frame.y + e.frame.height));
  return `y=${top}..${bottom} (h=${bottom - top}, n=${els.length})`;
}

async function report(label: string, eventId: string) {
  await deepLink(`mobile:///event/${eventId}/live`);
  await expectVisible({ text: /round|timer|matches/i, type: 'Button' }, { timeout: 20_000 });
  const tree = await snapshot();

  // The strip is not itself an addressable element — its Chips are, and a Chip
  // is a Pressable with accessibilityRole="button", so it surfaces as a Button.
  // The type filter matters: the content below also says "Round N", as a label,
  // and letting one of those into the set would widen the band by the height of
  // the scroller and hide exactly the movement being measured.
  const roundTabs = queryAll(tree, { text: /^round \d+$/i, type: 'Button' });
  const strays = queryAll(tree, { text: /^round \d+$/i }).length - roundTabs.length;
  // Everything below the strip is content. The lowest-y element under the
  // strip's bottom edge is the content scroller's first row.
  const stripBottom = roundTabs.length
    ? Math.max(...roundTabs.map((e) => e.frame.y + e.frame.height))
    : 0;
  const below = tree
    .filter((e) => e.frame.y >= stripBottom && e.frame.height < 400)
    .sort((a, b) => a.frame.y - b.frame.y);
  const screenH = Math.max(...tree.map((e) => e.frame.y + e.frame.height));

  console.log(`\n=== ${label} (${eventId}) ===`);
  console.log(`  round-tab strip : ${band(roundTabs)}`);
  console.log(`  first content   : ${below[0] ? `y=${below[0].frame.y} "${below[0].AXLabel ?? ''}"` : 'NONE'}`);
  console.log(`  screen bottom   : ${screenH}`);
  console.log(`  tab labels      : ${roundTabs.map((e) => e.AXLabel).join(' | ') || '(none)'}`);
  console.log(`  non-Button "Round N" elements excluded: ${strays}`);
  // A raised keyboard takes height out of the column, which is free space the
  // strip and the scroller would then divide differently — a second variable on
  // top of the one being isolated. This spec never focuses a field, so it should
  // always print null; printing it makes that a fact about the run rather than
  // an assumption about the spec.
  console.log(`  keyboard top    : ${keyboardTop(tree) ?? 'null (down)'}`);
}

describe('99 live.tsx scroller frames (scratch, not a test)', () => {
  beforeAll(async () => {
    await resetDb('full');
    await freshInstall();
    await loginAs('alex'); // organizer of both E3 and E11
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  it('prints the frames', async () => {
    const m = manifest();
    await report('E3 Live Mexicano (points, 2 rounds, content overflows)', m.events.e3);
    await report('E11 Timed Americano (time-scored, 1 round, short content)', m.events.e11);
  });
});
