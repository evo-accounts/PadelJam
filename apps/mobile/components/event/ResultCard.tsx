import { useEventResultSummary } from '@padel/api';
import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';

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
        placements.map((r) => (
          <Text key={r.rank} style={styles.row}>{`${r.rank}.  ${r.name}  ·  ${r.points}`}</Text>
        ))
      )}
      <Text style={styles.footer}>Padel Jam</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 340, backgroundColor: '#0B1F3A', borderRadius: 16, padding: 24, gap: 8 },
  event: { color: '#9DB6E0', fontSize: 14, fontWeight: '600' },
  heading: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  row: { color: '#EAF2FF', fontSize: 17, fontWeight: '600' },
  footer: { color: '#5A7AB0', fontSize: 13, fontWeight: '700', marginTop: 16, textAlign: 'right' },
});
