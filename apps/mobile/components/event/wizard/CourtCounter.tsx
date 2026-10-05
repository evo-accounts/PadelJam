import { useT } from '@padel/i18n';
import { COURTS_MAX, COURTS_MIN } from '@padel/utils';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/native';
import { colors } from '../../../theme';
import { IconButton } from '../../../components/ui';

export function CourtCounter({
  value,
  onChange,
  min = COURTS_MIN,
  // Requirements: 1–20 courts (decision 9). Was 12.
  max = COURTS_MAX,
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
        <IconButton
          icon="−"
          accessibilityLabel={t('decreaseValueLabel', { label: t('courtsLabel') })}
          size="lg"
          filled
          disabled={atMin}
          onPress={() => set(value - 1)}
        />
        <Text style={styles.value}>{value}</Text>
        <IconButton
          icon="+"
          accessibilityLabel={t('increaseValueLabel', { label: t('courtsLabel') })}
          size="lg"
          filled
          disabled={atMax}
          onPress={() => set(value + 1)}
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
