#!/usr/bin/env node
/**
 * Rewrite hardcoded colours in React Native styles to theme tokens.
 *
 *   node scripts/migrate-colors.mjs apps/mobile/app/event/[id]   # report only
 *   node scripts/migrate-colors.mjs <dir> --write                # apply
 *
 * The decisions live in `apps/mobile/theme/color-map.ts`, not here. This script
 * is only the mechanism: it finds `<styleProperty>: '<hex>'` pairs, looks each
 * one up BY PROPERTY AND HEX, and substitutes the token. Keying on the property
 * is the whole point — `#0b1f3a` is primary TEXT 236 times and a dark CTA FILL
 * 52 times, so a replacement keyed on the colour alone would be wrong 25 ways.
 *
 * It deliberately does NOT:
 *   - touch `rgba(...)` — there is no overlay token yet, and inventing one
 *     belongs in packages/ui where web would get it too
 *   - guess at unmapped colours — it reports them and leaves them alone, so the
 *     hex budget still fails and a human has to make the call
 *   - add imports it cannot place correctly — it reports those files instead
 *
 * Every run prints what it could not do. A migration that silently skips things
 * is worse than one that stops, because the budget makes "still there" look
 * exactly like "deliberately kept".
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { colorMap } = await import(join(ROOT, 'apps/mobile/theme/color-map.ts'));

const args = process.argv.slice(2);
const write = args.includes('--write');
const target = args.find((a) => !a.startsWith('--'));
if (!target) {
  console.error('usage: migrate-colors.mjs <dir-or-file> [--write]');
  process.exit(1);
}

/** `color: '#0b1f3a'` / `backgroundColor: "#FFF"` inside a style object. */
const PAIR = /(\b\w*[Cc]olor)(\s*:\s*)'(#[0-9a-fA-F]{3,8})'/g;
const PAIR_DQ = /(\b\w*[Cc]olor)(\s*:\s*)"(#[0-9a-fA-F]{3,8})"/g;

/**
 * JSX attributes: `<ActivityIndicator color="#0B1F3A" />`,
 * `placeholderTextColor="#8A95A5"`.
 *
 * A separate pattern because the replacement differs — an attribute needs a
 * JSX expression container (`color={colors.foreground}`), not a bare
 * identifier. Missing this shape left 20 colours behind in the first directory
 * migrated, all of them spinner tints, which is precisely the kind of thing
 * that looks migrated at a glance.
 */
const ATTR = /(\b\w*[Cc]olor)=("|')(#[0-9a-fA-F]{3,8})\2/g;

function filesUnder(p) {
  if (statSync(p).isFile()) return [p];
  return readdirSync(p).flatMap((n) => {
    const full = join(p, n);
    return statSync(full).isDirectory()
      ? filesUnder(full)
      : /\.tsx?$/.test(n)
        ? [full]
        : [];
  });
}

/**
 * Relative specifier from a file to apps/mobile/theme.
 *
 * Computed rather than hardcoded: these files sit at different depths
 * (`app/event/[id]/index.tsx` vs `components/foo/Bar.tsx`) and a wrong depth
 * fails at bundle time, long after this script has reported success.
 */
function themeSpecifier(file) {
  const rel = relative(dirname(resolve(file)), resolve(ROOT, 'apps/mobile/theme'));
  return rel.startsWith('.') ? rel : './' + rel;
}

const unmapped = new Map();
let changedFiles = 0;
let changedPairs = 0;

for (const file of filesUnder(resolve(target))) {
  const src = readFileSync(file, 'utf8');
  const used = new Set();
  let hits = 0;

  /** `kind` decides how the token is spliced back in: style entry vs JSX attribute. */
  const apply = (text, re, kind) =>
    text.replace(re, (whole, prop, mid, hex) => {
      const entry = colorMap[prop]?.[hex.toLowerCase()];
      if (!entry || entry.token === '(unmapped)') {
        const key = `${prop} ${hex.toLowerCase()}`;
        unmapped.set(key, (unmapped.get(key) ?? 0) + 1);
        return whole;
      }
      hits += 1;
      used.add(entry.token.split(/[.[]/)[0]); // 'colors' | 'palette'
      return kind === 'attr' ? `${prop}={${entry.token}}` : `${prop}${mid}${entry.token}`;
    });

  let out = apply(apply(apply(src, PAIR, 'style'), PAIR_DQ, 'style'), ATTR, 'attr');
  if (hits === 0) continue;

  // Add or extend the theme import. Only handles the two shapes that actually
  // occur (no existing import, or one importing from the theme already); a file
  // that does not match is reported rather than guessed at.
  const spec = themeSpecifier(file);
  const names = [...used].sort().join(', ');
  const existing = new RegExp(`import \\{([^}]*)\\} from '${spec.replace(/[.*+?^$()|[\]\\]/g, '\\$&')}';`);
  const m = out.match(existing);

  if (m) {
    const have = new Set(m[1].split(',').map((s) => s.trim()).filter(Boolean));
    [...used].forEach((u) => have.add(u));
    out = out.replace(existing, `import { ${[...have].sort().join(', ')} } from '${spec}';`);
  } else {
    // Place it after the last existing import so import order stays sane.
    const imports = [...out.matchAll(/^import .*?;$/gm)];
    if (imports.length === 0) {
      console.warn(`[migrate] SKIP ${relative(ROOT, file)}: no import block to extend`);
      continue;
    }
    const last = imports[imports.length - 1];
    const at = last.index + last[0].length;
    out = out.slice(0, at) + `\nimport { ${names} } from '${spec}';` + out.slice(at);
  }

  if (write) writeFileSync(file, out);
  changedFiles += 1;
  changedPairs += hits;
  console.log(`[migrate] ${write ? 'wrote' : 'would change'} ${relative(ROOT, file)} (${hits})`);
}

console.log(`\n[migrate] ${changedPairs} colour(s) across ${changedFiles} file(s)${write ? '' : ' — dry run, pass --write'}`);

if (unmapped.size) {
  console.log('\n[migrate] LEFT ALONE — no entry in color-map.ts (add one, or keep deliberately):');
  for (const [k, n] of [...unmapped].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${k}`);
  }
}
