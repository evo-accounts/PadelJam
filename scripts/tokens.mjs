#!/usr/bin/env node
/**
 * Design-token build + drift check.
 *
 *   node scripts/tokens.mjs --write   # regenerate the CSS artifact
 *   node scripts/tokens.mjs           # verify it, and the no-side-doors rules
 *
 * WHY THIS EXISTS
 *
 * The two apps previously had NO shared design values — intersecting mobile's 63
 * distinct hexes against web's 112 gave exactly 3 matches, all incidental
 * Tailwind greys. Tokens now live once, in TypeScript, and the CSS web consumes
 * is generated from them. Without a mechanical check that arrangement decays
 * immediately: someone adds `--brand: #123456` to globals.css, mobile never
 * learns of it, and the palettes diverge again silently.
 *
 * Imports the TS source directly under Node 22 type-stripping, exactly as
 * scripts/verify-production-env.mjs already does — no build step needed.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCss } from '../packages/ui/src/generate/css.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT = join(ROOT, 'apps/web/src/app/tokens.generated.css');
const WEB_APP_CSS = join(ROOT, 'apps/web/src/app');
const WRITE = process.argv.includes('--write');

const fail = (msg) => { console.error(`[tokens] ERROR: ${msg}`); process.exitCode = 1; };
const ok = (msg) => console.log(`[tokens] ok — ${msg}`);

/**
 * Compare by MEANING, not bytes: parse `--name: value` pairs per block.
 * A byte comparison would go red on a reformat or a comment edit, which trains
 * people to ignore it. This goes red only when a token's name or value changes.
 */
function parseTokens(css) {
  const out = new Map();
  let block = 'root';
  for (const raw of css.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('/*') || line.startsWith('*')) continue;
    const blockStart = line.match(/^(@theme(?:\s+inline)?|:root|\.dark)\s*\{/);
    if (blockStart) { block = blockStart[1]; continue; }
    if (line === '}') { block = 'root'; continue; }
    const decl = line.match(/^(--[a-z0-9-]+)\s*:\s*(.+?);$/i);
    if (decl) out.set(`${block} ${decl[1]}`, decl[2].trim());
  }
  return out;
}

// --- 1. the artifact matches the TypeScript ---------------------------------
const expected = renderCss();
if (WRITE) {
  writeFileSync(ARTIFACT, expected);
  console.log(`[tokens] wrote ${relative(ROOT, ARTIFACT)}`);
  process.exit(0);
}

let actual = '';
try {
  actual = readFileSync(ARTIFACT, 'utf8');
} catch {
  fail(`${relative(ROOT, ARTIFACT)} is missing. Run: pnpm tokens:build`);
}

if (actual) {
  const want = parseTokens(expected);
  const got = parseTokens(actual);
  const diffs = [];
  for (const [k, v] of want) if (got.get(k) !== v) diffs.push(`  ${k}: expected ${v}, artifact has ${got.get(k) ?? '(absent)'}`);
  for (const k of got.keys()) if (!want.has(k)) diffs.push(`  ${k}: in the artifact but not in TypeScript`);
  if (diffs.length) {
    fail(`${relative(ROOT, ARTIFACT)} is stale (${diffs.length} difference(s)). Run: pnpm tokens:build\n${diffs.slice(0, 12).join('\n')}`);
  } else {
    ok(`${want.size} token declarations match the TypeScript source`);
  }
}

// --- 2. no side doors on the web side ---------------------------------------
// THIS is the assertion that actually prevents drift. Everything else just keeps
// a generated file fresh; this stops a second, unshared source of truth existing.
// ANY custom property, not a list of known names. An allowlist was the first
// attempt and it silently passed `--brand: #123456` added straight to
// globals.css — the exact drift this is here to stop. A NEW token name is the
// most likely form of drift, so the rule has to be shape-based, not name-based.
const CUSTOM_PROP_RE = /^\s*(--[a-z0-9-]+)\s*:/i;
const cssFiles = readdirSync(WEB_APP_CSS)
  .filter((f) => f.endsWith('.css'))
  .map((f) => join(WEB_APP_CSS, f))
  .filter((p) => statSync(p).isFile() && p !== ARTIFACT);

const offenders = [];
for (const file of cssFiles) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let inInline = false;
  lines.forEach((line, i) => {
    // `@theme inline` only REMAPS semantic vars onto Tailwind utilities
    // (--color-primary: var(--primary)). That is structural wiring, not data, so
    // it stays hand-written and is exempt.
    if (/^\s*@theme\s+inline\s*\{/.test(line)) inInline = true;
    else if (inInline && /^\s*\}/.test(line)) inInline = false;
    else if (!inInline && CUSTOM_PROP_RE.test(line)) {
      offenders.push(`  ${relative(ROOT, file)}:${i + 1}  ${line.trim()}`);
    }
  });
}
if (offenders.length) {
  fail(`design tokens declared outside the generated file — mobile would never see these:\n${offenders.join('\n')}\n  Add them to packages/ui/src/tokens/ instead.`);
} else {
  ok(`no token declarations outside ${relative(ROOT, ARTIFACT)}`);
}

if (!process.exitCode) console.log('[tokens] all checks passed');
