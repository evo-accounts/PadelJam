/**
 * ListRow — leading slot, title, subtitle, trailing slot.
 *
 * 31 files declare a `row:` style. They fall into exactly two shapes, so this
 * takes a variant rather than pretending they are one thing:
 *
 *   `card`    a rounded surface with its own margins, floating on the page
 *             (notifications) — separated by GAPS
 *   `plain`   a flat row with a hairline underneath (chat channels) — separated
 *             by RULES
 *
 * Mixing them in one list is what makes a screen feel unfinished, so the choice
 * is explicit at the call site instead of emerging from whichever file was
 * copied.
 */
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, space } from '../../theme';
import { Text } from './Text';

export type ListRowVariant = 'card' | 'plain';

type Props = {
  title: string;
  subtitle?: string;
  /** Avatar, icon, or anything else that leads the row. */
  leading?: React.ReactNode;
  /** Badge, chevron, timestamp. */
  trailing?: React.ReactNode;
  variant?: ListRowVariant;
  /**
   * Tone for the title. `destructive` exists for the one row every settings
   * list has — "Delete account" — which was otherwise the single hand-rolled
   * Pressable sitting among nine ListRows, i.e. exactly the drift this
   * component prevents everywhere else.
   */
  titleTone?: 'default' | 'destructive';
  /** Draws attention without colour alone — pairs with an accessibilityValue. */
  highlighted?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
};

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  variant = 'plain',
  titleTone = 'default',
  highlighted = false,
  onPress,
  style,
  testID,
}: Props) {
  const body = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.text}>
        <Text variant="bodyStrong" tone={titleTone} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </>
  );

  const surface = [
    styles.base,
    variant === 'card' ? styles.card : styles.plain,
    highlighted && styles.highlighted,
    style,
  ];

  if (!onPress) {
    return (
      <View testID={testID} style={surface}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={({ pressed }) => [...surface, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: colors.card,
  },
  card: {
    marginHorizontal: space[3],
    marginBottom: space[2],
    borderRadius: radius.lg,
    padding: space[4],
  },
  plain: {
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    // hairlineWidth, not 1: on a 3x screen a 1pt rule is three device pixels and
    // reads as a heavy line rather than a separator.
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.muted,
  },
  highlighted: { backgroundColor: colors.accent },
  leading: { justifyContent: 'center' },
  text: { flex: 1 },
  subtitle: { marginTop: 2 },
  trailing: { justifyContent: 'center' },
  pressed: { opacity: 0.85 },
});
