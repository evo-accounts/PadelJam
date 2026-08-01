import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, palette } from '../../../theme';

/**
 * Kept in step with `apps/web/src/components/event/wizard/SelectableCard.tsx`.
 *
 * The two are separate implementations by design (RN StyleSheet here, Tailwind
 * there) but they render the same thing, so the PROP NAMES have to agree or the
 * two drift into being different components with the same name. This one used
 * to take `description` where web takes `subtitle`; it takes `subtitle` now.
 *
 * `onPress` deliberately does NOT become `onClick`. That one is genuine platform
 * idiom — React Native has no click — and forcing either name onto the other
 * platform would be worse than the mismatch. Data props align; event props
 * follow the platform.
 */
export function SelectableCard({
  title,
  subtitle,
  selected,
  onPress,
  disabled,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.card, selected && styles.cardSelected, disabled && styles.cardDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
    >
      <View style={styles.text}>
        <Text style={[styles.title, selected && styles.titleSelected]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    backgroundColor: colors.card,
  },
  cardSelected: { borderColor: colors.primary, backgroundColor: palette.purple[100] },
  cardDisabled: { opacity: 0.5 },
  text: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: colors.foreground },
  titleSelected: { color: colors.primary },
  subtitle: { fontSize: 13, color: colors.mutedForeground, marginTop: 4 },
});
