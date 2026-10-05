import { useT } from '@padel/i18n';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/native';
import { colors } from '../../../theme';
import { IconButton } from '../../../components/ui';

export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  const { t } = useT('event');
  const atMin = value <= min;
  const atMax = value >= max;

  const set = (n: number) => onChange(Math.min(max, Math.max(min, n)));

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <IconButton
          icon="−"
          accessibilityLabel={t('decreaseValueLabel', { label })}
          size="lg"
          filled
          disabled={atMin}
          onPress={() => set(value - step)}
        />
        <Text style={styles.value}>{value}</Text>
        <IconButton
          icon="+"
          accessibilityLabel={t('increaseValueLabel', { label })}
          size="lg"
          filled
          disabled={atMax}
          onPress={() => set(value + step)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  label: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  row: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  value: { fontSize: 22, fontWeight: '700', color: colors.foreground, minWidth: 32, textAlign: 'center' },
});
