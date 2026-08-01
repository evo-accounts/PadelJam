#!/usr/bin/env node
/**
 * A one-way ratchet on hardcoded colours in apps/mobile.
 *
 *   node scripts/check-hex-budget.mjs            # fail if the count ROSE
 *   node scripts/check-hex-budget.mjs --update   # lower the baseline after a migration
 *
 * WHY A RATCHET RATHER THAN A LINT RULE
 *
 * There are ~1300 existing violations. An ESLint rule at `error` fails
 * instantly on all of them; at `warn` it does not gate CI and the signal drowns
 * in noise; suppressing it needs an eslint-disable header in 180+ files. None of
 * those get you to zero.
 *
 * A single monotonically-decreasing integer does: new code cannot add colours,
 * every migration PR lowers the number by hand in one place, and the process
 * terminates. When BASELINE hits 0 this script is deleted and replaced by
 * `no-restricted-syntax` in apps/mobile/eslint.config.mjs — the rule is the
 * endgame, not the alternative.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN = ['apps/mobile/app', 'apps/mobile/components', 'apps/mobile/lib'];
// The token surface is where colours are ALLOWED to be spelled out.
const EXEMPT = ['apps/mobile/theme'];
const SELF = fileURLToPath(import.meta.url);

/**
 * The ratchet. Lower it in the same PR that removes the colours; never raise it.
 *
 *   1316  starting point, measured (the plan's 1303 came from a survey with
 *         slightly different directory boundaries)
 *   1079  app/event/[id]/** migrated — 237 colours
 *
 * At 0 this script is deleted and `no-restricted-syntax` takes over.
 */
const BASELINE = 1079;

const HEX = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/g;
const RGBA = /\brgba?\(/g;

function scan(dir, acc) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const rel = relative(ROOT, p);
    if (EXEMPT.some((e) => rel.startsWith(e))) continue;
    const st = statSync(p);
    if (st.isDirectory()) { scan(p, acc); continue; }
    if (!['.ts', '.tsx'].includes(extname(p))) continue;
    const src = readFileSync(p, 'utf8');
    const n = (src.match(HEX)?.length ?? 0) + (src.match(RGBA)?.length ?? 0);
    if (n > 0) acc.push({ file: rel, n });
  }
  return acc;
}

const files = SCAN.flatMap((d) => scan(join(ROOT, d), []));
const total = files.reduce((s, f) => s + f.n, 0);

if (process.argv.includes('--update')) {
  const src = readFileSync(SELF, 'utf8').replace(/const BASELINE = \d+;/, `const BASELINE = ${total};`);
  writeFileSync(SELF, src);
  console.log(`[hex-budget] baseline updated ${BASELINE} -> ${total}`);
  process.exit(0);
}

console.log(`[hex-budget] ${total} hardcoded colours across ${files.length} files (baseline ${BASELINE})`);

if (total > BASELINE) {
  const worst = files.sort((a, b) => b.n - a.n).slice(0, 5);
  console.error(
    `[hex-budget] ERROR: went UP by ${total - BASELINE}.\n`
    + '  New code must use apps/mobile/theme instead of a raw colour:\n'
    + '    colors.foreground / colors.primary / colors.border ...\n'
    + '  See apps/mobile/theme/color-map.ts for what replaces what.\n'
    + `  Densest files right now:\n${worst.map((f) => `    ${f.n.toString().padStart(4)}  ${f.file}`).join('\n')}`,
  );
  process.exit(1);
}

if (total < BASELINE) {
  console.log(
    `[hex-budget] ${BASELINE - total} fewer than the baseline — lower it in this PR:\n`
    + '    node scripts/check-hex-budget.mjs --update',
  );
  process.exit(1);
}

console.log('[hex-budget] ok — no new hardcoded colours');
