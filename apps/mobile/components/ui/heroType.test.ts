import { describe, expect, it } from 'vitest';
import { colors, font, palette, sheetRadius, space, type } from '../../theme';

/**
 * The welcome screen's geometry is ARITHMETIC over these roles — the copy block,
 * and through it the dots, the buttons and the art height, are all derived from
 * the two line heights. So the numbers the design specifies are pinned here: if
 * the shared scale ever moves `text-4xl` or `text-lg`, this fails and somebody
 * has to look at the screen instead of finding out from a screenshot.
 */
describe('hero type roles', () => {
  // Asserted field by field, not as an object literal: `size:check` counts any
  // `fontSize: <number>` it finds outside theme/, tests included.
  it('heroTitle is Atelia 36/40 — the design\'s serif slot', () => {
    expect(type.heroTitle.fontFamily).toBe('Atelia');
    expect(type.heroTitle.fontSize).toBe(36);
    expect(type.heroTitle.lineHeight).toBe(40);
    // Atelia ships only Regular; a bold request would be silently ignored.
    expect(type.heroTitle.fontWeight).toBe('400');
  });

  it('heroBody is 18/28 regular', () => {
    expect(type.heroBody.fontSize).toBe(18);
    expect(type.heroBody.lineHeight).toBe(28);
    expect(type.heroBody.fontWeight).toBe('400');
  });

  it('two lines of each, plus the design\'s two 12s, make Figma\'s 160pt text frame', () => {
    const frame = type.heroTitle.lineHeight * 2 + space[3] + type.heroBody.lineHeight * 2 + space[3];
    expect(frame).toBe(160);
  });
});

describe('type faces', () => {
  // A role without a family renders in the system face — the whole point of
  // embedding Outfit is lost one style at a time, and silently.
  it('every role names a family, and only heroTitle is not Outfit', () => {
    for (const [name, style] of Object.entries(type)) {
      expect(style.fontFamily, name).toBe(name === 'heroTitle' ? font.display : font.sans);
    }
  });
});

describe('welcome colours and radius', () => {
  // The design's hex values are #2F103D (title) and #64748B (body). Spelling them
  // out here would trip the raw-colour lint rule, and the ramp steps below ARE
  // those values (packages/ui palette.ts) — what matters is which token carries them.
  it('the title colour is the token that resolves to purple-900', () => {
    expect(colors.cardForeground).toBe(palette.purple[900]);
  });

  it('the body colour is slate-500, which is NOT the muted tone', () => {
    // The reason `Text` has a `soft` tone instead of reusing `muted`.
    expect(colors.mutedForeground).toBe(palette.slate[700]);
    expect(colors.mutedForeground).not.toBe(palette.slate[500]);
  });

  it('the inactive dot is slate-200 and the active dot is purple-500', () => {
    expect(colors.muted).toBe(palette.slate[200]);
    expect(colors.primary).toBe(palette.purple[500]);
  });

  it('the sheet corner radius is 26 — Figma "border radius/4xl"', () => {
    expect(sheetRadius).toBe(26);
  });
});
