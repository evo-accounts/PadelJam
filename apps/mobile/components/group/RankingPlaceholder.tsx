import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';
import { colors, palette } from '../../theme';

/** Empty-state card shown before any events have been played in a group. */
export function RankingPlaceholder() {
  const { t } = useT('group');
  return (
    <View style={styles.card}>
      <Text style={styles.icon}>🏆</Text>
      <Text style={styles.text}>{t('rankingPlaceholder')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 8,
  },
  icon: { fontSize: 32 },
  text: { fontSize: 14, color: palette.slate[400], textAlign: 'center' },
});
