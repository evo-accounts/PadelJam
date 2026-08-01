/**
 * Badge — a STATIC status label. Not pressable, ever.
 *
 * Badge and Chip are deliberately two components rather than one with an
 * `onPress?`. Today's ~30 pill-shaped blocks conflate them, which is how a
 * filter ends up looking like a status and a status ends up looking tappable.
 * The split is the point: if it responds to touch it is a {@link Chip}.
 */
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, palette, radius, space } from '../../theme';
import { Text, type TextTone } from './Text';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'info';

type Props = {
  label: string;
  tone?: BadgeTone;
  style?: ViewStyle;
  testID?: string;
};

/**
 * Tinted background with a readable foreground.
 *
 * The tints come from the 100-step of each ramp rather than from an opacity on
 * the solid colour: translucent fills change appearance depending on what is
 * behind them, which is exactly the inconsistency this replaces.
 */
const tones: Record<BadgeTone, { bg: string; text: TextTone }> = {
  neutral: { bg: colors.muted, text: 'muted' },
  primary: { bg: palette.purple[100], text: 'default' },
  success: { bg: palette.green[100], text: 'success' },
  warning: { bg: palette.yellow[100], text: 'default' },
  destructive: { bg: palette.red[100], text: 'destructive' },
  info: { bg: palette.sky[100], text: 'default' },
};

export function Badge({ label, tone = 'neutral', style, testID }: Props) {
  const t = tones[tone];
  return (
    <View testID={testID} style={[styles.base, { backgroundColor: t.bg }, style]}>
      <Text variant="hint" tone={t.text}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
  },
});
