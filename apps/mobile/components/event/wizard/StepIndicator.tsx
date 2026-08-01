import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';
import { colors, palette } from '../../../theme';

export function StepIndicator({ stepIndex, total }: { stepIndex: number; total: number }) {
  const { t } = useT('event');
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('stepProgress', { current: stepIndex + 1, total })}</Text>
      <View style={styles.dots}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={`dot-${i}`}
            style={[styles.dot, i === stepIndex ? styles.dotActive : styles.dotInactive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.foreground },
  dots: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 6 },
  dotActive: { backgroundColor: colors.primary },
  dotInactive: { backgroundColor: palette.slate[300] },
});
