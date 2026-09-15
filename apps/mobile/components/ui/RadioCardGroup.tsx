/**
 * RadioCardGroup — a vertical list of mutually exclusive options, each a card
 * with a title, a supporting line and a radio dot.
 *
 * Promoted from `components/community/PrivacyCards`, which hard-coded the three
 * privacy values. The same card-with-a-dot shape is what the community create
 * and settings screens both needed, and what UX-COMM-05 asks for again on the
 * preview screen, so it stops being a community-only component here.
 *
 * Each card keeps `accessibilityRole="radio"` plus `accessibilityState.selected`
 * and its visible title, which is how the end-to-end suites select one.
 */
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, space } from '../../theme';
import { Text } from './Text';

export type RadioCardOption<T extends string> = {
  value: T;
  title: string;
  description?: string;
};

type Props<T extends string> = {
  options: readonly RadioCardOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** LAYOUT only — margins and alignment. */
  style?: ViewStyle;
  testID?: string;
};

export function RadioCardGroup<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  style,
  testID,
}: Props<T>) {
  return (
    <View style={[styles.list, style]} testID={testID}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[styles.card, selected && styles.cardSelected]}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            testID={testID ? `${testID}-${option.value}` : undefined}
          >
            <View style={[styles.radio, selected && styles.radioSelected]} />
            <View style={styles.text}>
              <Text variant="label">{option.title}</Text>
              {option.description ? (
                <Text variant="hint" tone="muted" style={styles.description}>
                  {option.description}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const RADIO = 20;

const styles = StyleSheet.create({
  list: { gap: space[2] },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space[3],
    backgroundColor: colors.card,
  },
  cardSelected: { borderColor: colors.foreground, backgroundColor: colors.background },
  radio: {
    width: RADIO,
    height: RADIO,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: space[3],
  },
  // A 6pt border on a 20pt circle leaves an 8pt core — the filled look, without
  // a second view to position inside it.
  radioSelected: { borderColor: colors.foreground, borderWidth: 6 },
  text: { flex: 1 },
  description: { marginTop: space[1] },
});
