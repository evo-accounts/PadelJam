#!/usr/bin/env node
/**
 * A ratchet on literal font sizes and corner radii in apps/mobile.
 *
 * WHY THIS IS A BUDGET AND NOT AN ESLINT RULE. Raw colours are an eslint
 * `no-restricted-syntax` error, and that works because the count was already at
 * zero when the rule landed — five pull requests of a decreasing integer got it
 * from 1316 to 0 first. Sizes are where that history is today: 400-odd literals
 * across 130 files, every one of them a screen that has not been migrated to
 * `Text` and the `radius` tokens yet. At `error` this would fail on all of them
 * from day one; at `warn` it would not gate anything. A decreasing integer is
 * the only setting that both holds the line now and can reach zero.
 *
 * WHEN THE COUNT DROPS, LOWER THE BUDGET. The script fails in BOTH directions
 * for exactly that reason: going over is drift, and coming in under without
 * lowering the number quietly re-opens the slack you just closed.
 *
 * Replace this with an eslint rule the day the budget reaches 0, and delete the
 * script, the way `scripts/check-hex-budget.mjs` was deleted.
 *
 * WHAT COUNTS: a numeric literal assigned to `fontSize` or `borderRadius`.
 * `fontSize: type.body.fontSize` and `borderRadius: radius.lg` are the shapes we
 * want, so they are not matched. Comments are stripped first — the hex budget
 * once failed on a doc comment explaining which colour a token replaced.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCAN = join(ROOT, 'apps/mobile');

/** theme/ is where sizes are ALLOWED to be spelled out, exactly as for colours. */
const SKIP_DIRS = new Set(['node_modules', 'theme', '.expo', 'ios', 'android', 'dist']);

/**
 * The ratchet. Lower it whenever a pull request takes screens onto `Text` and
 * the `radius` tokens; never raise it.
 */
const BUDGET = Number(process.env.SIZE_BUDGET ?? 223);

const PATTERN = /\b(fontSize|borderRadius)\s*:\s*-?\d/g;

/** Block and line comments, so prose about sizes is not a violation. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(full)) yield full;
  }
}

const hits = [];
for (const file of walk(SCAN)) {
  const source = stripComments(readFileSync(file, 'utf8'));
  source.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(PATTERN)) {
      hits.push({ file: relative(ROOT, file), line: index + 1, prop: match[1] });
    }
  });
}

const total = hits.length;

if (total > BUDGET) {
  const byFile = new Map();
  for (const hit of hits) byFile.set(hit.file, (byFile.get(hit.file) ?? 0) + 1);
  const worst = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  console.error(`Literal fontSize / borderRadius: ${total}, budget ${BUDGET}.`);
  console.error('');
  console.error('Use `type.<role>` (or the `Text` primitive) and `radius.<step>` from');
  console.error('apps/mobile/theme instead. Worst offenders:');
  for (const [file, count] of worst) console.error(`  ${String(count).padStart(4)}  ${file}`);
  process.exit(1);
}

if (total < BUDGET) {
  console.error(`Literal fontSize / borderRadius: ${total}, budget ${BUDGET}.`);
  console.error('');
  console.error(`Under budget — lower BUDGET to ${total} in scripts/check-size-budget.mjs`);
  console.error('so the slack you just closed cannot be spent again.');
  process.exit(1);
}

console.log(`Literal fontSize / borderRadius: ${total} (at budget).`);
