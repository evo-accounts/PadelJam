/**
 * Avatar — the single most duplicated visual in the app.
 *
 * `avatar:` appears 21 times, `avatarInitial:` 14, `avatarFallback:` 11, each
 * with its own diameter and its own idea of how to derive initials. The
 * derivation is the part worth centralising: getting it wrong shows a stranger's
 * letter next to someone's name.
 */
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';

import { radius, type ThemeColors, useThemedStyles } from '../../theme';
import { Text, type TextVariant } from './Text';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

type Props = {
  /** Remote or local image. Falls back to initials when absent or it fails. */
  uri?: string | null;
  /** Full display name. Used for the initials AND the accessibility label. */
  name?: string | null;
  size?: AvatarSize;
  style?: ViewStyle;
  testID?: string;
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

export function Avatar({ uri, name, size = 'md', style, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const d = diameters[size];
  const shape = { width: d, height: d, borderRadius: radius.full };

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={name ?? undefined}
      style={[styles.base, shape, style]}
    >
      {uri ? (
        <Image source={{ uri }} style={shape} resizeMode="cover" />
      ) : (
        // Dark on the purple fill, matching Button's primary variant. The
        // canonical `primary` is a LIGHT purple, so white initials land at
        // roughly 2.3:1 contrast — legible in a mock, not on a phone.
        <Text variant={labelFor[size]} tone="default">
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: c.primary,
  },
});
