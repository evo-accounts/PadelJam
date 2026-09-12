import { avatarRamp } from '../../theme';

export const AVATAR_COLOURS: readonly string[] = avatarRamp;

/** Deterministic colour for an id (or name when no id exists). */
export function avatarColour(key: string | null | undefined): string {
  if (!key) return AVATAR_COLOURS[0]!;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return AVATAR_COLOURS[h % AVATAR_COLOURS.length]!;
}

/** WCAG contrast ratio between two hex colours. Kept here so the palette is tested, not trusted. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.replace('#', ''), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const [l1, l2] = [lum(hexA), lum(hexB)].sort((a, b) => b - a);
  return (l1! + 0.05) / (l2! + 0.05);
}
