import { describe, expect, it } from 'vitest';
import { colors } from '../../theme';
import { AVATAR_COLOURS, avatarColour, contrastRatio } from './avatarColour';

describe('avatarColour', () => {
  it('is deterministic per key', () => {
    expect(avatarColour('user-1')).toBe(avatarColour('user-1'));
  });
  it('spreads different keys across the palette', () => {
    const picks = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map(avatarColour));
    expect(picks.size).toBeGreaterThan(3);
  });
  it('falls back to the first colour without a key', () => {
    expect(avatarColour(null)).toBe(AVATAR_COLOURS[0]);
  });
  it('every colour carries white text at 4.5:1 or better', () => {
    // colors.card is `palette.white` (#ffffff) in the light theme — Text's
    // `inverse` tone, which is what Avatar renders initials with. Using the
    // token rather than a raw hex literal keeps this file inside the
    // no-restricted-syntax rule that forbids spelling out colours outside
    // apps/mobile/theme.
    for (const c of AVATAR_COLOURS) expect(contrastRatio(c, colors.card), c).toBeGreaterThanOrEqual(4.5);
  });
});
