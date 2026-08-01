#!/usr/bin/env node
/**
 * Every `t('key')` in mobile must resolve in every locale.
 *
 *   node scripts/check-i18n-keys.mjs
 *
 * WHY THIS EXISTS
 *
 * i18n keys are the one class of error in this codebase with NO compiler behind
 * it. `t('doesNotExist')` typechecks, lints, and renders the raw key as visible
 * text at runtime. It bit twice during the primitive migration:
 *
 *   - `t('paidLabel')` in event/[id]/manage.tsx, where the real key is
 *     `paidBadge`. Caught only because a search anchor happened to fail.
 *   - `hourDecreaseLabel` in wizard/DateTimePicker.tsx, where the script meant
 *     to add it threw and wrote nothing. typecheck, lint and the unit tests all
 *     stayed green; the screen would have shown the key to users.
 *
 * The E2E suite does not catch it either — it reads copy off the accessibility
 * tree, so a raw key is just... a string it finds.
 *
 * WHAT IT DOES NOT DO
 *
 * Only checks LITERAL keys. `t(`${cap}Desc`)` and `t(dynamic)` are skipped and
 * reported as a count, because resolving them needs real evaluation. That is a
 * deliberate limit, not an oversight — a checker that guessed at template keys
 * would produce false failures and get switched off.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN = ['apps/mobile/app', 'apps/mobile/components'];
const CATALOG = join(ROOT, 'apps/mobile/lib/i18n-mobile.ts');
/** The SECOND catalog. Mobile reads both — auth/common/onboarding live here. */
const RESOURCES = join(ROOT, 'packages/i18n/src/resources');

/** `t('someKey')` — single or double quoted, no template literals. */
const LITERAL = /\bt\(\s*['"]([A-Za-z][A-Za-z0-9_]*)['"]/g;
/** Anything else passed to t(): template strings, variables, expressions. */
const DYNAMIC = /\bt\(\s*[`{a-z_$]/g;

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (['.ts', '.tsx'].includes(extname(p))) acc.push(p);
  }
  return acc;
}

const catalog = readFileSync(CATALOG, 'utf8');

/**
 * Parse the catalog into namespace -> locale -> Set(keys).
 *
 * The shape is `const mobileEvent = { 'pt-PT': {...}, 'pt-BR': {...}, en: {...} }`,
 * one const per NAMESPACE, each holding every locale. That nesting is the whole
 * reason a naive occurrence count is wrong: a key shared by five namespaces
 * appears 15 times across 3 locales, which looks like "15 locales" if you just
 * count. (I wrote that version first and it reported 670 false failures.)
 */
function parseCatalog(src) {
  const namespaces = new Map();
  const nsRe = /^const (mobile[A-Za-z]+) = \{$/gm;
  const bounds = [...src.matchAll(nsRe)].map((m) => ({ name: m[1], start: m.index }));
  bounds.forEach((b, i) => {
    const body = src.slice(b.start, i + 1 < bounds.length ? bounds[i + 1].start : src.length);
    const locales = new Map();
    const locRe = /^  '?([a-zA-Z-]+)'?: \{$/gm;
    const locs = [...body.matchAll(locRe)].map((m) => ({ code: m[1], start: m.index }));
    locs.forEach((l, j) => {
      const block = body.slice(l.start, j + 1 < locs.length ? locs[j + 1].start : body.length);
      const keys = new Set([...block.matchAll(/^    ([A-Za-z][A-Za-z0-9_]*):/gm)].map((m) => m[1]));
      locales.set(l.code, keys);
    });
    namespaces.set(b.name, locales);
  });
  return namespaces;
}

const namespaces = parseCatalog(catalog);
const ALL_LOCALES = [...new Set([...namespaces.values()].flatMap((l) => [...l.keys()]))];

/**
 * Keys from packages/i18n/src/resources/<locale>/<ns>.json.
 *
 * Mobile resolves against BOTH catalogs, so checking only the .ts one reports
 * `appName` and `skip` as missing when they are simply declared elsewhere.
 */
const shared = new Map(); // locale -> Set(keys)
for (const locale of readdirSync(RESOURCES)) {
  const dir = join(RESOURCES, locale);
  if (!statSync(dir).isDirectory()) continue;
  const keys = new Set();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    for (const k of Object.keys(JSON.parse(readFileSync(join(dir, f), 'utf8')))) keys.add(k);
  }
  shared.set(locale, keys);
}
const SHARED_LOCALES = [...shared.keys()];

/**
 * i18next PLURALS. `t('memberCount', { count })` resolves to `memberCount_one`
 * or `memberCount_other` — the bare key is never declared, and treating that as
 * missing flagged seven healthy keys on the first run.
 */
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];
const satisfies = (keys, key) =>
  keys.has(key) || PLURAL_SUFFIXES.some((sfx) => keys.has(key + sfx));

/**
 * Where a key lives, and whether it is complete there.
 * A key is OK if SOME namespace declares it in EVERY locale.
 */
function lookup(key) {
  // The shared JSON catalog counts too.
  const inShared = SHARED_LOCALES.filter((l) => satisfies(shared.get(l), key));
  if (inShared.length === SHARED_LOCALES.length && inShared.length > 0) return { ok: true };

  const partial = [];
  for (const [ns, locales] of namespaces) {
    const has = [...locales.entries()].filter(([, keys]) => satisfies(keys, key)).map(([code]) => code);
    if (has.length === 0) continue;
    if (has.length === ALL_LOCALES.length) return { ok: true };
    partial.push({ ns, has });
  }
  return { ok: false, partial };
}

const missing = new Map();
let dynamicCount = 0;
let checked = 0;

for (const file of SCAN.flatMap((d) => walk(join(ROOT, d)))) {
  const src = readFileSync(file, 'utf8');
  dynamicCount += (src.match(DYNAMIC) ?? []).length;
  for (const m of src.matchAll(LITERAL)) {
    const key = m[1];
    checked += 1;
    const r = lookup(key);
    if (r.ok) continue;
    const entry = missing.get(key) ?? { files: new Set(), partial: r.partial };
    entry.files.add(relative(ROOT, file));
    missing.set(key, entry);
  }
}

console.log(
  `[i18n] ${checked} literal key uses checked across ${namespaces.size} namespaces `
  + `x ${ALL_LOCALES.length} locales (${ALL_LOCALES.join(', ')}); `
  + `${dynamicCount} dynamic key(s) skipped — see the note in this file`,
);

if (missing.size === 0) {
  console.log('[i18n] ok — every literal key resolves in every locale');
  process.exit(0);
}

console.error(`\n[i18n] ERROR: ${missing.size} key(s) missing or incomplete:\n`);
for (const [key, { files, partial }] of missing) {
  const where = partial.length
    ? partial.map((p) => `${p.ns}: only ${p.has.join(', ')}`).join('; ')
    : 'not declared in ANY namespace';
  console.error(`  ${key}  — ${where}`);
  for (const f of files) console.error(`      ${f}`);
}
console.error(
  '\n  Add the key to every locale block in apps/mobile/lib/i18n-mobile.ts.\n'
  + '  Nothing else catches this: it typechecks, lints, and renders the raw key.',
);
process.exit(1);
