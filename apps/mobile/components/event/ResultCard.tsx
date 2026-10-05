import { useEventResultSummary } from '@padel/api';
import { useT } from '@padel/i18n';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/native';
import { colors } from '../../theme';

/** Presentational standings card, sized for image capture (rendered off-screen by ShareResultsModal). */
export function ResultCard({ eventId, eventName }: { eventId: string; eventName?: string }) {
  const { t } = useT('event');
  const { data: rows } = useEventResultSummary(eventId);
  const placements = rows ?? [];
  return (
    <View style={styles.card}>
      {eventName ? <Text style={styles.event}>{eventName}</Text> : null}
      <Text style={styles.heading}>{t('resultCardHeading')}</Text>
      {placements.length === 0 ? (
        <Text style={styles.row}>—</Text>
      ) : (
        placements.map((r, i) => (
          <Text key={`${r.rank}-${i}`} style={styles.row}>{`${r.rank}.  ${r.name}  ·  ${r.points}`}</Text>
        ))
      )}
      <Text style={styles.footer}>Padel Jam</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 340, backgroundColor: colors.primary, borderRadius: 16, padding: 24, gap: 8 },
  event: { color: colors.mutedForeground, fontSize: 14, fontWeight: '600' },
  heading: { color: colors.card, fontSize: 22, fontWeight: '800', marginBottom: 8 },
  row: { color: colors.foreground, fontSize: 17, fontWeight: '600' },
  footer: { color: colors.mutedForeground, fontSize: 13, fontWeight: '700', marginTop: 16, textAlign: 'right' },
});
