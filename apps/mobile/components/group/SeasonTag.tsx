import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';

/** Small pill rendering the current season number, e.g. "Season 2". */
export function SeasonTag({ number }: { number: number }) {
  const { t } = useT('group');
  return (
    <View style={styles.pill}>
      <Text style={styles.text}>{t('seasonTag', { number })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: '#EEF2F7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 13, fontWeight: '600', color: '#3A4A60' },
});
