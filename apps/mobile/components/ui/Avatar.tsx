/**
 * Avatar — the single most duplicated visual in the app.
 *
 * `avatar:` appears 21 times, `avatarInitial:` 14, `avatarFallback:` 11, each
 * with its own diameter and its own idea of how to derive initials. The
 * derivation is the part worth centralising: getting it wrong shows a stranger's
 * letter next to someone's name.
 */
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';

import { radius } from '../../theme';
import { avatarColour } from './avatarColour';
import { Text, type TextVariant } from './Text';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

type Props = {
  /** Remote or local image. Falls back to initials when absent or it fails. */
  uri?: string | null;
  /** Full display name. Used for the initials AND the accessibility label. */
  name?: string | null;
  /** user id; falls back to `name` */
  colourKey?: string | null;
  size?: AvatarSize;
  style?: ViewStyle;
  testID?: string;
  /**
   * Hides the avatar from assistive tech instead of announcing "image, <name>".
   *
   * Use it whenever a name is rendered next to the avatar — the visible name is
   * already the accessible text, so the avatar's own label would double-announce
   * it. Leave it off when the avatar is the only representation of the person
   * (an avatar stack, the own-profile picture picker) — there it needs its own
   * accessible label.
   */
  decorative?: boolean;
};

const diameters: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
};

const labelFor: Record<AvatarSize, TextVariant> = {
  xs: 'hint',
  sm: 'caption',
  md: 'label',
  lg: 'sectionTitle',
  xl: 'title',
};

/**
 * First letter of the first and last word — "Ana Paula Silva" -> "AS".
 *
 * Deliberately NOT `name.slice(0, 2)`, which yields "AN" and reads as a
 * different person. Uses the spread operator rather than charAt so that names
 * beginning with an emoji or a non-BMP character take the whole glyph instead of
 * half a surrogate pair, which renders as a replacement box.
 */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = [...(words[0] ?? '')][0] ?? '';
  const last = words.length > 1 ? ([...(words[words.length - 1] ?? '')][0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function Avatar({ uri, name, colourKey, size = 'md', style, testID, decorative }: Props) {
  const d = diameters[size];
  const shape = { width: d, height: d, borderRadius: radius.full };

  return (
    <View
      testID={testID}
      {...(decorative
        ? { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }
        : { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: name ?? undefined })}
      style={[styles.base, shape, !uri && { backgroundColor: avatarColour(colourKey ?? name) }, style]}
    >
      {uri ? (
        <Image source={{ uri }} style={shape} resizeMode="cover" />
      ) : (
        <Text variant={labelFor[size]} tone="inverse">
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
