/**
 * TopBar — back control, title, optional action.
 *
 * Nine screens declare this block, and the style is byte-identical in all of
 * them: row, centred, space-between, 16 horizontal, 8 vertical. That is not a
 * coincidence worth preserving nine times.
 *
 * The subtle part is CENTRING. Those screens keep the title optically centred
 * with a hand-written `<View style={{ width: 32 }} />` spacer opposite the back
 * button — a magic number that stops being right the moment an action is added
 * on the right, or the back glyph changes size. Here both sides are the same
 * fixed width, so the title is centred by construction.
 */
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { space, type ThemeColors, useThemedStyles } from '../../theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

type Props = {
  title?: string;
  /** Back affordance. Omit for a root screen with no parent. */
  onBack?: () => void;
  /** Announced for the back control. Localise it — do not ship "Back" raw. */
  backLabel?: string;
  /** Optional right-hand action. Kept to one: a top bar is not a toolbar. */
  action?: { icon: string; label: string; onPress: () => void };
  style?: ViewStyle;
  testID?: string;
};

/**
 * Both side slots are pinned to this width so the title sits in the true centre
 * regardless of what each side contains — replacing the `width: 32` spacers.
 */
const SIDE = 44;

export function TopBar({ title, onBack, backLabel = 'Back', action, style, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View testID={testID} style={[styles.bar, style]}>
      <View style={styles.side}>
        {onBack ? (
          <IconButton icon="‹" accessibilityLabel={backLabel} size="lg" onPress={onBack} />
        ) : null}
      </View>

      {title ? (
        <Text variant="bodyStrong" tone="default" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      ) : (
        <View style={styles.title} />
      )}

      <View style={[styles.side, styles.sideRight]}>
        {action ? (
          <IconButton
            icon={action.icon}
            accessibilityLabel={action.label}
            size="lg"
            onPress={action.onPress}
          />
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    backgroundColor: c.background,
  },
  side: { width: SIDE, alignItems: 'flex-start' },
  sideRight: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center' },
});
