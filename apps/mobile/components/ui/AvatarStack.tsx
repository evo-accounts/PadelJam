/**
 * AvatarStack — overlapping avatars followed by a count, on one line (UX-GLOB-04, UX-GRP-02/04).
 *
 * The avatars are decorative: the count text beside them is what a screen reader announces,
 * and the whole stack is one accessible element when it is tappable, so VoiceOver reads
 * "12 players, button" rather than a dozen names.
 */
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, space } from '../../theme';
import { Avatar, type AvatarSize } from './Avatar';
import { Text } from './Text';

export type AvatarStackPerson = {
  id: string;
  name: string | null;
  uri: string | null;
};

type Props = {
  people: AvatarStackPerson[];
  /** The text after the avatars, e.g. "12 players". Also the accessibility label. */
  countLabel: string;
  /** How many avatars to draw before the count takes over. */
  max?: number;
  size?: AvatarSize;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
};

const OVERLAP: Record<AvatarSize, number> = { xs: 8, sm: 10, md: 12, lg: 16, xl: 20 };

export function AvatarStack({ people, countLabel, max = 5, size = 'sm', onPress, style, testID }: Props) {
  const shown = people.slice(0, max);
  const body = (
    <>
      <View style={styles.avatars}>
        {shown.map((p, i) => (
          <Avatar
            key={p.id}
            uri={p.uri}
            name={p.name}
            colourKey={p.id}
            size={size}
            decorative
            style={i > 0 ? { ...styles.ring, marginLeft: -OVERLAP[size] } : styles.ring}
          />
        ))}
      </View>
      <Text variant="caption" tone="muted" style={shown.length > 0 ? styles.count : undefined}>
        {countLabel}
      </Text>
    </>
  );

  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={countLabel}
      style={[styles.row, style]}
      testID={testID}
    >
      {body}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={countLabel} style={[styles.row, style]} testID={testID}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  avatars: { flexDirection: 'row' },
  // A ring in the page colour separates each avatar from the one it overlaps.
  ring: { borderWidth: 2, borderColor: colors.background },
  count: { marginLeft: space[2] },
});
