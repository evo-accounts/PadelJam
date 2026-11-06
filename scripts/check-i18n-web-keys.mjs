#!/usr/bin/env node
/**
 * Every literal `t('key')` in apps/web must resolve in all three locales.
 *
 *   node --no-warnings scripts/check-i18n-web-keys.mjs
 *
 * The mobile twin is check-i18n-keys.mjs; web differs (nested keys, `ns:key`
 * prefixes, `{ t: alias } = useT('ns')`, `{ ns, key }` messages), so it has its
 * own script. `pnpm i18n:check` runs both.
 *
 * The catalog is read by RUNNING apps/web/src/lib/i18n-web.ts (Node strips the
 * types) against a fake i18next instance, so new namespaces need no change here.
 *
 * Checked: literal keys; each namespace has identical key sets in all locales
 * (this is what covers dynamic `t(...)` calls, which are only counted).
 * Not checked: dynamic keys, hardcoded strings.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN = process.env.I18N_WEB_SCAN_DIR ?? join(ROOT, 'apps/web/src');
const CATALOG = join(ROOT, 'apps/web/src/lib/i18n-web.ts');
const RESOURCES = join(ROOT, 'packages/i18n/src/resources');
const LOCALES = ['pt-PT', 'pt-BR', 'en'];
const PLURAL = ['', '_zero', '_one', '_two', '_few', '_many', '_other'];
const MIN_LITERALS = 1000;
const DEFAULT_NS = 'common';

if (!process.features.typescript) {
  console.error('i18n web keys: Node 22.18+ is required (native TypeScript stripping).');
  process.exit(1);
}

// ---- catalog: ns -> locale -> object ---------------------------------------
const catalog = {};
const bundle = (locale, ns) => ((catalog[ns] ??= {})[locale] ??= {});
const fake = {
  addResourceBundle(locale, ns, res) {
    Object.assign(bundle(locale, ns), res);
  },
};
const mod = await import(pathToFileURL(CATALOG).href);
for (const [name, fn] of Object.entries(mod)) {
  if (/^registerWeb/.test(name) && typeof fn === 'function') fn(fake);
}
for (const locale of readdirSync(RESOURCES)) {
  for (const file of readdirSync(join(RESOURCES, locale))) {
    if (!file.endsWith('.json')) continue;
    const ns = file.slice(0, -5);
    Object.assign(bundle(locale, ns), JSON.parse(readFileSync(join(RESOURCES, locale, file), 'utf8')));
  }
}
const namespaces = Object.keys(catalog);

function has(obj, key) {
  const parts = key.split('.');
  const last = parts.pop();
  let o = obj;
  for (const p of parts) o = o?.[p];
  return !!o && typeof o === 'object' && PLURAL.some((s) => typeof o[last + s] === 'string');
}
const missingLocales = (ns, key) => LOCALES.filter((l) => !has(catalog[ns]?.[l], key));
const livesIn = (key) => namespaces.filter((ns) => missingLocales(ns, key).length === 0);

// ---- scan -------------------------------------------------------------------
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (['.ts', '.tsx'].includes(extname(p)) && !/\.test\./.test(entry) && p !== CATALOG) acc.push(p);
  }
  return acc;
}

/** `{ t } = useT('x')`, `{ t: tc } = useT('x')`; bare `useT()` is the default ns. */
const BIND = /\{\s*([^{}]*?)\}\s*=\s*useT\(\s*(?:['"]([A-Za-z]+)['"])?/g;
const MESSAGE = [
  /\{\s*ns:\s*['"](\w+)['"]\s*,\s*key:\s*['"]([^'"\n]+)['"]/g,
  /\{\s*key:\s*['"]([^'"\n]+)['"]\s*,\s*ns:\s*['"](\w+)['"]/g,
];

const problems = [];
let literals = 0;
let dynamic = 0;
let unbound = 0;
const report = (file, key, nss, label) => {
  const detail = nss.map((n) => `${n}: ${missingLocales(n, key).join('/')}`).join('; ');
  const elsewhere = livesIn(key);
  problems.push(
    `  ${key} - ${detail} - ${relative(ROOT, file)} (${label})` +
      (elsewhere.length ? ` - declared in: ${elsewhere.join(', ')}` : ''),
  );
};
/** Resolves when at least one candidate namespace has it in every locale. */
const resolves = (nss, key) => nss.some((n) => missingLocales(n, key).length === 0);

for (const file of walk(SCAN)) {
  const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const bound = {};
  for (const m of src.matchAll(BIND)) {
    const t = m[1].match(/(?<![\w$])t\b(?:\s*:\s*([\w$]+))?/);
    if (t) (bound[t[1] ?? 't'] ??= new Set()).add(m[2] ?? DEFAULT_NS);
  }
  for (const name of new Set(['t', ...Object.keys(bound)])) {
    const call = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}\\(\\s*(?:(['"])([^'"\\n]+)\\1|([\`\\w$]))`, 'g');
    for (const m of src.matchAll(call)) {
      if (m[3]) {
        dynamic++;
        continue;
      }
      literals++;
      let key = m[2];
      let nss = [...(bound[name] ?? [])];
      const args = src.slice(m.index, m.index + 200).split(')')[0];
      const opt = args.match(/\bns:\s*['"](\w+)['"]/);
      const prefixed = key.match(/^(\w+):(.+)$/);
      if (prefixed) {
        nss = [prefixed[1]];
        key = prefixed[2];
      } else if (opt) nss = [opt[1]];
      if (!nss.length) {
        unbound++;
        nss = namespaces;
      }
      if (!resolves(nss, key)) report(file, key, nss.length > 4 ? ['any namespace'] : nss, name);
    }
  }
  for (const [i, re] of MESSAGE.entries()) {
    for (const m of src.matchAll(re)) {
      literals++;
      const [ns, key] = i === 0 ? [m[1], m[2]] : [m[2], m[1]];
      if (!resolves([ns], key)) report(file, key, [ns], 'message');
    }
  }
}

// ---- parity -----------------------------------------------------------------
const flat = (o, p = '') =>
  Object.entries(o ?? {}).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [p + k]));
for (const [ns, perLocale] of Object.entries(catalog)) {
  const all = new Set(LOCALES.flatMap((l) => flat(perLocale[l])));
  for (const l of LOCALES) {
    const have = new Set(flat(perLocale[l]));
    for (const k of all) if (!have.has(k)) problems.push(`  ${k} - ${ns} - missing in ${l} (parity)`);
  }
}

if (literals < MIN_LITERALS) {
  console.error(`i18n web keys: only ${literals} literal keys checked (expected at least ${MIN_LITERALS}). The scan is probably empty.`);
  process.exit(1);
}
if (problems.length) {
  console.error(`i18n web keys: ${problems.length} problem(s) in ${literals} literal uses:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`i18n web keys: ${literals} literal uses OK in ${LOCALES.length} locales (${dynamic} dynamic skipped, ${unbound} on unbound translators).`);
