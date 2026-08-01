import { useT } from '@padel/i18n';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../theme';

export function CourtCounter({
  value,
  onChange,
  min = 1,
  max = 12,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  const { t } = useT('event');
  const atMin = value <= min;
  const atMax = value >= max;

  const set = (n: number) => onChange(Math.min(max, Math.max(min, n)));

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('courtsLabel')}</Text>
      <View style={styles.row}>
        <Pressable
          style={[styles.button, atMin && styles.buttonDisabled]}
          onPress={() => set(value - 1)}
          disabled={atMin}
          accessibilityRole="button"
          accessibilityLabel="−"
          accessibilityState={{ disabled: atMin }}
        >
          <Text style={styles.buttonLabel}>−</Text>
        </Pressable>
        <Text style={styles.value}>{value}</Text>
        <Pressable
          style={[styles.button, atMax && styles.buttonDisabled]}
          onPress={() => set(value + 1)}
          disabled={atMax}
          accessibilityRole="button"
          accessibilityLabel="+"
          accessibilityState={{ disabled: atMax }}
        >
          <Text style={styles.buttonLabel}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  label: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  row: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  button: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: { fontSize: 24, fontWeight: '700', color: colors.foreground },
  value: { fontSize: 22, fontWeight: '700', color: colors.foreground, minWidth: 32, textAlign: 'center' },
});
