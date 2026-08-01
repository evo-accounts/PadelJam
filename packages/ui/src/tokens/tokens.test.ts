import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { RADIUS_BASE_PX, radius } from './radius.ts';
import { SPACE_STEP_PX, space, text, weight } from './scale.ts';
import { dark, light } from './semantic.ts';
import { palette } from './palette.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');

/**
 * The radii exist twice by necessity: as `calc()` in CSS, which web resolves at
 * run time, and as pre-computed numbers here, because React Native has no
 * `calc`. Two representations of one decision drift unless something checks
 * them — so this parses the actual `calc()` expressions out of globals.css and
 * evaluates them against the same base.
 */
describe('radius parity with the web calc() steps', () => {
  const css = readFileSync(GLOBALS, 'utf8');

  const calcFor = (name: string): number => {
    const line = css.match(new RegExp(`--radius-${name}:\\s*([^;]+);`));
    if (!line?.[1]) throw new Error(`--radius-${name} not found in globals.css`);
    const expr = line[1].trim();
    if (expr === 'var(--radius)') return RADIUS_BASE_PX;
    const m = expr.match(/calc\(var\(--radius\)\s*([+-])\s*(\d+)px\)/);
    if (!m) throw new Error(`unrecognised radius expression: ${expr}`);
    return m[1] === '+' ? RADIUS_BASE_PX + Number(m[2]) : RADIUS_BASE_PX - Number(m[2]);
  };

  it.each([
    ['sm', radius.sm],
    ['md', radius.md],
    ['lg', radius.lg],
    ['xl', radius.xl],
  ])('--radius-%s matches the TypeScript value', (name, ours) => {
    expect(calcFor(name)).toBe(ours);
  });

  it('the base matches --radius in the stylesheet', () => {
    // 0.625rem at the 16px root = 10px. If someone changes --radius, this fails
    // rather than letting mobile keep the old number.
    const m = readFileSync(GLOBALS, 'utf8').match(/--radius:\s*([\d.]+)rem;/)
      ?? readFileSync(join(ROOT, 'apps/web/src/app/tokens.generated.css'), 'utf8').match(/--radius:\s*([\d.]+)rem;/);
    expect(m?.[1]).toBeDefined();
    expect(Number(m![1]) * 16).toBe(RADIUS_BASE_PX);
  });
});

describe('scales are self-consistent', () => {
  it('every spacing step is a multiple of the base', () => {
    for (const [step, px] of Object.entries(space)) {
      expect(px).toBe(Number(step) * SPACE_STEP_PX);
    }
  });

  it('line heights are at least the font size', () => {
    for (const [name, t] of Object.entries(text)) {
      expect(t.lineHeight, `text.${name}`).toBeGreaterThanOrEqual(t.size);
    }
  });

  it('font sizes increase monotonically', () => {
    const sizes = Object.values(text).map((t) => t.size);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });

  it('weights are React Native string literals, not numbers', () => {
    // RN's fontWeight prop rejects a bare number in its TS types; passing 700
    // instead of '700' fails to typecheck at every call site.
    for (const w of Object.values(weight)) expect(typeof w).toBe('string');
  });
});

describe('semantic tokens resolve to real palette values', () => {
  const known = new Set<string>();
  for (const v of Object.values(palette)) {
    if (typeof v === 'string') known.add(v);
    else for (const stop of Object.values(v)) known.add(stop);
  }

  it.each([
    ['light', light],
    ['dark', dark],
  ])('%s uses only palette colours (or explicit rgba)', (_name, scheme) => {
    for (const [token, value] of Object.entries(scheme)) {
      if (value.startsWith('rgba(')) continue; // the two deliberate alpha values
      expect(known, `${token} = ${value} is not in the palette`).toContain(value);
    }
  });
});
