import type { ScoringMode } from '@padel/api';
import { useT } from '@padel/i18n';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../../../theme';

export function ScoringPanels({
  mode,
  value,
  onChange,
}: {
  mode?: ScoringMode;
  value: number | null;
  onChange: (v: number) => void;
}) {
  const { t } = useT('event');

  if (mode !== 'points' && mode !== 'time') {
    return null;
  }

  const label = mode === 'points' ? t('pointsValueLabel') : t('timeValueLabel');

  return (
    <View style={styles.panel}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value != null ? String(value) : ''}
        onChangeText={(text) => {
          const parsed = parseInt(text, 10);
          onChange(Number.isNaN(parsed) ? 0 : parsed);
        }}
        keyboardType="number-pad"
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: 16, gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
});
